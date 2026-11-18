// A1 (addendum): companies are workspaces (D-026). Personal workspaces, one
// workspace per recruiter, plan limits only changeable by Vouch, personal
// workspaces not exposed as public companies.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";

let db: TestDb;
const SOLO = "00000000-0000-4000-8000-0000000000d1";

beforeAll(async () => {
  db = await createTestDb("workspaces");
  await db.root(
    `insert into auth.users(id, email, raw_user_meta_data) values ($1, 'solo@example.test', '{"role":"recruiter","full_name":"Solo Recruiter"}')`,
    [SOLO],
  );
  await db.root("update public.users set role = 'recruiter', onboarded = true where id = $1", [SOLO]);
});
afterAll(async () => db?.close());

describe("workspaces", () => {
  let ws: string;

  it("a recruiter can start a personal workspace and becomes its admin", async () => {
    ws = (await db.as(SOLO)<{ id: string }>("select create_workspace('personal', 'Solo hiring') id")).rows[0].id;
    const m = await db.as(SOLO)("select role from company_members where company_id = $1 and user_id = $2", [ws, SOLO]);
    expect(m.rows[0].role).toBe("admin");
    const c = await db.as(SOLO)("select kind, plan, pool_cap, share_pool_anonymously from companies where id = $1", [
      ws,
    ]);
    expect(c.rows[0]).toMatchObject({ kind: "personal", plan: "free", pool_cap: 500, share_pool_anonymously: false });
  });

  it("only one workspace per recruiter, and candidates can't create one", async () => {
    await expect(db.as(SOLO)("select create_workspace('company', 'Second')")).rejects.toThrow(/already belong/);
    await expect(db.as(IDS.maya)("select create_workspace('personal', 'x')")).rejects.toThrow(/only recruiters/);
    await expect(db.anon("select create_workspace('personal', 'x')")).rejects.toThrow(/permission denied/);
  });

  it("personal workspaces are hidden from the public; members still see their own", async () => {
    expect((await db.anon("select count(*)::int n from companies where id = $1", [ws])).rows[0].n).toBe(0);
    expect((await db.as(IDS.gary)("select count(*)::int n from companies where id = $1", [ws])).rows[0].n).toBe(0);
    expect((await db.as(SOLO)("select count(*)::int n from companies where id = $1", [ws])).rows[0].n).toBe(1);
    expect((await db.anon("select count(*)::int n from companies where id = $1", [IDS.acme])).rows[0].n).toBe(1);
  });

  it("plan and limits can't be raised by the workspace itself", async () => {
    await expect(db.as(SOLO)("update companies set pool_cap = 100000 where id = $1", [ws])).rejects.toThrow(
      /only be changed by Vouch/,
    );
    await expect(db.as(SOLO)("update companies set plan = 'pro' where id = $1", [ws])).rejects.toThrow(
      /only be changed by Vouch/,
    );
    await db.root("update companies set pool_cap = 1000 where id = $1", [ws]); // trusted backend / admin
  });

  it("turning pool sharing on or off is audited", async () => {
    await db.as(SOLO)("update companies set share_pool_anonymously = true where id = $1", [ws]);
    const a = await db.root(
      "select count(*)::int n from audit_log where action = 'workspace.pool_sharing' and entity_id = $1",
      [ws],
    );
    expect(a.rows[0].n).toBe(1);
  });
});

describe("admins can recruit too (D-034)", () => {
  it("an admin can open their own workspace, but sees no other workspace's pool", async () => {
    const ws = (await db.as(IDS.admin)<{ id: string }>("select create_workspace('personal', 'Admin hiring') id"))
      .rows[0].id;
    expect(ws).toBeTruthy();
    expect((await db.as(IDS.admin)("select start_pool_import($1, 1, true) id", [ws])).rows[0].id).toBeTruthy();
    expect(
      (await db.as(IDS.admin)("select count(*)::int n from pool_candidates where workspace_id <> $1", [ws])).rows[0].n,
    ).toBe(0);
  });
});
