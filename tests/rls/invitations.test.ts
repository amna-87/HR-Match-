// Recruiter seat invitations: only company admins invite; only the invited,
// signed-in recruiter (matching email) can accept; other companies see nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";

let db: TestDb;
const NEW_RECRUITER = "00000000-0000-4000-8000-0000000000aa";

beforeAll(async () => {
  db = await createTestDb("invitations");
  await db.root(
    "insert into auth.users(id, email, raw_user_meta_data) values ($1, 'newhire@acme.example.test', '{\"role\":\"recruiter\"}')",
    [NEW_RECRUITER],
  );
});
afterAll(async () => db?.close());

describe("company invitations", () => {
  let inviteId: string;

  it("only a company admin can invite", async () => {
    await expect(db.as(IDS.gary)("select invite_recruiter($1, 'x@y.test')", [IDS.acme])).rejects.toThrow(
      /not a company admin/,
    );
    await expect(db.as(IDS.maya)("select invite_recruiter($1, 'x@y.test')", [IDS.acme])).rejects.toThrow(
      /not a company admin/,
    );
    await expect(db.anon("select invite_recruiter($1, 'x@y.test')", [IDS.acme])).rejects.toThrow(/permission denied/);
    const r = await db.as(IDS.rita)<{ id: string }>("select invite_recruiter($1, 'NewHire@acme.example.test') id", [
      IDS.acme,
    ]);
    inviteId = r.rows[0].id;
  });

  it("re-inviting refreshes instead of duplicating; members can't be invited", async () => {
    const r = await db.as(IDS.rita)<{ id: string }>(
      "select invite_recruiter($1, 'newhire@acme.example.test', 'admin') id",
      [IDS.acme],
    );
    expect(r.rows[0].id).toBe(inviteId);
    await expect(db.as(IDS.rita)("select invite_recruiter($1, 'rita@acme.example.test')", [IDS.acme])).rejects.toThrow(
      /already a member/,
    );
  });

  it("is visible to the company and the invitee only; nobody can write directly", async () => {
    expect((await db.as(IDS.rita)("select count(*)::int n from company_invitations")).rows[0].n).toBe(1);
    expect((await db.as(NEW_RECRUITER)("select count(*)::int n from company_invitations")).rows[0].n).toBe(1);
    expect((await db.as(IDS.gary)("select count(*)::int n from company_invitations")).rows[0].n).toBe(0);
    expect((await db.as(IDS.maya)("select count(*)::int n from company_invitations")).rows[0].n).toBe(0);
    await expect(db.as(IDS.rita)("update company_invitations set status = 'accepted'")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("only the invited recruiter can accept", async () => {
    await expect(db.as(IDS.gary)("select accept_invitation($1)", [inviteId])).rejects.toThrow(/not found/);
    await expect(db.as(IDS.maya)("select accept_invitation($1)", [inviteId])).rejects.toThrow(/only recruiter/);
    const r = await db.as(NEW_RECRUITER)("select accept_invitation($1) c", [inviteId]);
    expect(r.rows[0].c).toBe(IDS.acme);
    const m = await db.root("select role from company_members where user_id = $1 and company_id = $2", [
      NEW_RECRUITER,
      IDS.acme,
    ]);
    expect(m.rows[0].role).toBe("admin");
    // the new member now sees Acme's draft job and colleagues' emails
    expect(
      (await db.as(NEW_RECRUITER)("select count(*)::int n from jobs where id = $1", [IDS.jobDraft])).rows[0].n,
    ).toBe(1);
    const list = await db.as(NEW_RECRUITER)("select email from company_member_list($1)", [IDS.acme]);
    expect(list.rows.map((x) => x.email)).toEqual(
      expect.arrayContaining(["rita@acme.example.test", "newhire@acme.example.test"]),
    );
    await expect(db.as(NEW_RECRUITER)("select accept_invitation($1)", [inviteId])).rejects.toThrow(/not found/);
  });

  it("other companies can't list Acme's members", async () => {
    expect((await db.as(IDS.gary)("select count(*)::int n from company_member_list($1)", [IDS.acme])).rows[0].n).toBe(
      0,
    );
  });

  it("revoked and expired invitations can't be accepted", async () => {
    const a = (
      await db.as(IDS.rita)<{ id: string }>("select invite_recruiter($1, 'ivy@initech.example.test') id", [IDS.acme])
    ).rows[0].id;
    await expect(db.as(IDS.gary)("select revoke_invitation($1)", [a])).rejects.toThrow(/not found/);
    await db.as(IDS.rita)("select revoke_invitation($1)", [a]);
    await expect(db.as(IDS.ivy)("select accept_invitation($1)", [a])).rejects.toThrow(/not found/);
    const b = (
      await db.as(IDS.rita)<{ id: string }>("select invite_recruiter($1, 'ivy@initech.example.test') id", [IDS.acme])
    ).rows[0].id;
    await db.root("update company_invitations set expires_at = now() - interval '1 minute' where id = $1", [b]);
    await expect(db.as(IDS.ivy)("select accept_invitation($1)", [b])).rejects.toThrow(/expired/);
  });

  it("every step is audited", async () => {
    const r = await db.root("select action from audit_log where entity = 'company_invitations'");
    expect(r.rows.map((x) => x.action)).toEqual(
      expect.arrayContaining(["company.invitation_sent", "company.invitation_accepted", "company.invitation_revoked"]),
    );
  });
});

describe("apply instructions", () => {
  it("recruiters can set next-step instructions on their own jobs only", async () => {
    expect(
      (
        await db.as(IDS.rita)("update jobs set apply_instructions = 'We reply within 5 days.' where id = $1", [
          IDS.jobSocial,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (await db.as(IDS.gary)("update jobs set apply_instructions = 'x' where id = $1", [IDS.jobSocial])).rowCount,
    ).toBe(0);
    // signed-in users read them; anonymous visitors can't (they may hold contacts, 7c)
    const signedIn = await db.as(IDS.maya)("select apply_instructions from jobs where id = $1", [IDS.jobSocial]);
    expect(signedIn.rows[0].apply_instructions).toBe("We reply within 5 days.");
    await expect(db.anon("select apply_instructions from jobs where id = $1", [IDS.jobSocial])).rejects.toThrow(
      /permission denied/,
    );
  });
});
