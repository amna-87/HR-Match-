// M7: Talent Redistribution Loop. A redirected candidate appears to other
// recruiters only after opting in; growth areas and private notes never leak.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, suggestAndNotify, type TestDb } from "../helpers/db";

let db: TestDb;
let maya: string;
let appId: string;
let feedbackId: string;
let contentJob: string;
const SECRET_NOTE = "PRIVATE-NOTE-do-not-leak";
const GROWTH = "GROWTH-AREA-do-not-leak";

beforeAll(async () => {
  db = await createTestDb("redistribution");
  maya = await db.candidateId(IDS.maya);
  const m = await suggestAndNotify(db, IDS.jobSocial, maya);
  const r = await db.as(IDS.maya)("select respond_to_match($1, 'approve') r", [m]);
  appId = r.rows[0].r.application_id;
  // Initech (another company) has a content role in the recommended domain
  const job = await db.as(IDS.ivy)<{ id: string }>(
    `insert into jobs(company_id, title, description_summary, required_skills, domains, work_mode, status)
     values ($1, 'Content Lead', 'Lead content and copy.', '{copywriting}', '{Content}', 'remote', 'published') returning id`,
    [IDS.initech],
  );
  contentJob = job.rows[0].id;
  await db.service("select upsert_match($1, $2, 72, '{}', 'x', false)", [contentJob, maya]);
});
afterAll(async () => db?.close());

describe("feedback form", () => {
  it("only the reviewing company can write feedback", async () => {
    await expect(
      db.as(IDS.gary)("insert into interview_feedback(application_id, outcome) values ($1, 'not_a_fit')", [appId]),
    ).rejects.toThrow();
    await expect(
      db.as(IDS.maya)("insert into interview_feedback(application_id, outcome) values ($1, 'not_a_fit')", [appId]),
    ).rejects.toThrow();
  });

  it("good_fit_different_role requires a suggested domain", async () => {
    await expect(
      db.as(IDS.rita)(
        "insert into interview_feedback(application_id, outcome) values ($1, 'good_fit_different_role')",
        [appId],
      ),
    ).rejects.toThrow(/suggested domain/);
  });

  it("recruiter submits feedback; application is redirected and the candidate is offered visibility", async () => {
    const r = await db.as(IDS.rita)<{ id: string }>(
      `insert into interview_feedback(application_id, outcome, strengths, growth_areas, suggested_domains, rating, private_note)
       values ($1, 'good_fit_different_role', '{strong copywriting,brand voice}', $2, '{content}', 4, $3) returning id`,
      [appId, `{${GROWTH}}`, SECRET_NOTE],
    );
    feedbackId = r.rows[0].id;
    const app = await db.root("select stage from applications where id = $1", [appId]);
    expect(app.rows[0].stage).toBe("redirected");
    const offers = await db.as(IDS.maya)("select * from redistribution_consent");
    expect(offers.rows).toHaveLength(1);
    expect(offers.rows[0].status).toBe("pending");
    expect(offers.rows[0].strengths).toEqual(expect.arrayContaining(["strong copywriting"]));
    expect(offers.rows[0].source_label).toBe("a previous employer's recruiter");
  });
});

describe("privacy of internal feedback", () => {
  it("candidates cannot read interview feedback", async () => {
    expect((await db.as(IDS.maya)("select count(*)::int n from interview_feedback")).rows[0].n).toBe(0);
  });

  it("other companies cannot read interview feedback", async () => {
    for (const r of [IDS.gary, IDS.ivy]) {
      expect((await db.as(r)("select count(*)::int n from interview_feedback")).rows[0].n).toBe(0);
    }
  });

  it("admins cannot read feedback directly, only via the logged function with a reason", async () => {
    expect((await db.as(IDS.admin)("select count(*)::int n from interview_feedback")).rows[0].n).toBe(0);
    await expect(db.as(IDS.admin)("select * from admin_read_feedback($1, 'x')", [feedbackId])).rejects.toThrow(
      /reason/,
    );
    await expect(
      db.as(IDS.rita)("select * from admin_read_feedback($1, 'investigating a complaint')", [feedbackId]),
    ).rejects.toThrow(/not allowed/);
    const r = await db.as(IDS.admin)(
      "select private_note from admin_read_feedback($1, 'investigating complaint #12')",
      [feedbackId],
    );
    expect(r.rows[0].private_note).toBe(SECRET_NOTE);
    const log = await db.root(
      "select metadata from audit_log where action = 'admin.read_private_feedback' and entity_id = $1",
      [feedbackId],
    );
    expect(log.rows[0].metadata.reason).toContain("complaint");
  });

  it("growth areas / private notes never appear in anything the candidate or other companies can query", async () => {
    const probes: Array<[string, string]> = [
      [IDS.maya, "select to_jsonb(t)::text s from redistribution_consent t"],
      [IDS.maya, "select to_jsonb(t)::text s from notifications t"],
      [IDS.maya, "select export_my_data()::text s"],
      [IDS.maya, "select to_jsonb(t)::text s from audit_log t"],
      [IDS.maya, "select to_jsonb(t)::text s from candidate_skills t"],
      [IDS.ivy, `select to_jsonb(t)::text s from recruiter_job_matches('${contentJob}') t`],
      [IDS.gary, "select to_jsonb(t)::text s from interview_feedback t"],
    ];
    for (const [who, sql] of probes) {
      const r = await db.as(who)<{ s: string }>(sql);
      const text = r.rows.map((x) => x.s).join("\n");
      expect(text, sql).not.toContain(SECRET_NOTE);
      expect(text, sql).not.toContain(GROWTH);
    }
    // ...and they're not in the audit log metadata either
    const audit = await db.root<{ s: string }>("select string_agg(metadata::text, ' ') s from audit_log");
    expect(audit.rows[0].s).not.toContain(SECRET_NOTE);
    expect(audit.rows[0].s).not.toContain(GROWTH);
  });
});

