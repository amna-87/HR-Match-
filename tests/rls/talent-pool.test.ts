// Recruiter-uploaded resumes (D-022): the uploading company sees the full
// profile; other companies only an anonymous card via talent_pool_for_job();
// candidates never see it unless it was uploaded for their verified email, and
// then they can claim (merge) or delete it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";

let db: TestDb;
const PERSON = "00000000-0000-4000-8000-0000000000bb"; // signs up later with the uploaded email
const IMPOSTER = "00000000-0000-4000-8000-0000000000bc"; // email not verified yet
const vec = (x: number) => `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : i === 1 ? x : 0)).join(",")}]`;

const profile = {
  full_name: "Pat Example",
  headline: "Social media manager",
  summary: "Ran paid social for consumer brands.",
  location: "London, UK",
  contact_email: "Pat@Example.test",
  contact_phone: "+44 1234",
  languages: ["English"],
  skills: ["meta ads", "content strategy"],
  experiences: [{ title: "Social lead", company: "Brandco", start_date: "2018-01-01", is_current: true }],
  education: [],
  certifications: [],
  experience_years: 6,
};

beforeAll(async () => {
  db = await createTestDb("talent_pool");
  await db.root("update public.jobs set embedding = $1::extensions.vector where id in ($2, $3)", [
    vec(0),
    IDS.jobSocial,
    IDS.jobBackend,
  ]);
});
afterAll(async () => db?.close());

