// Consent rules (Section 8 + 14): no application without an approved consent
// event; declined matches never re-notify; sourced jobs never get applications.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, suggestAndNotify, type TestDb } from "../helpers/db";

let db: TestDb;
let maya: string, jordan: string, priya: string, grace: string;

beforeAll(async () => {
  db = await createTestDb("consent");
  [maya, jordan, priya, grace] = await Promise.all(
    [IDS.maya, IDS.jordan, IDS.priya, IDS.grace].map((u) => db.candidateId(u)),
  );
});
afterAll(async () => db?.close());

const countApps = async (candidateId: string) =>
  (await db.root<{ n: number }>("select count(*)::int n from applications where candidate_id = $1", [candidateId]))
    .rows[0].n;

describe("applications require approval", () => {
  it("nobody can insert an application directly through the API", async () => {
    const ce = await db.root<{ id: string }>(
      "insert into consent_events(candidate_id, type, subject_type, subject_id, granted) values ($1, 'match_approval', 'job', $2, true) returning id",
      [jordan, IDS.jobSocial],
    );
    for (const who of [IDS.rita, IDS.jordan, IDS.admin]) {
      await expect(
        db.as(who)("insert into applications(job_id, candidate_id, consent_event_id) values ($1, $2, $3)", [
          IDS.jobSocial,
          jordan,
          ce.rows[0].id,
        ]),
      ).rejects.toThrow(/permission denied|row-level security/);
    }
  });

  it("even the service role cannot create an application without a granted consent event", async () => {
    const decline = await db.root<{ id: string }>(
      "insert into consent_events(candidate_id, type, subject_type, subject_id, granted) values ($1, 'match_decline', 'job', $2, false) returning id",
      [jordan, IDS.jobSocial],
    );
    await expect(
      db.service("insert into applications(job_id, candidate_id, consent_event_id) values ($1, $2, $3)", [
        IDS.jobSocial,
        jordan,
        decline.rows[0].id,
      ]),
    ).rejects.toThrow(/approved consent event/);
    await expect(
      db.service(
        "insert into applications(job_id, candidate_id, consent_event_id) values ($1, $2, gen_random_uuid())",
        [IDS.jobSocial, jordan],
      ),
    ).rejects.toThrow();
  });

  it("a consent event from another candidate or for another subject does not count", async () => {
    const other = await db.root<{ id: string }>(
      "insert into consent_events(candidate_id, type, subject_type, subject_id, granted) values ($1, 'match_approval', 'job', $2, true) returning id",
      [priya, IDS.jobSocial],
    );
    await expect(
      db.service("insert into applications(job_id, candidate_id, consent_event_id) values ($1, $2, $3)", [
        IDS.jobSocial,
        jordan,
        other.rows[0].id,
      ]),
    ).rejects.toThrow(/approved consent event/);
    const wrongJob = await db.root<{ id: string }>(
      "insert into consent_events(candidate_id, type, subject_type, subject_id, granted) values ($1, 'match_approval', 'job', $2, true) returning id",
      [jordan, IDS.jobBackend],
    );
    await expect(
      db.service("insert into applications(job_id, candidate_id, consent_event_id) values ($1, $2, $3)", [
        IDS.jobSocial,
        jordan,
        wrongJob.rows[0].id,
      ]),
    ).rejects.toThrow(/does not cover/);
  });

  it("a match cannot be pushed to approved/applied without consent", async () => {
    const m = await suggestAndNotify(db, IDS.jobSocial, grace);
    await expect(db.root("update matches set status = 'approved' where id = $1", [m])).rejects.toThrow(/consent event/);
    await expect(db.root("update matches set status = 'applied' where id = $1", [m])).rejects.toThrow(
      /invalid match transition/,
    );
  });

  it("approving creates consent event -> application, in that order, and audits it", async () => {
    const m = await suggestAndNotify(db, IDS.jobSocial, maya);
    const r = await db.as(IDS.maya)<{ r: { status: string; application_id: string; consent_event_id: string } }>(
      "select respond_to_match($1, 'approve', 'iphash', 'uahash') r",
      [m],
    );
    expect(r.rows[0].r.status).toBe("applied");
    const app = await db.root(
      "select a.*, ce.granted, ce.type, ce.created_at as ce_at from applications a join consent_events ce on ce.id = a.consent_event_id where a.match_id = $1",
      [m],
    );
    expect(app.rows[0].granted).toBe(true);
    expect(app.rows[0].type).toBe("match_approval");
    expect(new Date(app.rows[0].ce_at).getTime()).toBeLessThanOrEqual(new Date(app.rows[0].applied_at).getTime());
    const audit = await db.root("select action from audit_log where entity_id in ($1, $2) order by created_at", [
      m,
      app.rows[0].id,
    ]);
    const actions = audit.rows.map((a) => a.action);
    expect(actions).toContain("match.status_changed");
    expect(actions).toContain("application.created");
  });

  it("approving twice is idempotent (one application)", async () => {
    const m = (await db.root("select id from matches where job_id = $1 and candidate_id = $2", [IDS.jobSocial, maya]))
      .rows[0].id;
    const r = await db.as(IDS.maya)("select respond_to_match($1, 'approve') r", [m]);
    expect(r.rows[0].r.idempotent).toBe(true);
    expect(await countApps(maya)).toBe(1);
  });

  it("a candidate cannot answer someone else's match (p_candidate_id is ignored)", async () => {
    const m = await suggestAndNotify(db, IDS.jobSocial, jordan);
    await expect(
      db.as(IDS.priya)("select respond_to_match($1, 'approve', null, null, $2)", [m, jordan]),
    ).rejects.toThrow(/not found/);
    expect(await countApps(jordan)).toBe(0);
  });

  it("a recruiter cannot approve on a candidate's behalf", async () => {
    const m = (await db.root("select id from matches where job_id = $1 and candidate_id = $2", [IDS.jobSocial, jordan]))
      .rows[0].id;
    await expect(
      db.as(IDS.rita)("select respond_to_match($1, 'approve', null, null, $2)", [m, jordan]),
    ).rejects.toThrow(/not allowed|not found/);
  });

  it("a suggested (never notified) match cannot be approved", async () => {
    const r = await db.service<{ id: string }>("select upsert_match($1, $2, 90, '{}', 'x', false) id", [
      IDS.jobBackend,
      priya,
    ]);
    await expect(db.as(IDS.priya)("select respond_to_match($1, 'approve')", [r.rows[0].id])).rejects.toThrow(
      /can no longer be answered/,
    );
  });

  it("the trusted backend path (signed email link) works only for the match's candidate", async () => {
    const m = (await db.root("select id from matches where job_id = $1 and candidate_id = $2", [IDS.jobSocial, jordan]))
      .rows[0].id;
    await expect(db.service("select respond_to_match($1, 'approve', null, null, $2)", [m, priya])).rejects.toThrow(
      /not found/,
    );
    const r = await db.service("select respond_to_match($1, 'decline', null, null, $2) r", [m, jordan]);
    expect(r.rows[0].r.status).toBe("declined");
  });
});

