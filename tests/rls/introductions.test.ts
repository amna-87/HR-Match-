// Network introductions (D-026, D-030): a recruiter sees an anonymous card from
// another workspace's shared pool and asks to be introduced. Full details are
// released only after the person agrees (in the app, or via the uploading
// workspace with a recorded lawful-basis statement). Private notes never travel.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";

let db: TestDb;
const vec = `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)).join(",")}]`;
let globexJob: string;
const pool: Record<string, string> = {};

async function addPool(key: string, extra: Record<string, unknown> = {}) {
  const r = await db.service<{ id: string }>(
    `insert into pool_candidates(workspace_id, full_name, headline, contact_email, notes, tags, storage_path, embedding,
       do_not_contact, claimed_candidate_id)
     values ($1, $2, 'Social media manager', $3, 'Private: salary ask 200k', '{vip}', $4, $5::extensions.vector, $6, $7)
     returning id`,
    [
      IDS.acme,
      `Person ${key}`,
      `${key}@example.test`,
      `pool/${IDS.acme}/x/${key}.pdf`,
      vec,
      extra.dnc ?? false,
      extra.claimed ?? null,
    ],
  );
  pool[key] = r.rows[0].id;
}

beforeAll(async () => {
  db = await createTestDb("introductions");
  globexJob = (
    await db.root<{ id: string }>(
      `insert into jobs(company_id, source_type, title, description_summary, status, embedding)
       values ($1, 'verified', 'Content lead', 'Social content', 'published', $2::extensions.vector) returning id`,
      [IDS.globex, vec],
    )
  ).rows[0].id;
  const mayaCandidate = (await db.root("select id from candidates where user_id = $1", [IDS.maya])).rows[0].id;
  await addPool("a");
  await addPool("b");
  await addPool("dnc", { dnc: true });
  await addPool("onvouch", { claimed: mayaCandidate });
});
afterAll(async () => db?.close());