describe("talent pool uploads", () => {
  let uploadId: string;

  it("only recruiters who are members of the company can upload", async () => {
    await expect(
      db.as(IDS.gary)("select save_uploaded_profile($1, null, $2::jsonb)", [IDS.acme, profile]),
    ).rejects.toThrow(/not a company member/);
    await expect(
      db.as(IDS.maya)("select save_uploaded_profile($1, null, $2::jsonb)", [IDS.acme, profile]),
    ).rejects.toThrow(/not a company member/);
    await expect(db.anon("select save_uploaded_profile($1, null, $2::jsonb)", [IDS.acme, profile])).rejects.toThrow(
      /permission denied/,
    );
    const r = await db.as(IDS.rita)<{ id: string }>("select save_uploaded_profile($1, null, $2::jsonb, $3::jsonb) id", [
      IDS.acme,
      profile,
      {
        storage_path: "company/acme/pat.pdf",
        original_filename: "pat.pdf",
        mime_type: "application/pdf",
        size_bytes: 1000,
        parsed_json: { skills: ["meta ads"] },
      },
    ]);
    uploadId = r.rows[0].id;
    await db.root("update public.candidates set embedding = $1::extensions.vector where id = $2", [vec(0.1), uploadId]);
  });

  it("the uploading company sees the full profile; nobody else can read it directly", async () => {
    const own = await db.as(IDS.rita)("select full_name, contact_email from candidates where id = $1", [uploadId]);
    expect(own.rows[0]).toEqual({ full_name: "Pat Example", contact_email: "pat@example.test" });
    expect(
      (await db.as(IDS.rita)("select count(*)::int n from resumes where candidate_id = $1", [uploadId])).rows[0].n,
    ).toBe(1);
    expect(
      (await db.as(IDS.rita)("select count(*)::int n from candidate_skills where candidate_id = $1", [uploadId]))
        .rows[0].n,
    ).toBe(2);
    for (const who of [IDS.gary, IDS.maya]) {
      for (const t of [
        "candidates where id",
        "resumes where candidate_id",
        "candidate_skills where candidate_id",
        "experiences where candidate_id",
      ]) {
        const n = await db.as(who)(`select count(*)::int n from ${t} = $1`, [uploadId]);
        expect(n.rows[0].n).toBe(0);
      }
    }
    expect((await db.anon("select count(*)::int n from candidates where id = $1", [uploadId])).rows[0].n).toBe(0);
  });

  it("other companies get an anonymous card in the ranked pool; the uploader gets full details", async () => {
    const mine = await db.as(IDS.rita)("select * from talent_pool_for_job($1)", [IDS.jobSocial]);
    const row = mine.rows.find((r) => r.candidate_id === uploadId)!;
    expect(row).toMatchObject({ is_own: true, full_name: "Pat Example", contact_email: "pat@example.test" });
    expect(row.skills).toEqual(["content strategy", "meta ads"]);

    // Globex can't rank against Acme's job, but can against its own
    await expect(db.as(IDS.gary)("select * from talent_pool_for_job($1)", [IDS.jobSocial])).rejects.toThrow(
      /not found/,
    );
    const globexJob = (
      await db.root<{ id: string }>(
        `insert into public.jobs(company_id, source_type, title, description_summary, status, expires_at, embedding)
         values ($1, 'verified', 'Content lead', 'Social content', 'published', now() + interval '30 days', $2::extensions.vector)
         returning id`,
        [IDS.globex, vec(0)],
      )
    ).rows[0].id;
    const anon = await db.as(IDS.gary)("select * from talent_pool_for_job($1)", [globexJob]);
    const card = anon.rows.find((r) => r.candidate_id === uploadId)!;
    expect(card).toMatchObject({ is_own: false, full_name: null, contact_email: null, contact_phone: null });
    expect(card.headline).toBe("Social media manager");

    await expect(db.as(IDS.maya)("select * from talent_pool_for_job($1)", [globexJob])).rejects.toThrow(/not found/);
    await expect(db.anon("select * from talent_pool_for_job($1)", [globexJob])).rejects.toThrow(/permission denied/);
  });

  it("is never part of normal matching", async () => {
    const r = await db.root(
      "select count(*)::int n from public.match_candidates_for_job($1, 200) where candidate_id = $2",
      [IDS.jobSocial, uploadId],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("protected columns can't be changed by the uploader", async () => {
    await expect(
      db.as(IDS.rita)("update candidates set uploaded_by_company_id = $2 where id = $1", [uploadId, IDS.globex]),
    ).rejects.toThrow(/protected candidate fields/);
    await expect(
      db.as(IDS.rita)("update candidates set user_id = $2, claim_status = 'claimed' where id = $1", [
        uploadId,
        IDS.rita,
      ]),
    ).rejects.toThrow(/protected candidate fields/);
  });

  it("only the person with that verified email sees, claims or deletes it", async () => {
    await db.root(
      `insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at)
       values ($1, 'pat@example.test', '{"role":"candidate"}', now()), ($2, 'PAT2@example.test', '{"role":"candidate"}', null)`,
      [PERSON, IMPOSTER],
    );
    expect((await db.as(IDS.maya)("select count(*)::int n from my_uploaded_profiles()")).rows[0].n).toBe(0);
    await expect(db.as(IDS.maya)("select claim_uploaded_profile($1)", [uploadId])).rejects.toThrow(/not found/);
    await expect(db.as(IDS.maya)("select delete_uploaded_profile($1)", [uploadId])).rejects.toThrow(/not found/);
    await expect(db.as(IMPOSTER)("select claim_uploaded_profile($1)", [uploadId])).rejects.toThrow(/verify your email/);

    const mine = await db.as(PERSON)("select * from my_uploaded_profiles()");
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({ id: uploadId, company_name: "Acme Social", skills_count: 2 });
  });

  it("claiming merges it into the person's profile and the uploader loses access", async () => {
    await db.as(PERSON)("select claim_uploaded_profile($1)", [uploadId]);
    const me = await db.as(PERSON)<{ id: string; headline: string; needs_matching: boolean; experience_years: string }>(
      "select id, headline, needs_matching, experience_years from candidates where user_id = auth.uid()",
    );
    expect(me.rows[0]).toMatchObject({ headline: "Social media manager", needs_matching: true });
    expect(Number(me.rows[0].experience_years)).toBe(6);
    const myId = me.rows[0].id;
    expect(
      (await db.as(PERSON)("select count(*)::int n from candidate_skills where candidate_id = $1", [myId])).rows[0].n,
    ).toBe(2);
    expect((await db.as(PERSON)("select count(*)::int n from resumes where candidate_id = $1", [myId])).rows[0].n).toBe(
      1,
    );
    expect(
      (await db.as(PERSON)("select count(*)::int n from experiences where candidate_id = $1", [myId])).rows[0].n,
    ).toBe(1);

    expect((await db.root("select count(*)::int n from candidates where id = $1", [uploadId])).rows[0].n).toBe(0);
    expect((await db.as(IDS.rita)("select count(*)::int n from candidates where id = $1", [myId])).rows[0].n).toBe(0);
    expect(
      (await db.as(IDS.rita)("select count(*)::int n from resumes where candidate_id = $1", [myId])).rows[0].n,
    ).toBe(0);
    // now a normal, claimed candidate: eligible for matching, consent rules apply
    const r = await db.root("select claim_status from candidates where id = $1", [myId]);
    expect(r.rows[0].claim_status).toBe("claimed");
  });

  it("the uploader or the person can delete; storage paths come back for removal", async () => {
    const a = await db.as(IDS.rita)<{ id: string }>("select save_uploaded_profile($1, null, $2::jsonb, $3::jsonb) id", [
      IDS.acme,
      { ...profile, contact_email: "other@example.test" },
      { storage_path: "company/acme/o.pdf", original_filename: "o.pdf", mime_type: "application/pdf", size_bytes: 10 },
    ]);
    await expect(db.as(IDS.gary)("select delete_uploaded_profile($1)", [a.rows[0].id])).rejects.toThrow(/not found/);
    const paths = await db.as(IDS.rita)("select delete_uploaded_profile($1) p", [a.rows[0].id]);
    expect(paths.rows[0].p).toEqual(["company/acme/o.pdf"]);

    const b = await db.as(IDS.rita)<{ id: string }>("select save_uploaded_profile($1, null, $2::jsonb) id", [
      IDS.acme,
      profile,
    ]);
    await db.as(PERSON)("select delete_uploaded_profile($1)", [b.rows[0].id]);
    expect((await db.root("select count(*)::int n from candidates where id = $1", [b.rows[0].id])).rows[0].n).toBe(0);
  });

  it("account deletion erases profiles uploaded for that email (service only)", async () => {
    await db.as(IDS.rita)("select save_uploaded_profile($1, null, $2::jsonb)", [IDS.acme, profile]);
    await expect(db.as(PERSON)("select erase_uploaded_profiles_for_email('pat@example.test')")).rejects.toThrow(
      /permission denied/,
    );
    await db.root("select erase_uploaded_profiles_for_email('PAT@example.test')");
    const n = await db.root(
      "select count(*)::int n from candidates where lower(contact_email) = 'pat@example.test' and claim_status = 'unclaimed'",
    );
    expect(n.rows[0].n).toBe(0);
  });

  it("accepting an invitation needs a verified email too", async () => {
    const id = (
      await db.as(IDS.rita)<{ id: string }>("select invite_recruiter($1, 'late@acme.example.test') id", [IDS.acme])
    ).rows[0].id;
    const U = "00000000-0000-4000-8000-0000000000bd";
    await db.root(
      `insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at) values ($1, 'late@acme.example.test', '{"role":"recruiter"}', null)`,
      [U],
    );
    await expect(db.as(U)("select accept_invitation($1)", [id])).rejects.toThrow(/verify your email/);
    await db.root("update auth.users set email_confirmed_at = now() where id = $1", [U]);
    await db.as(U)("select accept_invitation($1)", [id]);
  });
});
