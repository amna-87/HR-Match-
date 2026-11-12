// Email tests: throttling, frequency, opt-out, unsubscribe, retries, and the
// rule that only account emails of claimed candidates are ever used.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";
import { runNotifier, deliverPendingEmails } from "@/lib/email/notifier";
import { ConsoleSender, TransientEmailError, type EmailSender } from "@/lib/email/sender";
import { NOTIFY_CONFIG } from "@/lib/matching/config";
import { verifyToken } from "@/lib/consent/tokens";

let db: TestDb;
let maya: string;
let sender: ConsoleSender;

const suggest = (jobId: string, candidateId: string, score = 90) =>
  db.service("select upsert_match($1, $2, $3, '{}', 'Matched on: test.', false)", [jobId, candidateId, score]);

const extraJob = async (title: string) =>
  (
    await db.root<{ id: string }>(
      "insert into jobs(company_id, title, work_mode, status) values ($1, $2, 'remote', 'published') returning id",
      [IDS.acme, title],
    )
  ).rows[0].id;

beforeAll(async () => {
  db = await createTestDb("notifier");
  maya = await db.candidateId(IDS.maya);
  // a contact email parsed from the resume that must NEVER be emailed
  await db.root("update candidates set contact_email = 'from-resume@example.test' where id = $1", [maya]);
});
beforeEach(() => {
  sender = new ConsoleSender(true);
});
afterAll(async () => db?.close());

describe("notify step", () => {
  it("sends one digest to the account email, marks matches notified, writes in-app notices", async () => {
    await suggest(IDS.jobSocial, maya);
    await suggest(IDS.jobSourced, maya, 80);
    await suggest(IDS.jobBackend, maya, 50); // below threshold: not notified
    const r = await runNotifier({ db: db.pool, sender });
    expect(r.matchesNotified).toBe(2);
    expect(sender.sent).toHaveLength(1);
    const email = sender.sent[0];
    expect(email.to).toBe("maya@example.test");
    expect(email.to).not.toBe("from-resume@example.test");
    expect(email.text).toMatch(/Approve: http:\/\/localhost:3000\/m\//);
    expect(email.text).toMatch(/sourced from Northwind careers page; apply via the original listing/);
    expect(email.text).toMatch(/Unsubscribe: http:\/\/localhost:3000\/unsubscribe\//);
    expect(email.headers?.["List-Unsubscribe"]).toMatch(/unsubscribe/);
    const statuses = await db.root(
      "select j.title, m.status from matches m join jobs j on j.id = m.job_id where m.candidate_id = $1",
      [maya],
    );
    const byTitle = Object.fromEntries(statuses.rows.map((s) => [s.title, s.status]));
    expect(byTitle["Social Media Marketing Manager"]).toBe("notified");
    expect(byTitle["Content Writer"]).toBe("notified");
    expect(byTitle["Senior Backend Engineer (TypeScript)"]).toBe("suggested");
    const inApp = await db.as(IDS.maya)("select count(*)::int n from notifications where type = 'match'");
    expect(inApp.rows[0].n).toBe(2);
  });

  it("the approve link is a valid, expiring, single-purpose token for that match", async () => {
    const link = sender.sent[0]?.text ?? "";
    expect(link).toBe(""); // fresh sender; re-run is a no-op
    const again = await runNotifier({ db: db.pool, sender });
    expect(again.matchesNotified).toBe(0);
    expect(sender.sent).toHaveLength(0); // idempotent: no duplicate email
  });

  it("verifies tokens embedded in the email", async () => {
    const job = await extraJob("Paid Social Specialist");
    await suggest(job, maya);
    await db.root("delete from notifications where type = 'match_digest'"); // reset throttle for this check
    await runNotifier({ db: db.pool, sender });
    const url = sender.sent[0].text.match(/Approve: \S+\/m\/(\S+)/)![1];
    const v = verifyToken(url, ["match_approve"]);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.c).toBe(maya);
      const m = await db.root("select expires_at from matches where id = $1", [v.payload.s]);
      expect(Math.abs(new Date(m.rows[0].expires_at).getTime() / 1000 - v.payload.e)).toBeLessThan(2);
    }
  });

  it("respects the weekly cap: extra matches wait as 'suggested'", async () => {
    await db.root("delete from notifications where type = 'match_digest'");
    for (let i = 0; i < NOTIFY_CONFIG.maxEmailsPerWeek; i++) {
      await db.root(
        "insert into notifications(user_id, type, channel, delivery_status, sent_at) values ($1, 'match_digest', 'email', 'sent', now())",
        [IDS.maya],
      );
    }
    const job = await extraJob("Community Manager");
    await suggest(job, maya);
    const r = await runNotifier({ db: db.pool, sender });
    expect(r.throttled).toBe(1);
    expect(sender.sent).toHaveLength(0);
    expect((await db.root("select status from matches where job_id = $1", [job])).rows[0].status).toBe("suggested");
    // a week later, it goes out
    await db.root("update notifications set created_at = now() - interval '8 days' where type = 'match_digest'");
    const r2 = await runNotifier({ db: db.pool, sender });
    expect(r2.matchesNotified).toBe(1);
  });

  it("respects the daily frequency preference", async () => {
    await db.root("update candidates set match_email_frequency = 'daily' where id = $1", [maya]);
    const job = await extraJob("Brand Manager");
    await suggest(job, maya);
    const r = await runNotifier({ db: db.pool, sender });
    expect(r.throttled).toBe(1);
    await db.root(
      "update notifications set created_at = now() - interval '25 hours' where type = 'match_digest' and created_at > now() - interval '1 hour'",
    );
    expect((await runNotifier({ db: db.pool, sender })).matchesNotified).toBe(1);
    await db.root("update candidates set match_email_frequency = 'instant' where id = $1", [maya]);
  });

  it("with match emails off, candidates get in-app notices only", async () => {
    const jordan = await db.candidateId(IDS.jordan);
    await db.root("update candidates set match_emails_enabled = false where id = $1", [jordan]);
    await suggest(IDS.jobSocial, jordan);
    const r = await runNotifier({ db: db.pool, sender });
    expect(r.matchesNotified).toBe(1);
    expect(sender.sent.filter((e) => e.to === "jordan@example.test")).toHaveLength(0);
    const inApp = await db.as(IDS.jordan)("select count(*)::int n from notifications");
    expect(inApp.rows[0].n).toBe(1);
  });

  it("never notifies or emails unclaimed profiles", async () => {
    await suggest(IDS.jobSocial, IDS.unclaimedCandidate);
    await runNotifier({ db: db.pool, sender });
    expect(sender.sent.find((e) => e.to === "imported@example.test")).toBeUndefined();
    const m = await db.root("select status from matches where candidate_id = $1", [IDS.unclaimedCandidate]);
    expect(m.rows[0].status).toBe("suggested");
  });

  it("unsubscribe turns emails off and records consent; queued emails are skipped", async () => {
    const priya = await db.candidateId(IDS.priya);
    await db.root(
      "insert into notifications(user_id, type, channel, payload, delivery_status) values ($1, 'redistribution_offer', 'email', $2, 'pending')",
      [IDS.priya, JSON.stringify({ source_label: "x", job_title: "y", domains: ["content"], strengths: [] })],
    );
    await db.service("select unsubscribe_candidate($1)", [priya]);
    await deliverPendingEmails({ db: db.pool, sender });
    expect(sender.sent.find((e) => e.to === "priya@example.test")).toBeUndefined();
    const n = await db.root("select delivery_status from notifications where user_id = $1 and channel = 'email'", [
      IDS.priya,
    ]);
    expect(n.rows[0].delivery_status).toBe("skipped");
    const ce = await db.root(
      "select count(*)::int n from consent_events where candidate_id = $1 and type = 'match_emails_unsubscribe'",
      [priya],
    );
    expect(ce.rows[0].n).toBe(1);
  });
});

