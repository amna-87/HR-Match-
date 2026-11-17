// M9: data export and account deletion work end to end (DB level).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, suggestAndNotify, type TestDb } from "../helpers/db";

let db: TestDb;
let maya: string;

beforeAll(async () => {
  db = await createTestDb("privacy");
  maya = await db.candidateId(IDS.maya);
  await db.root(
    "insert into resumes(candidate_id, storage_path, original_filename, mime_type, size_bytes, parsed_json, parse_status, embedding) values ($1, $2, 'cv.pdf', 'application/pdf', 1000, '{\"skills\":[\"meta ads\"]}', 'succeeded', array_fill(0.1, array[1024])::extensions.vector)",
    [maya, `${IDS.maya}/cv.pdf`],
  );
  const m = await suggestAndNotify(db, IDS.jobSocial, maya);
  await db.as(IDS.maya)("select respond_to_match($1, 'approve')", [m]);
  const app = (await db.root("select id from applications where candidate_id = $1", [maya])).rows[0].id;
  await db.as(IDS.rita)(
    "insert into interview_feedback(application_id, outcome, strengths, growth_areas, suggested_domains, private_note) values ($1, 'good_fit_different_role', '{copy}', '{secret-growth}', '{content}', 'secret-note')",
    [app],
  );
});
afterAll(async () => db?.close());

describe("export", () => {
  it("returns the candidate's own data as JSON, without embeddings or internal notes", async () => {
    const r = await db.as(IDS.maya)<{ d: Record<string, unknown> }>("select export_my_data() d");
    const d = r.rows[0].d as Record<string, unknown[]> & {
      candidate: Record<string, unknown>;
      account: { email: string };
    };
    expect(d.account.email).toBe("maya@example.test");
    expect(d.candidate.full_name).toBe("Maya Chen");
    expect(d.candidate).not.toHaveProperty("embedding");
    expect(d.resumes).toHaveLength(1);
    // launch features are part of the export too
    for (const k of ["saved_jobs", "introduction_requests", "profiles_in_recruiter_pools"]) expect(d).toHaveProperty(k);
    expect(d.resumes[0]).not.toHaveProperty("embedding");
    expect(d.applications).toHaveLength(1);
    expect(d.consent_events.length).toBeGreaterThan(0);
    expect(d.redistribution).toHaveLength(1);
    const text = JSON.stringify(d);
    expect(text).not.toContain("secret-growth");
    expect(text).not.toContain("secret-note");
    expect(text).not.toContain("Jordan");
  });

  it("requires a signed-in user", async () => {
    await expect(db.anon("select export_my_data()")).rejects.toThrow();
  });
});

describe("account deletion", () => {
  it("can only be run by the trusted backend", async () => {
    await expect(db.as(IDS.maya)("select erase_user($1)", [IDS.maya])).rejects.toThrow(/permission denied/);
  });

  it("removes profile, resumes, embeddings, matches, applications and consents; anonymizes audit", async () => {
    const before = await db.root<{ n: number }>(
      "select count(*)::int n from audit_log where actor = $1 or entity_id = $2",
      [IDS.maya, maya],
    );
    expect(before.rows[0].n).toBeGreaterThan(0);
    const r = await db.service<{ paths: string[] }>("select erase_user($1) as paths", [IDS.maya]);
    expect(r.rows[0].paths).toEqual([`${IDS.maya}/cv.pdf`]); // the server deletes these files from storage
    await db.root("delete from auth.users where id = $1", [IDS.maya]); // what auth.admin.deleteUser does

    for (const [table, col, val] of [
      ["candidates", "id", maya],
      ["resumes", "candidate_id", maya],
      ["candidate_skills", "candidate_id", maya],
      ["experiences", "candidate_id", maya],
      ["matches", "candidate_id", maya],
      ["applications", "candidate_id", maya],
      ["consent_events", "candidate_id", maya],
      ["redistribution_consent", "candidate_id", maya],
      ["notifications", "user_id", IDS.maya],
      ["users", "id", IDS.maya],
    ] as const) {
      const c = await db.root<{ n: number }>(`select count(*)::int n from ${table} where ${col} = $1`, [val]);
      expect(c.rows[0].n, table).toBe(0);
    }
    const after = await db.root<{ n: number }>(
      "select count(*)::int n from audit_log where actor = $1 or entity_id = $2",
      [IDS.maya, maya],
    );
    expect(after.rows[0].n).toBe(0);
    const anon = await db.root<{ n: number }>("select count(*)::int n from audit_log where action = 'user.erased'");
    expect(anon.rows[0].n).toBe(1);
    // nothing personal remains in the audit trail
    const all = await db.root<{ s: string }>("select string_agg(metadata::text, ' ') s from audit_log");
    expect(all.rows[0].s ?? "").not.toContain("maya");
  });

  it("append-only protection is back on after erasure", async () => {
    await expect(db.service("delete from audit_log")).rejects.toThrow(/append-only/);
  });
});
