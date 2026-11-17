// G1/7c: readable job numbers, direct apply through the consent path (rule 1),
// saved jobs (own only), usage counters (members only).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb("public_pages");
});
afterAll(async () => db?.close());

describe("public pages", () => {
  it("every job gets a readable public number, readable anonymously", async () => {
    const r = await db.anon("select public_number from jobs where id = $1", [IDS.jobAccountant]);
    expect(Number(r.rows[0].public_number)).toBeGreaterThan(1000);
    expect((await db.root("select slugify('Social Media Marketer (Lahore)!') s")).rows[0].s).toBe(
      "social-media-marketer-lahore",
    );
  });

  it("applying directly records a consent event and creates the application", async () => {
    const r = await db.as(IDS.jordan)("select apply_to_job($1) r", [IDS.jobAccountant]);
    expect(r.rows[0].r.status ?? r.rows[0].r).toBeTruthy();
    const app = await db.root(
      `select a.id, ce.granted from applications a
       join candidates c on c.id = a.candidate_id
       join matches m on m.job_id = a.job_id and m.candidate_id = a.candidate_id
       join consent_events ce on ce.subject_id = m.id and ce.type = 'match_approval'
       where a.job_id = $1 and c.user_id = $2`,
      [IDS.jobAccountant, IDS.jordan],
    );
    expect(app.rows[0].granted).toBe(true);
    // idempotent
    await db.as(IDS.jordan)("select apply_to_job($1)", [IDS.jobAccountant]);
    // recruiters, anonymous users and sourced jobs can't
    await expect(db.as(IDS.rita)("select apply_to_job($1)", [IDS.jobAccountant])).rejects.toThrow(/only candidate/);
    await expect(db.anon("select apply_to_job($1)", [IDS.jobAccountant])).rejects.toThrow(/permission denied/);
    await expect(db.as(IDS.jordan)("select apply_to_job($1)", [IDS.jobSourced])).rejects.toThrow(/not found/);
    await expect(db.as(IDS.jordan)("select apply_to_job($1)", [IDS.jobDraft])).rejects.toThrow(/not found/);
  });

  it("saved jobs are private to their owner and only for visible jobs", async () => {
    await db.as(IDS.maya)("insert into saved_jobs(user_id, job_id) values ($1, $2)", [IDS.maya, IDS.jobSocial]);
    await expect(
      db.as(IDS.maya)("insert into saved_jobs(user_id, job_id) values ($1, $2)", [IDS.jordan, IDS.jobSocial]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(IDS.maya)("insert into saved_jobs(user_id, job_id) values ($1, $2)", [IDS.maya, IDS.jobDraft]),
    ).rejects.toThrow(/row-level security/);
    expect((await db.as(IDS.jordan)("select count(*)::int n from saved_jobs")).rows[0].n).toBe(0);
    expect((await db.as(IDS.maya)("select count(*)::int n from saved_jobs")).rows[0].n).toBe(1);
  });

  it("usage counters are visible to the workspace only", async () => {
    const u = await db.as(IDS.rita)("select * from workspace_usage($1)", [IDS.acme]);
    expect(u.rows[0]).toMatchObject({ pool_cap: 500, daily_send_cap: 50, source_cap: 3, plan: "free" });
    expect((await db.as(IDS.gary)("select * from workspace_usage($1)", [IDS.acme])).rows).toHaveLength(0);
  });
});
