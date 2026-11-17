// Talent pool (A2, D-026/D-027): pool_candidates are private to the workspace;
// bulk uploads are capped and need a lawful-basis confirmation; the background
// queue parses, de-duplicates and embeds; search and filters run under RLS; the
// person (verified email) can add the profile to their account or delete it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";
import { minimalPdf } from "../fixtures/minimal-pdf";
import { processPoolQueue, type PoolProcessDeps } from "../../src/lib/pool/process";
import { LocalEmbeddingProvider, toPgVector, type EmbeddingProvider } from "../../src/lib/matching/embeddings";
import { basicParseResume } from "../../src/lib/parsing/basic-resume";

let db: TestDb;
const PERSON = "00000000-0000-4000-8000-0000000000bb"; // signs up later with an uploaded email
const IMPOSTER = "00000000-0000-4000-8000-0000000000bc"; // same email, not verified
const embedder: EmbeddingProvider = new LocalEmbeddingProvider();

/** Fake storage: path -> resume text. download() returns a real (tiny) PDF. */
const files = new Map<string, string>();
const removed: string[] = [];
function deps(): PoolProcessDeps {
  return {
    db: { query: (sql: string, params?: unknown[]) => db.service(sql, params ?? []) } as PoolProcessDeps["db"],
    embedder,
    async download(path) {
      if (!files.has(path)) throw new Error("missing");
      return minimalPdf(["resume"]);
    },
    async remove(paths) {
      removed.push(...paths);
    },
    async extract() {
      throw new Error("replaced per path below");
    },
    async parse(text) {
      const { experience_years_hint, ...parsed } = basicParseResume(text);
      return { parsed, years: experience_years_hint ?? 0, by: "basic" };
    },
  };
}

/** Queue resumes for a workspace as `who`, the way the upload page does. */
async function upload(who: string, ws: string, texts: string[]) {
  const imp = (await db.as(who)<{ id: string }>("select start_pool_import($1, $2, true) id", [ws, texts.length]))
    .rows[0].id;
  const list = texts.map((t, i) => {
    const path = `pool/${ws}/${imp}/${i}-${Math.random().toString(36).slice(2)}.pdf`;
    files.set(path, t);
    return { storage_path: path, original_filename: `cv${i}.pdf`, size_bytes: 1000 };
  });
  await db.as(who)("select queue_pool_files($1, $2::jsonb)", [imp, JSON.stringify(list)]);
  const d = deps();
  // extract returns the text registered for the path being processed
  let current = "";
  const download = d.download;
  d.download = async (p) => {
    current = files.get(p) ?? "";
    return download(p);
  };
  d.extract = async () => current;
  // process one at a time so `current` is unambiguous
  const res = await processPoolQueue(d, { workspaceId: ws, batch: 1, budgetMs: 60_000 });
  return { importId: imp, res };
}

const FIRST = ["Ayesha", "Bilal", "Sana", "Omar", "Hina", "Usman", "Zara", "Ali", "Maria", "Hamza"];
const LAST = ["Khan", "Ahmed", "Malik", "Hussain", "Siddiqui", "Iqbal", "Raza", "Shah", "Qureshi", "Butt"];
const personName = (i: number) => `${FIRST[i % 10]} ${LAST[Math.floor(i / 10) % 10]}`;

const cv = (name: string, email: string, phone: string, title: string, employer: string, skills: string) =>
  [
    name,
    title,
    `${email} | ${phone} | Karachi, Pakistan`,
    "Experience",
    `${title} at ${employer} (2019 - present)`,
    `Skills: ${skills}`,
    "Ran campaigns and reporting for consumer brands with measurable growth.",
  ].join("\n");

beforeAll(async () => {
  db = await createTestDb("talent_pool");
  await db.root("update public.jobs set embedding = $1::extensions.vector where id = $2", [
    toPgVector((await embedder.embed(["social media marketing meta ads content strategy"], "document"))[0]),
    IDS.jobSocial,
  ]);
});
afterAll(async () => db?.close());