describe("opt-in controls visibility to other recruiters", () => {
  const visibleToIvy = async () =>
    (await db.as(IDS.ivy)("select * from recruiter_job_matches($1)", [contentJob])).rows.filter(
      (r) => r.candidate_id === maya,
    );

  it("before opting in, the candidate is invisible to other recruiters", async () => {
    expect(await visibleToIvy()).toHaveLength(0);
    expect((await db.as(IDS.ivy)("select count(*)::int n from candidates where id = $1", [maya])).rows[0].n).toBe(0);
  });

  it("declining keeps them invisible", async () => {
    // create a second offer to decline
    const d = await db.root<{ id: string }>(
      "insert into redistribution_consent(candidate_id, feedback_id, domain, strengths) values ($1, $2, 'design', '{}') returning id",
      [maya, feedbackId],
    );
    await db.as(IDS.maya)("select set_redistribution_consent($1, 'declined')", [d.rows[0].id]);
    expect(await visibleToIvy()).toHaveLength(0);
  });

  it("after opting in, they appear with the Interview-vetted badge and strengths only (no name)", async () => {
    const offer = (await db.as(IDS.maya)("select id from redistribution_consent where domain = 'content'")).rows[0].id;
    await db.as(IDS.maya)("select set_redistribution_consent($1, 'opted_in', 'ip', 'ua')", [offer]);
    const rows = await visibleToIvy();
    expect(rows).toHaveLength(1);
    expect(rows[0].vetted).toBe(true);
    expect(rows[0].consented).toBe(false);
    expect(rows[0].full_name).toBeNull();
    expect(rows[0].vetted_strengths).toEqual(expect.arrayContaining(["strong copywriting"]));
    expect(rows[0].vetted_source_labels).toEqual(["a previous employer's recruiter"]);
    // verified skills are now a separate, higher-weight signal
    const vs = await db.root(
      "select skill, weight from candidate_skills where candidate_id = $1 and source = 'verified'",
      [maya],
    );
    expect(vs.rows.map((r) => r.skill)).toEqual(expect.arrayContaining(["strong copywriting", "content"]));
    expect(Number(vs.rows[0].weight)).toBeGreaterThan(1);
    // consent was recorded
    const ce = await db.root(
      "select count(*)::int n from consent_events where type = 'redistribution_opt_in' and candidate_id = $1",
      [maya],
    );
    expect(ce.rows[0].n).toBe(1);
  });

  it("recruiters still can't see the full profile of an opted-in, non-applied candidate", async () => {
    expect((await db.as(IDS.ivy)("select count(*)::int n from candidates where id = $1", [maya])).rows[0].n).toBe(0);
  });

  it("other transitions are not allowed (e.g. declined -> opted_in)", async () => {
    const d = (await db.as(IDS.maya)("select id from redistribution_consent where domain = 'design'")).rows[0].id;
    await expect(db.as(IDS.maya)("select set_redistribution_consent($1, 'opted_in')", [d])).rejects.toThrow(/invalid/);
  });

  it("another candidate cannot change Maya's consent", async () => {
    const offer = (await db.as(IDS.maya)("select id from redistribution_consent where domain = 'content'")).rows[0].id;
    await expect(db.as(IDS.jordan)("select set_redistribution_consent($1, 'withdrawn')", [offer])).rejects.toThrow(
      /not found/,
    );
  });

  it("withdrawing hides them again and removes the verified signal", async () => {
    const offer = (await db.as(IDS.maya)("select id from redistribution_consent where domain = 'content'")).rows[0].id;
    await db.as(IDS.maya)("select set_redistribution_consent($1, 'withdrawn')", [offer]);
    expect(await visibleToIvy()).toHaveLength(0);
    const vs = await db.root(
      "select count(*)::int n from candidate_skills where candidate_id = $1 and source = 'verified'",
      [maya],
    );
    expect(vs.rows[0].n).toBe(0);
  });

  it("the originating company name is shown only when that company allows it", async () => {
    await db.as(IDS.rita)("update companies set show_name_on_vetted_badge = true where id = $1", [IDS.acme]);
    await db.as(IDS.rita)("update interview_feedback set strengths = strengths where id = $1", [feedbackId]);
    const r = await db.as(IDS.maya)("select source_label from redistribution_consent where domain = 'content'");
    expect(r.rows[0].source_label).toBe("Acme Social");
  });
});