describe("declined and expired matches", () => {
  it("declined matches are never re-notified or re-opened by re-running matching", async () => {
    const m = (await db.root("select id from matches where job_id = $1 and candidate_id = $2", [IDS.jobSocial, jordan]))
      .rows[0].id;
    await db.service("select upsert_match($1, $2, 99, '{}', 'rerun', false)", [IDS.jobSocial, jordan]);
    const row = (await db.root("select status, score from matches where id = $1", [m])).rows[0];
    expect(row.status).toBe("declined");
    expect(Number(row.score)).not.toBe(99);
    const notified = await db.service<{ ok: boolean }>("select mark_match_notified($1) ok", [m]);
    expect(notified.rows[0].ok).toBe(false);
    await expect(db.as(IDS.jordan)("select respond_to_match($1, 'approve')", [m])).rejects.toThrow();
    expect(await countApps(jordan)).toBe(0);
  });

  it("matches with no response expire and can't be approved afterwards", async () => {
    const m = await suggestAndNotify(db, IDS.jobSocial, priya);
    await db.root("update matches set expires_at = now() - interval '1 minute' where id = $1", [m]);
    const r = await db.as(IDS.priya)("select respond_to_match($1, 'approve') r", [m]);
    expect(r.rows[0].r.status).toBe("expired");
    expect(await countApps(priya)).toBe(0);
  });

  it("run_expiry expires notified matches past their deadline", async () => {
    const m = await suggestAndNotify(db, IDS.jobBackend, jordan);
    await db.root("update matches set expires_at = now() - interval '1 day' where id = $1", [m]);
    const r = await db.service("select run_expiry() r");
    expect(r.rows[0].r.matches_expired).toBeGreaterThanOrEqual(1);
    expect((await db.root("select status from matches where id = $1", [m])).rows[0].status).toBe("expired");
  });
});

describe("sourced jobs", () => {
  it("sourced job matches can only be viewed, never applied in-platform", async () => {
    const m = await suggestAndNotify(db, IDS.jobSourced, priya);
    await expect(db.as(IDS.priya)("select respond_to_match($1, 'approve')", [m])).rejects.toThrow(/original listing/);
    const r = await db.as(IDS.priya)("select respond_to_match($1, 'view') r", [m]);
    expect(r.rows[0].r.status).toBe("viewed");
    expect(r.rows[0].r.apply_target).toMatch(/^https:/);
    const apps = await db.root("select count(*)::int n from applications where job_id = $1", [IDS.jobSourced]);
    expect(apps.rows[0].n).toBe(0);
  });

  it("the database refuses applications to sourced jobs even with consent", async () => {
    const ce = await db.root<{ id: string }>(
      "insert into consent_events(candidate_id, type, subject_type, subject_id, granted) values ($1, 'match_approval', 'job', $2, true) returning id",
      [priya, IDS.jobSourced],
    );
    await expect(
      db.service("insert into applications(job_id, candidate_id, consent_event_id) values ($1, $2, $3)", [
        IDS.jobSourced,
        priya,
        ce.rows[0].id,
      ]),
    ).rejects.toThrow(/sourced jobs/);
  });

  it("sourced jobs must carry a source name, URL and apply route", async () => {
    await expect(
      db.service(
        "insert into jobs(source_type, title, apply_method, apply_target) values ('sourced', 'No provenance', 'link', 'https://x.test')",
      ),
    ).rejects.toThrow(/jobs_sourced_shape/);
  });
});