describe("bulk upload rules", () => {
  it("needs workspace membership and a lawful-basis confirmation", async () => {
    await expect(db.as(IDS.gary)("select start_pool_import($1, 1, true)", [IDS.acme])).rejects.toThrow(
      /not a workspace member/,
    );
    await expect(db.as(IDS.maya)("select start_pool_import($1, 1, true)", [IDS.acme])).rejects.toThrow(
      /not a workspace member/,
    );
    await expect(db.anon("select start_pool_import($1, 1, true)", [IDS.acme])).rejects.toThrow(/permission denied/);
    await expect(db.as(IDS.rita)("select start_pool_import($1, 1, false)", [IDS.acme])).rejects.toThrow(
      /confirm you are allowed/,
    );
  });

  it("enforces the batch cap and the pool size cap", async () => {
    await expect(db.as(IDS.rita)("select start_pool_import($1, 201, true)", [IDS.acme])).rejects.toThrow(
      /at most 200 files/,
    );
    await db.root("update companies set pool_cap = 3 where id = $1", [IDS.acme]);
    await expect(db.as(IDS.rita)("select start_pool_import($1, 4, true)", [IDS.acme])).rejects.toThrow(
      /room for 3 more/,
    );
    await db.root("update companies set pool_cap = 500 where id = $1", [IDS.acme]);
  });

  it("files must sit in the workspace's own pool folder", async () => {
    const imp = (await db.as(IDS.rita)<{ id: string }>("select start_pool_import($1, 2, true) id", [IDS.acme])).rows[0]
      .id;
    for (const path of [`pool/${IDS.globex}/x.pdf`, `${IDS.rita}/x.pdf`, `pool/${IDS.acme}/../x.pdf`])
      await expect(
        db.as(IDS.rita)("select queue_pool_files($1, $2::jsonb)", [
          imp,
          JSON.stringify([{ storage_path: path, original_filename: "x.pdf", size_bytes: 10 }]),
        ]),
      ).rejects.toThrow(/invalid file path/);
    // another workspace can't queue into Acme's upload
    await expect(db.as(IDS.gary)("select queue_pool_files($1, '[]'::jsonb)", [imp])).rejects.toThrow(
      /upload not found/,
    );
  });

  it("storage: members write only under their workspace's pool folder", async () => {
    await db.as(IDS.rita)("insert into storage.objects(bucket_id, name) values ('resumes', $1)", [
      `pool/${IDS.acme}/imp/a.pdf`,
    ]);
    await expect(
      db.as(IDS.gary)("insert into storage.objects(bucket_id, name) values ('resumes', $1)", [
        `pool/${IDS.acme}/imp/b.pdf`,
      ]),
    ).rejects.toThrow(/row-level security/);
    expect(
      (await db.as(IDS.gary)("select count(*)::int n from storage.objects where name like $1", [`pool/${IDS.acme}/%`]))
        .rows[0].n,
    ).toBe(0);
  });
});

