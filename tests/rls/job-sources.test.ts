// B1 (addendum 4, D-028): recruiters add jobs from other sources to their own
// workspace; only admins put them on the public board; private contacts are not
// readable anonymously; "still open?" extends; duplicates are scoped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb("job_sources");
});
afterAll(async () => db?.close());

const insertSourced = (who: string, ws: string, extra = "") =>
  db.as(who)<{ id: string; visibility: string; origin: string }>(
    `insert into jobs(source_type, owner_workspace_id, title, apply_method, apply_target, status, origin${extra ? ", " + extra.split("=")[0] : ""})
     values ('sourced', $1, 'Sales Executive', 'whatsapp', '+92 300 7654321', 'published', 'pasted'${extra ? ", " + extra.split("=")[1] : ""})
     returning id, visibility, origin`,
    [ws],
  );

describe("jobs from other sources in a workspace", () => {
  let jobId: string;

  it("a recruiter adds one to their own workspace; it stays workspace-only even if they ask for public", async () => {
    const r = await insertSourced(IDS.rita, IDS.acme, "visibility='public'");
    jobId = r.rows[0].id;
    expect(r.rows[0]).toMatchObject({ visibility: "workspace", origin: "pasted" });
    await expect(insertSourced(IDS.gary, IDS.acme)).rejects.toThrow(/row-level security/);
    await expect(insertSourced(IDS.maya, IDS.acme)).rejects.toThrow(/row-level security/);
  });

  it("other workspaces and the public can't see it; it's not matched to marketplace candidates", async () => {
    expect((await db.as(IDS.rita)("select count(*)::int n from jobs where id = $1", [jobId])).rows[0].n).toBe(1);
    expect((await db.as(IDS.gary)("select count(*)::int n from jobs where id = $1", [jobId])).rows[0].n).toBe(0);
    expect((await db.as(IDS.maya)("select count(*)::int n from jobs where id = $1", [jobId])).rows[0].n).toBe(0);
    expect((await db.anon("select count(*)::int n from jobs where id = $1", [jobId])).rows[0].n).toBe(0);
    expect((await db.root("select needs_matching from jobs where id = $1", [jobId])).rows[0].needs_matching).toBe(
      false,
    );
  });

  it("recruiters can't make it public themselves; they request and an admin approves", async () => {
    await expect(db.as(IDS.rita)("update jobs set visibility = 'public' where id = $1", [jobId])).rejects.toThrow(
      /only Vouch admins/,
    );
    await expect(db.as(IDS.gary)("select request_job_public($1)", [jobId])).rejects.toThrow(/not found/);
    await db.as(IDS.rita)("select request_job_public($1)", [jobId]);
    await db.as(IDS.admin)("update jobs set visibility = 'public', public_requested_at = null where id = $1", [jobId]);
    expect((await db.anon("select count(*)::int n from jobs where id = $1", [jobId])).rows[0].n).toBe(1);
    expect((await db.root("select needs_matching from jobs where id = $1", [jobId])).rows[0].needs_matching).toBe(true);
  });

  it("anonymous visitors can't read the apply contact or notes; signed-in users can", async () => {
    await expect(db.anon("select apply_target from jobs where id = $1", [jobId])).rejects.toThrow(/permission denied/);
    await expect(db.anon("select * from jobs where id = $1", [jobId])).rejects.toThrow(/permission denied/);
    const ok = await db.anon("select id, title, apply_method from jobs where id = $1", [jobId]);
    expect(ok.rows[0].apply_method).toBe("whatsapp");
    expect((await db.as(IDS.maya)("select apply_target from jobs where id = $1", [jobId])).rows[0].apply_target).toBe(
      "+92 300 7654321",
    );
  });

  it("protected fields can't be changed by the workspace", async () => {
    for (const set of ["owner_workspace_id = null", "origin = 'api_feed'", "source_type = 'verified'"])
      await expect(db.as(IDS.rita)(`update jobs set ${set} where id = $1`, [jobId])).rejects.toThrow(
        /protected job fields|row-level security|jobs_/,
      );
  });

  it("'still open?' extends by 30 days and re-opens an expired job; only the workspace or admins", async () => {
    await db.root("update jobs set status = 'expired', expires_at = now() - interval '1 day' where id = $1", [jobId]);
    await expect(db.as(IDS.gary)("select confirm_job_open($1)", [jobId])).rejects.toThrow(/not found/);
    await db.as(IDS.rita)("select confirm_job_open($1)", [jobId]);
    const j = await db.root(
      "select status, expires_at > now() + interval '29 days' ok, last_confirmed_at from jobs where id = $1",
      [jobId],
    );
    expect(j.rows[0]).toMatchObject({ status: "published", ok: true });
    expect(j.rows[0].last_confirmed_at).toBeTruthy();
  });

  it("duplicate check never reveals another workspace's private jobs", async () => {
    const priv = await insertSourced(IDS.gary, IDS.globex);
    const forAcme = await db.service("select job_id from find_similar_jobs('Sales Executive', null, null, '', $1)", [
      IDS.acme,
    ]);
    expect(forAcme.rows.map((r) => r.job_id)).not.toContain(priv.rows[0].id);
    const forGlobex = await db.service("select job_id from find_similar_jobs('Sales Executive', null, null, '', $1)", [
      IDS.globex,
    ]);
    expect(forGlobex.rows.map((r) => r.job_id)).toContain(priv.rows[0].id);
    await expect(
      db.as(IDS.rita)("select * from find_similar_jobs('x', null, null, '', $1)", [IDS.acme]),
    ).rejects.toThrow(/permission denied/);
  });

  it("employer-posted jobs are owned by their company workspace", async () => {
    const r = await db.as(IDS.rita)<{ owner_workspace_id: string; visibility: string }>(
      "insert into jobs(source_type, company_id, title, apply_method) values ('verified', $1, 'Designer', 'platform') returning owner_workspace_id, visibility",
      [IDS.acme],
    );
    expect(r.rows[0]).toMatchObject({ owner_workspace_id: IDS.acme, visibility: "public" });
  });
});

describe("job pictures (D-036)", () => {
  it("a job's picture must live in its own workspace's folder", async () => {
    const ok = `${IDS.acme}/00000000-0000-4000-8000-0000000000aa.png`;
    await db.as(IDS.rita)("update jobs set image_path = $2, image_public = true where id = $1", [IDS.jobSocial, ok]);
    await expect(
      db.as(IDS.rita)("update jobs set image_path = $2 where id = $1", [
        IDS.jobSocial,
        `${IDS.globex}/00000000-0000-4000-8000-0000000000aa.png`,
      ]),
    ).rejects.toThrow(/workspace/);
    await expect(
      db.as(IDS.rita)("update jobs set image_path = '../x.png' where id = $1", [IDS.jobSocial]),
    ).rejects.toThrow(/image_path|check|workspace/);
    // anonymous visitors can't read the path column itself
    await expect(db.anon("select image_path from jobs where id = $1", [IDS.jobSocial])).rejects.toThrow(
      /permission denied/,
    );
  });
});