describe("introductions", () => {
  it("only possible when the uploading workspace shares its pool", async () => {
    await expect(db.as(IDS.gary)("select request_introduction($1, $2)", [globexJob, pool.a])).rejects.toThrow(
      /not available/,
    );
    await db.as(IDS.rita)("update companies set share_pool_anonymously = true where id = $1", [IDS.acme]);
  });

  it("anonymous cards never include do-not-contact people, and they can't be requested", async () => {
    const cards = await db.as(IDS.gary)("select candidate_id from talent_pool_for_job($1)", [globexJob]);
    const ids = cards.rows.map((r) => r.candidate_id);
    expect(ids).toContain(pool.a);
    expect(ids).not.toContain(pool.dnc);
    await expect(db.as(IDS.gary)("select request_introduction($1, $2)", [globexJob, pool.dnc])).rejects.toThrow(
      /not available/,
    );
  });

  it("requests need a job of your own; candidates and your own pool are refused", async () => {
    await expect(db.as(IDS.maya)("select request_introduction($1, $2)", [globexJob, pool.a])).rejects.toThrow(
      /job not found/,
    );
    await expect(db.as(IDS.rita)("select request_introduction($1, $2)", [IDS.jobSocial, pool.a])).rejects.toThrow(
      /not available/,
    );
  });

  let introA: string;
  it("the requester sees only an anonymous, pending request", async () => {
    introA = (
      await db.as(IDS.gary)<{ id: string }>("select request_introduction($1, $2, 'Great fit') id", [globexJob, pool.a])
    ).rows[0].id;
    await expect(db.as(IDS.gary)("select request_introduction($1, $2)", [globexJob, pool.a])).rejects.toThrow(
      /already asked/,
    );
    const sent = await db.as(IDS.gary)("select * from sent_introductions($1)", [IDS.globex]);
    expect(sent.rows[0]).toMatchObject({ status: "waiting_owner", full_name: null, contact_email: null });
    expect((await db.as(IDS.gary)("select * from introduced_profile($1)", [introA])).rows).toHaveLength(0);
    expect((await db.as(IDS.gary)("select count(*)::int n from intro_requests")).rows[0].n).toBe(0); // no direct table reads
    // other workspaces can't read someone else's sent list
    expect((await db.as(IDS.rita)("select * from sent_introductions($1)", [IDS.globex])).rows).toHaveLength(0);
  });

  it("the uploading workspace answers; 'agreed' needs the lawful-basis confirmation", async () => {
    const inbox = await db.as(IDS.rita)("select * from introductions_for_my_pool($1)", [IDS.acme]);
    expect(inbox.rows[0]).toMatchObject({
      status: "waiting_owner",
      requesting_company: "Globex Financial",
      person: "Person a",
    });
    await expect(db.as(IDS.gary)("select answer_introduction_as_owner($1, true, true)", [introA])).rejects.toThrow(
      /not found/,
    );
    await expect(db.as(IDS.rita)("select answer_introduction_as_owner($1, true, false)", [introA])).rejects.toThrow(
      /confirm that the person agreed/,
    );
    await db.as(IDS.rita)("select answer_introduction_as_owner($1, true, true)", [introA]);
    const audit = await db.root(
      "select metadata from audit_log where action = 'intro.accepted_by_owner' and entity_id = $1",
      [introA],
    );
    expect(audit.rows[0].metadata.lawful_basis_confirmed).toBe(true);
  });

  it("once accepted the requester sees the profile and resume, never the private notes or tags", async () => {
    const p = (await db.as(IDS.gary)("select * from introduced_profile($1)", [introA])).rows[0];
    expect(p).toMatchObject({ full_name: "Person a", contact_email: "a@example.test", has_resume: true });
    expect(JSON.stringify(p)).not.toMatch(/salary ask|vip/);
    expect((await db.as(IDS.gary)("select introduced_resume_path($1) p", [introA])).rows[0].p).toMatch(/a\.pdf$/);
    expect((await db.as(IDS.ivy)("select introduced_resume_path($1) p", [introA])).rows[0].p).toBeNull();
  });

  it("a 'no' reveals nothing", async () => {
    const id = (await db.as(IDS.gary)<{ id: string }>("select request_introduction($1, $2) id", [globexJob, pool.b]))
      .rows[0].id;
    await db.as(IDS.rita)("select answer_introduction_as_owner($1, false, false)", [id]);
    expect((await db.as(IDS.gary)("select * from introduced_profile($1)", [id])).rows).toHaveLength(0);
    const sent = await db.as(IDS.gary)("select status, full_name from sent_introductions($1) where id = $2", [
      IDS.globex,
      id,
    ]);
    expect(sent.rows[0]).toMatchObject({ status: "declined", full_name: null });
  });

  it("people on Vouch answer themselves; the uploading workspace can't answer for them", async () => {
    const id = (
      await db.as(IDS.gary)<{ id: string }>("select request_introduction($1, $2) id", [globexJob, pool.onvouch])
    ).rows[0].id;
    await expect(db.as(IDS.rita)("select answer_introduction_as_owner($1, true, true)", [id])).rejects.toThrow(
      /not found/,
    );
    const mine = await db.as(IDS.maya)("select * from my_introduction_requests()");
    expect(mine.rows[0]).toMatchObject({
      status: "waiting_person",
      company: "Globex Financial",
      job_title: "Content lead",
    });
    expect((await db.as(IDS.jordan)("select * from my_introduction_requests()")).rows).toHaveLength(0);
    await expect(db.as(IDS.jordan)("select answer_introduction_as_person($1, true)", [id])).rejects.toThrow(
      /not found/,
    );
    await db.as(IDS.maya)("select answer_introduction_as_person($1, true)", [id]);
    expect((await db.as(IDS.gary)("select full_name from introduced_profile($1)", [id])).rows[0].full_name).toBe(
      "Person onvouch",
    );
  });
});