describe("delivery retries", () => {
  it("retries transient failures and records the failure after max attempts", async () => {
    let calls = 0;
    const flaky: EmailSender = {
      async send() {
        calls++;
        throw new TransientEmailError("503 upstream");
      },
    };
    const sam = await db.candidateId(IDS.sam);
    await suggest(IDS.jobBackend, sam);
    const r = await runNotifier({ db: db.pool, sender: flaky });
    expect(r.emailsFailed).toBe(1);
    expect(calls).toBe(NOTIFY_CONFIG.maxAttempts);
    const n = await db.root(
      "select delivery_status, attempts, last_error from notifications where user_id = $1 and channel = 'email'",
      [IDS.sam],
    );
    expect(n.rows[0]).toMatchObject({ delivery_status: "failed", attempts: NOTIFY_CONFIG.maxAttempts });
    // not retried forever
    await deliverPendingEmails({ db: db.pool, sender: flaky });
    expect(calls).toBe(NOTIFY_CONFIG.maxAttempts);
  });

  it("succeeds after a transient failure", async () => {
    let calls = 0;
    const once: EmailSender = {
      async send() {
        calls++;
        if (calls === 1) throw new TransientEmailError("timeout");
        return { id: "msg_123" };
      },
    };
    const lena = await db.candidateId(IDS.lena);
    await suggest(IDS.jobAccountant, lena);
    const r = await runNotifier({ db: db.pool, sender: once });
    expect(r.emailsSent).toBe(1);
    const n = await db.root(
      "select delivery_status, provider_message_id, attempts from notifications where user_id = $1 and channel = 'email'",
      [IDS.lena],
    );
    expect(n.rows[0]).toMatchObject({ delivery_status: "sent", provider_message_id: "msg_123", attempts: 2 });
  });
});
