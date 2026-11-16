// M1 acceptance: RLS proves a candidate can't read others, a recruiter can't
// read another company's data, and unclaimed/non-consenting candidates are
// invisible to recruiters.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, suggestAndNotify, type TestDb } from "../helpers/db";

let db: TestDb;
let mayaCid: string;
let jordanCid: string;

beforeAll(async () => {
  db = await createTestDb("rls");
  mayaCid = await db.candidateId(IDS.maya);
  jordanCid = await db.candidateId(IDS.jordan);
});
afterAll(async () => db?.close());

describe("every table has RLS enabled", () => {
  it("has no public table without row level security", async () => {
    const r = await db.root("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
    expect(r.rows).toEqual([]);
  });
});

describe("candidates", () => {
  it("a candidate sees only their own profile", async () => {
    const r = await db.as(IDS.maya)("select user_id from candidates");
    expect(r.rows.map((x) => x.user_id)).toEqual([IDS.maya]);
  });

  it("a candidate cannot read another candidate's skills, experience or resumes", async () => {
    for (const table of ["candidate_skills", "experiences", "certifications", "resumes", "education"]) {
      const r = await db.as(IDS.maya)(`select count(*)::int as n from ${table} where candidate_id = $1`, [jordanCid]);
      expect(r.rows[0].n, table).toBe(0);
    }
  });

  it("a candidate cannot update another candidate", async () => {
    const r = await db.as(IDS.maya)("update candidates set headline = 'hacked' where id = $1", [jordanCid]);
    expect(r.rowCount).toBe(0);
  });

  it("a candidate cannot escalate their role", async () => {
    await expect(db.as(IDS.maya)("update users set role = 'admin' where id = $1", [IDS.maya])).rejects.toThrow();
  });

  it("a candidate cannot mark themselves claimed/unclaimed or write embeddings", async () => {
    await expect(
      db.as(IDS.maya)("update candidates set claim_status = 'unclaimed' where id = $1", [mayaCid]),
    ).rejects.toThrow(/protected candidate fields/);
  });

  it("a candidate can update their own preferences", async () => {
    const r = await db.as(IDS.maya)(
      "update candidates set availability = 'Immediately', open_to_work = true where id = $1",
      [mayaCid],
    );
    expect(r.rowCount).toBe(1);
  });

  it("a candidate cannot forge verified skills", async () => {
    await expect(
      db.as(IDS.maya)(
        "insert into candidate_skills(candidate_id, skill, source) values ($1, 'leadership', 'verified')",
        [mayaCid],
      ),
    ).rejects.toThrow(/verified/);
  });

  it("anonymous users see no candidates or users", async () => {
    expect((await db.anon("select count(*)::int n from candidates")).rows[0].n).toBe(0);
    expect((await db.anon("select count(*)::int n from users")).rows[0].n).toBe(0);
  });
});

describe("recruiters vs candidates", () => {
  it("recruiters see no candidates when nobody has consented", async () => {
    const r = await db.as(IDS.rita)("select count(*)::int as n from candidates");
    expect(r.rows[0].n).toBe(0);
  });

  it("unclaimed profiles are never visible to recruiters", async () => {
    const r = await db.as(IDS.rita)("select count(*)::int as n from candidates where id = $1", [
      IDS.unclaimedCandidate,
    ]);
    expect(r.rows[0].n).toBe(0);
  });

  it("a notified-but-not-approved match is invisible to the recruiter", async () => {
    await suggestAndNotify(db, IDS.jobSocial, jordanCid);
    const r = await db.as(IDS.rita)("select count(*)::int as n from matches");
    expect(r.rows[0].n).toBe(0);
    const c = await db.as(IDS.rita)("select count(*)::int as n from candidates where id = $1", [jordanCid]);
    expect(c.rows[0].n).toBe(0);
  });

  it("after the candidate approves, the recruiter sees the applicant and their profile", async () => {
    const matchId = await suggestAndNotify(db, IDS.jobSocial, mayaCid);
    await db.as(IDS.maya)("select respond_to_match($1, 'approve')", [matchId]);
    const apps = await db.as(IDS.rita)("select candidate_id from applications where job_id = $1", [IDS.jobSocial]);
    expect(apps.rows.map((r) => r.candidate_id)).toContain(mayaCid);
    const c = await db.as(IDS.rita)("select full_name from candidates where id = $1", [mayaCid]);
    expect(c.rows[0].full_name).toBe("Maya Chen");
    const skills = await db.as(IDS.rita)("select count(*)::int n from candidate_skills where candidate_id = $1", [
      mayaCid,
    ]);
    expect(skills.rows[0].n).toBeGreaterThan(0);
  });

  it("another company cannot see that applicant, application, or match", async () => {
    for (const recruiter of [IDS.gary, IDS.ivy]) {
      const as = db.as(recruiter);
      expect((await as("select count(*)::int n from candidates where id = $1", [mayaCid])).rows[0].n).toBe(0);
      expect((await as("select count(*)::int n from applications")).rows[0].n).toBe(0);
      expect((await as("select count(*)::int n from matches")).rows[0].n).toBe(0);
      expect((await as("select count(*)::int n from application_stage_history")).rows[0].n).toBe(0);
    }
  });

  it("the recruiter can move the application through stages (with history); others can't", async () => {
    const app = (await db.root("select id from applications where candidate_id = $1", [mayaCid])).rows[0].id;
    expect((await db.as(IDS.rita)("update applications set stage = 'interview' where id = $1", [app])).rowCount).toBe(
      1,
    );
    expect((await db.as(IDS.gary)("update applications set stage = 'hired' where id = $1", [app])).rowCount).toBe(0);
    await expect(
      db.as(IDS.maya)("update applications set stage = 'hired' where id = $1", [app]),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      db.as(IDS.rita)("update applications set consent_event_id = gen_random_uuid() where id = $1", [app]),
    ).rejects.toThrow(/permission denied/);
    const h = await db.as(IDS.rita)(
      "select from_stage, to_stage from application_stage_history where application_id = $1 order by changed_at",
      [app],
    );
    expect(h.rows.map((r) => r.to_stage)).toEqual(["new", "interview"]);
    // candidates can see their stage but not the internal history
    expect((await db.as(IDS.maya)("select stage from applications where id = $1", [app])).rows[0].stage).toBe(
      "interview",
    );
    expect((await db.as(IDS.maya)("select count(*)::int n from application_stage_history")).rows[0].n).toBe(0);
  });

  it("recruiter_job_matches refuses jobs of other companies", async () => {
    await expect(db.as(IDS.gary)("select * from recruiter_job_matches($1)", [IDS.jobSocial])).rejects.toThrow(
      /not allowed/,
    );
  });

  it("recruiter_job_matches only lists consenting candidates", async () => {
    const r = await db.as(IDS.rita)("select candidate_id, consented from recruiter_job_matches($1)", [IDS.jobSocial]);
    expect(r.rows.every((x) => x.consented)).toBe(true);
    expect(r.rows.map((x) => x.candidate_id)).not.toContain(jordanCid);
  });
});

describe("companies and jobs", () => {
  it("a recruiter can edit their own company's job", async () => {
    const r = await db.as(IDS.rita)("update jobs set description_summary = description_summary || ' ' where id = $1", [
      IDS.jobSocial,
    ]);
    expect(r.rowCount).toBe(1);
  });

  it("a recruiter cannot edit another company's job", async () => {
    const r = await db.as(IDS.gary)("update jobs set title = 'pwned' where id = $1", [IDS.jobSocial]);
    expect(r.rowCount).toBe(0);
  });

  it("a recruiter cannot see another company's draft jobs", async () => {
    const r = await db.as(IDS.gary)("select count(*)::int n from jobs where id = $1", [IDS.jobDraft]);
    expect(r.rows[0].n).toBe(0);
    const own = await db.as(IDS.rita)("select count(*)::int n from jobs where id = $1", [IDS.jobDraft]);
    expect(own.rows[0].n).toBe(1);
  });

  it("a recruiter cannot post a job for a company they don't belong to", async () => {
    await expect(
      db.as(IDS.gary)("insert into jobs(company_id, title) values ($1, 'Fake job')", [IDS.acme]),
    ).rejects.toThrow();
  });

  it("sourced jobs: the source link is optional but must be http(s) when given (D-023)", async () => {
    const base = `insert into jobs(source_type, title, source_name, source_url, apply_method, apply_target, status)
      values ('sourced', 'Channel job', 'WhatsApp jobs channel', $1, 'email', 'hr@x.example.test', 'draft')`;
    await db.root(base, [null]);
    await db.root(base, ["https://x.example.test/job"]);
    await expect(db.root(base, ["javascript:alert(1)"])).rejects.toThrow(/jobs_sourced_shape/);
    await expect(
      db.root(
        `insert into jobs(source_type, title, source_name, apply_method, apply_target) values ('sourced', 'X', 'Y', 'platform', 'x')`,
      ),
    ).rejects.toThrow(/jobs_sourced_shape/);
  });

  it("a recruiter cannot create sourced jobs", async () => {
    await expect(
      db.as(IDS.rita)(
        `insert into jobs(company_id, source_type, title, source_name, source_url, apply_method, apply_target)
         values ($1, 'sourced', 'X', 'Y', 'https://y.test', 'link', 'https://y.test')`,
        [IDS.acme],
      ),
    ).rejects.toThrow();
  });

  it("a recruiter cannot see another company's members", async () => {
    const r = await db.as(IDS.gary)("select count(*)::int n from company_members where company_id = $1", [IDS.acme]);
    expect(r.rows[0].n).toBe(0);
  });

  it("anonymous users can see published jobs but not drafts", async () => {
    const r = await db.anon("select id from jobs");
    const ids = r.rows.map((x) => x.id);
    expect(ids).toContain(IDS.jobSocial);
    expect(ids).not.toContain(IDS.jobDraft);
  });

  it("anonymous users cannot write anything", async () => {
    await expect(
      db.anon("insert into takedown_requests(requester_contact, reason) values ('a@b.c', 'x')"),
    ).rejects.toThrow();
  });

  it("candidates cannot create companies (create_company)", async () => {
    await expect(db.as(IDS.maya)("select create_company('Fake Co')")).rejects.toThrow(/only recruiters/);
  });
});

describe("internal tables", () => {
  it("audit_log is admin-only and append-only", async () => {
    expect((await db.as(IDS.rita)("select count(*)::int n from audit_log")).rows[0].n).toBe(0);
    expect((await db.as(IDS.maya)("select count(*)::int n from audit_log")).rows[0].n).toBe(0);
    expect((await db.as(IDS.admin)("select count(*)::int n from audit_log")).rows[0].n).toBeGreaterThan(0);
    await expect(db.root("delete from audit_log")).rejects.toThrow(/append-only/);
    await expect(db.service("update audit_log set action = 'x'")).rejects.toThrow(/append-only/);
  });

  it("consent_events are append-only and private to the candidate", async () => {
    await expect(db.service("delete from consent_events")).rejects.toThrow(/append-only/);
    expect((await db.as(IDS.jordan)("select count(*)::int n from consent_events")).rows[0].n).toBe(0);
    expect((await db.as(IDS.maya)("select count(*)::int n from consent_events")).rows[0].n).toBeGreaterThan(0);
  });

  it("rate_limits is not readable by API roles", async () => {
    expect((await db.as(IDS.admin)("select count(*)::int n from rate_limits")).rows[0].n).toBe(0);
  });

  it("service-only functions are not executable by API users", async () => {
    for (const sql of [
      "select erase_user('00000000-0000-4000-8000-000000000202')",
      "select check_rate_limit('k', 1, 1)",
      `select * from match_candidates_for_job('${IDS.jobSocial}', 5)`,
      `select upsert_match('${IDS.jobSocial}', '${jordanCid}', 99, '{}', 'x', false)`,
      "select run_expiry()",
      `select unsubscribe_candidate('${jordanCid}')`,
    ]) {
      await expect(db.as(IDS.maya)(sql), sql).rejects.toThrow(/permission denied/);
      await expect(db.anon(sql), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("admin_counts is admin-only", async () => {
    await expect(db.as(IDS.rita)("select admin_counts()")).rejects.toThrow(/not allowed/);
    const r = await db.as(IDS.admin)("select admin_counts() c");
    expect(r.rows[0].c.users).toBeGreaterThan(0);
  });

  it("users can only see their own in-app notifications", async () => {
    await db.root(
      "insert into notifications(user_id, type, channel, payload) values ($1, 't', 'in_app', '{}'), ($1, 't', 'email', '{}')",
      [IDS.jordan],
    );
    expect(
      (await db.as(IDS.maya)("select count(*)::int n from notifications where user_id = $1", [IDS.jordan])).rows[0].n,
    ).toBe(0);
    expect((await db.as(IDS.jordan)("select count(*)::int n from notifications")).rows[0].n).toBe(1);
    await expect(
      db.as(IDS.jordan)("update notifications set payload = '{}' where user_id = $1", [IDS.jordan]),
    ).rejects.toThrow();
  });
});

describe("storage", () => {
  it("the resumes bucket is private", async () => {
    const r = await db.root("select public from storage.buckets where id = 'resumes'");
    expect(r.rows[0].public).toBe(false);
  });

  it("a candidate can only write/read files in their own folder", async () => {
    await db.as(IDS.maya)("insert into storage.objects(bucket_id, name) values ('resumes', $1)", [
      `${IDS.maya}/cv.pdf`,
    ]);
    await expect(
      db.as(IDS.maya)("insert into storage.objects(bucket_id, name) values ('resumes', $1)", [`${IDS.jordan}/cv.pdf`]),
    ).rejects.toThrow();
    expect((await db.as(IDS.jordan)("select count(*)::int n from storage.objects")).rows[0].n).toBe(0);
    expect((await db.as(IDS.rita)("select count(*)::int n from storage.objects")).rows[0].n).toBe(0);
  });
});