describe("processing, dedupe and privacy", () => {
  it("100 resumes become 100 searchable profiles; duplicates merge; bad files fail without blocking others", async () => {
    const texts = Array.from({ length: 100 }, (_, i) =>
      cv(
        personName(i),
        `person${i}@example.test`,
        `+92 300 ${String(1000000 + i)}`,
        i % 2 ? "Social Media Manager" : "Accountant",
        `Employer ${i}`,
        i % 2 ? "meta ads, content strategy, copywriting" : "excel, bookkeeping, payroll",
      ),
    );
    const { res } = await upload(IDS.rita, IDS.acme, texts);
    expect(res).toMatchObject({ done: 100, failed: 0, duplicates: 0, remaining: 0 });
    const n = await db.as(IDS.rita)("select count(*)::int n from pool_candidates where workspace_id = $1", [IDS.acme]);
    expect(n.rows[0].n).toBe(100);
    const emb = await db.root("select count(*)::int n from pool_candidates where embedding is null");
    expect(emb.rows[0].n).toBe(0);

    // same email, same phone, same name+employer -> merged, not doubled; empty file -> failed
    const again = await upload(IDS.rita, IDS.acme, [
      cv("Someone Else", "PERSON1@example.test", "+1 555 0100", "Social Media Manager", "New Co", "seo"),
      cv("Another Name", "new@example.test", "+92 300 1000002", "Accountant", "X", "excel"),
      cv(personName(3), "other@example.test", "+44 1", "Social Media Manager", "Employer 3", "seo"),
      "too short",
    ]);
    expect(again.res).toMatchObject({ done: 0, duplicates: 3, failed: 1 });
    const failed = await db.as(IDS.rita)(
      "select error from pool_import_files where import_id = $1 and status = 'failed'",
      [again.importId],
    );
    expect(failed.rows[0].error).toMatch(/no readable text/);
    const merged = await db.as(IDS.rita)(
      "select skills from pool_candidates where email_norm = 'person1@example.test'",
    );
    expect(merged.rows[0].skills).toContain("seo");
    expect(
      (await db.as(IDS.rita)("select count(*)::int n from pool_candidates where workspace_id = $1", [IDS.acme])).rows[0]
        .n,
    ).toBe(100);
  });

  it("a second workspace, candidates and the public see none of them", async () => {
    for (const run of [db.as(IDS.gary), db.as(IDS.maya), db.anon.bind(db)])
      expect((await run("select count(*)::int n from pool_candidates")).rows[0].n).toBe(0);
    expect((await db.as(IDS.gary)("select count(*)::int n from search_pool($1)", [IDS.acme])).rows[0].n).toBe(0);
    expect((await db.as(IDS.gary)("select count(*)::int n from pool_import_files")).rows[0].n).toBe(0);
  });

  it("members can't insert directly or change protected fields; workspace fields are editable", async () => {
    await expect(
      db.as(IDS.rita)("insert into pool_candidates(workspace_id, full_name) values ($1, 'x')", [IDS.acme]),
    ).rejects.toThrow(/permission denied|row-level security/);
    const id = (await db.as(IDS.rita)("select id from pool_candidates where email_norm = 'person2@example.test'"))
      .rows[0].id;
    await expect(
      db.as(IDS.rita)("update pool_candidates set workspace_id = $2 where id = $1", [id, IDS.globex]),
    ).rejects.toThrow(/protected pool fields/);
    await expect(db.as(IDS.rita)("update pool_candidates set storage_path = 'x' where id = $1", [id])).rejects.toThrow(
      /protected pool fields/,
    );
    await db.as(IDS.rita)(
      "update pool_candidates set tags = '{karachi,senior}', notes = 'Great call', status = 'contacted', do_not_contact = true where id = $1",
      [id],
    );
    const a = await db.root(
      "select count(*)::int n from audit_log where action = 'pool.do_not_contact' and entity_id = $1",
      [id],
    );
    expect(a.rows[0].n).toBe(1);
    // Globex can't touch it
    const u = await db.as(IDS.gary)("update pool_candidates set notes = 'x' where id = $1", [id]);
    expect(u.rowCount).toBe(0);
  });

  it("search and filters: skills, title, location, experience, tag, status, keyword and semantic", async () => {
    const q = (args: string, params: unknown[] = []) =>
      db.as(IDS.rita)(`select * from search_pool($1, ${args})`, [IDS.acme, ...params]);
    expect((await q("p_skills => '{meta ads}'")).rows.length).toBe(50);
    expect((await q("p_skills => '{meta ads,bookkeeping}'")).rows.length).toBe(0);
    expect((await q("p_title => 'accountant'")).rows.length).toBe(50);
    expect((await q("p_location => 'karachi'")).rows[0].total).toBe("100");
    expect((await q("p_tag => 'Senior'")).rows.length).toBe(1);
    expect((await q("p_status => 'contacted'")).rows.length).toBe(1);
    expect((await q("p_text => 'person42@'")).rows.length).toBe(1);
    expect((await q("p_min_exp => 50")).rows.length).toBe(0);
    const [v] = await embedder.embed(["social media marketer with meta ads"], "query");
    const sem = await q("p_query_embedding => $2, p_limit => 10", [toPgVector(v)]);
    expect(sem.rows[0].headline ?? sem.rows[0].latest_title).toMatch(/social media/i);
  });

  it("pools are private by default; other workspaces get anonymous cards only after opt-in", async () => {
    const globexJob = (
      await db.root<{ id: string }>(
        `insert into public.jobs(company_id, source_type, title, description_summary, status, expires_at, embedding)
         select $1, 'verified', 'Content lead', 'Social content', 'published', now() + interval '30 days', embedding
         from public.jobs where id = $2 returning id`,
        [IDS.globex, IDS.jobSocial],
      )
    ).rows[0].id;
    expect((await db.as(IDS.gary)("select * from talent_pool_for_job($1)", [globexJob])).rows).toHaveLength(0);
    await db.as(IDS.gary)("update companies set share_pool_anonymously = true where id = $1", [IDS.acme]); // not admin of Acme
    expect((await db.as(IDS.gary)("select * from talent_pool_for_job($1)", [globexJob])).rows).toHaveLength(0);
    await db.as(IDS.rita)("update companies set share_pool_anonymously = true where id = $1", [IDS.acme]);
    const cards = (await db.as(IDS.gary)("select * from talent_pool_for_job($1)", [globexJob])).rows;
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards)
      expect(c).toMatchObject({
        is_own: false,
        full_name: null,
        contact_email: null,
        contact_phone: null,
        status: null,
      });
    const mine = (await db.as(IDS.rita)("select * from talent_pool_for_job($1)", [IDS.jobSocial])).rows;
    expect(mine[0].is_own).toBe(true);
    expect(mine[0].full_name).toBeTruthy();
    await expect(db.as(IDS.maya)("select * from talent_pool_for_job($1)", [globexJob])).rejects.toThrow(/not found/);
  });
});

