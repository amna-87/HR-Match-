// C2 (D-031): do_not_contact and the global suppression list are enforced in the
// database for every channel; lawful basis required and audited; daily cap;
// 1 email per address per 7 days across Vouch; complaints suppress + pause.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";
import { contactHash } from "../../src/lib/outreach/message";

let db: TestDb;
const ids: Record<string, string> = {};
async function add(ws: string, key: string, email: string | null, extra = "") {
  const r = await db.service<{ id: string }>(
    `insert into pool_candidates(workspace_id, full_name, contact_email, contact_phone${extra ? ", do_not_contact" : ""})
     values ($1, $2, $3, $4${extra ? ", true" : ""}) returning id`,
    [ws, `Person ${key}`, email, email ? null : "+92 300 5550000"],
  );
  ids[key] = r.rows[0].id;
}
const prep = (who: string, job: string, keys: string[], channel = "copy", lawful = true) =>
  db.as(who)("select * from prepare_outreach($1, $2::uuid[], $3, $4)", [job, keys.map((k) => ids[k]), channel, lawful]);

beforeAll(async () => {
  db = await createTestDb("outreach");
  await add(IDS.acme, "ok", "ok@example.test");
  await add(IDS.acme, "dnc", "dnc@example.test", "dnc");
  await add(IDS.acme, "optout", "OptOut@Example.test");
  await add(IDS.acme, "phoneonly", null);
  await add(IDS.globex, "globex", "g@example.test");
  await add(IDS.globex, "same", "ok@example.test");
});
afterAll(async () => db?.close());

describe("outreach safeguards", () => {
  it("the TypeScript and database contact hashes agree", async () => {
    const r = await db.root("select contact_hash($1) e, contact_hash($2) p", [
      "  OK@Example.test ",
      "+92 (300) 555-0000",
    ]);
    expect(r.rows[0].e).toBe(contactHash("ok@example.test"));
    expect(r.rows[0].p).toBe(contactHash("0300 5550000"));
  });

  it("needs a lawful-basis confirmation and your own job and pool", async () => {
    await expect(prep(IDS.rita, IDS.jobSocial, ["ok"], "copy", false)).rejects.toThrow(/lawful basis/);
    await expect(prep(IDS.gary, IDS.jobSocial, ["ok"])).rejects.toThrow(/job not found/);
    // another workspace's profiles are silently ignored
    expect((await prep(IDS.rita, IDS.jobSocial, ["globex"])).rows).toHaveLength(0);
  });

  it("do-not-contact and opted-out people are blocked in the database, for every workspace", async () => {
    await db.service("select suppress_contact(contact_hash('optout@example.test'))");
    const r = await prep(IDS.rita, IDS.jobSocial, ["ok", "dnc", "optout", "phoneonly"]);
    const by = Object.fromEntries(r.rows.map((x) => [x.full_name, x]));
    expect(by["Person ok"]).toMatchObject({ blocked: null, contact_email: "ok@example.test" });
    expect(by["Person dnc"]).toMatchObject({ blocked: "marked do not contact", contact_email: null });
    expect(by["Person optout"]).toMatchObject({ blocked: "unsubscribed from Vouch messages", contact_email: null });
    expect(by["Person phoneonly"]).toMatchObject({ blocked: null, contact_phone: "+92 300 5550000" });
    // the person moved to "contacted"; the confirmation is audited
    expect((await db.root("select status from pool_candidates where id = $1", [ids.ok])).rows[0].status).toBe(
      "contacted",
    );
    const a = await db.root(
      "select metadata from audit_log where action = 'outreach.prepared' order by created_at desc limit 1",
    );
    expect(a.rows[0].metadata).toMatchObject({ lawful_basis_confirmed: true, channel: "copy", allowed: 2 });
  });

  it("users can't read or edit the suppression list or forge outreach logs", async () => {
    // RLS with no policies: users read nothing
    expect((await db.as(IDS.rita)("select count(*)::int n from suppression_list")).rows[0].n).toBe(0);
    await expect(db.as(IDS.rita)("select suppress_contact('x')")).rejects.toThrow(/permission denied/);
    await expect(
      db.as(IDS.rita)("insert into outreach_log(workspace_id, channel) values ($1, 'email')", [IDS.acme]),
    ).rejects.toThrow(/permission denied|row-level security/);
    expect((await db.as(IDS.gary)("select count(*)::int n from outreach_log")).rows[0].n).toBe(0);
  });

  it("email: one message per address per 7 days across all of Vouch", async () => {
    const globexJob = (
      await db.root<{ id: string }>(
        "insert into jobs(company_id, source_type, title, status) values ($1, 'verified', 'Analyst', 'published') returning id",
        [IDS.globex],
      )
    ).rows[0].id;
    expect((await prep(IDS.rita, IDS.jobSocial, ["ok"], "email")).rows[0].blocked).toBeNull();
    const again = await prep(IDS.gary, globexJob, ["same"], "email");
    expect(again.rows[0].blocked).toMatch(/already emailed/);
    // copy/export are not limited by the email rule
    expect((await prep(IDS.gary, globexJob, ["same"], "copy")).rows[0].blocked).toBeNull();
  });

  it("the workspace daily cap applies", async () => {
    await db.root("update companies set daily_send_cap = 4 where id = $1", [IDS.acme]);
    const r = await prep(IDS.rita, IDS.jobSocial, ["ok", "phoneonly"]);
    expect(r.rows.map((x) => x.blocked)).toEqual([null, "daily limit reached"]);
  });

  it("complaints suppress the address and pause a noisy workspace; only Vouch can lift it", async () => {
    await db.root("update companies set daily_send_cap = 100 where id = $1", [IDS.acme]);
    for (let i = 0; i < 3; i++) {
      await db.service(
        "insert into outreach_log(workspace_id, channel, contact_hash, provider_message_id) values ($1, 'email', contact_hash($2), $3)",
        [IDS.acme, `c${i}@example.test`, `msg-${i}`],
      );
      await db.service("select record_outreach_complaint($1)", [`msg-${i}`]);
    }
    expect((await db.root("select count(*)::int n from suppression_list where reason = 'complaint'")).rows[0].n).toBe(
      3,
    );
    expect(
      (await db.root("select outreach_paused_at from companies where id = $1", [IDS.acme])).rows[0].outreach_paused_at,
    ).toBeTruthy();
    await expect(prep(IDS.rita, IDS.jobSocial, ["ok"], "email")).rejects.toThrow(/paused/);
    await expect(
      db.as(IDS.rita)("update companies set outreach_paused_at = null where id = $1", [IDS.acme]),
    ).rejects.toThrow(/only be changed by Vouch/);
  });
});