describe("the person the resume is about", () => {
  beforeAll(async () => {
    await db.root(
      `insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at)
       values ($1, 'person5@example.test', '{"role":"candidate"}', now()), ($2, 'person7@example.test', '{"role":"candidate"}', null)`,
      [PERSON, IMPOSTER],
    );
    // the signup trigger already gives them a candidate profile when metadata has the role
    await db
      .as(PERSON)("select choose_role('candidate', 'Person Five')")
      .catch(() => {});
    await db
      .as(IMPOSTER)("select choose_role('candidate', 'Not Verified')")
      .catch(() => {});
  });

  it("only a verified matching email sees it", async () => {
    const mine = await db.as(PERSON)("select * from my_uploaded_profiles()");
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({ company_name: "Acme Social", claimed: false });
    expect((await db.as(IMPOSTER)("select * from my_uploaded_profiles()")).rows).toHaveLength(0);
    expect((await db.as(PERSON)("select count(*)::int n from pool_candidates")).rows[0].n).toBe(0);
  });

  it("claiming copies it into their profile; the recruiter keeps the entry, marked as on Vouch", async () => {
    const id = (await db.as(PERSON)("select id from my_uploaded_profiles()")).rows[0].id;
    await expect(db.as(IMPOSTER)("select claim_uploaded_profile($1)", [id])).rejects.toThrow(/verify your email/);
    await db.as(PERSON)("select claim_uploaded_profile($1)", [id]);
    const me = await db.as(PERSON)("select headline, needs_matching from candidates where user_id = $1", [PERSON]);
    expect(me.rows[0].headline).toMatch(/social media manager/i);
    const skills = await db.as(PERSON)(
      "select array_agg(skill) s from candidate_skills cs join candidates c on c.id = cs.candidate_id where c.user_id = $1",
      [PERSON],
    );
    expect(skills.rows[0].s).toContain("meta ads");
    const pool = await db.as(IDS.rita)("select claimed_candidate_id from pool_candidates where id = $1", [id]);
    expect(pool.rows[0].claimed_candidate_id).toBeTruthy();
  });

  it("the person can delete it from the pool; the storage path comes back for removal", async () => {
    const id = (await db.as(PERSON)("select id from my_uploaded_profiles()")).rows[0].id;
    await expect(db.as(IDS.gary)("select delete_pool_candidate($1)", [id])).rejects.toThrow(/not found/);
    const paths = (await db.as(PERSON)("select delete_pool_candidate($1) p", [id])).rows[0].p;
    expect(paths[0]).toMatch(new RegExp(`^pool/${IDS.acme}/`));
    expect((await db.as(IDS.rita)("select count(*)::int n from pool_candidates where id = $1", [id])).rows[0].n).toBe(
      0,
    );
  });

  it("account deletion erases pool profiles for that email everywhere (service only)", async () => {
    await expect(db.as(IDS.rita)("select erase_uploaded_profiles_for_email('person9@example.test')")).rejects.toThrow(
      /permission denied/,
    );
    const p = (await db.service("select erase_uploaded_profiles_for_email('Person9@example.test') p")).rows[0].p;
    expect(p).toHaveLength(1);
    expect(
      (await db.root("select count(*)::int n from pool_candidates where email_norm = 'person9@example.test'")).rows[0]
        .n,
    ).toBe(0);
  });

  it("the pool cap is enforced when profiles are created", async () => {
    await db.root("update companies set pool_cap = 0 where id = $1", [IDS.globex]);
    await expect(
      db.service("insert into pool_candidates(workspace_id, full_name) values ($1, 'x')", [IDS.globex]),
    ).rejects.toThrow(/talent pool is full/);
  });
});
