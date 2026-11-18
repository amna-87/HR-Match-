// D-037: forward-by-email jobs. Only workspace admins create/reset the inbox;
// only members can read its address; each email becomes a DRAFT job in that
// workspace (never public), duplicates and emails without a way to apply are skipped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";
import { cleanForwarded, createJobFromEmail } from "../../src/lib/jobs/inbound";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb("job_inbox");
});
afterAll(async () => db?.close());
const svc = () => ({ query: (s: string, p?: unknown[]) => db.service(s, p ?? []) }) as never;

describe("job inbox", () => {
  let token: string;
  it("workspace admins create it; others can't read it", async () => {
    await expect(db.as(IDS.gary)("select reset_job_inbox($1)", [IDS.acme])).rejects.toThrow(/workspace admins/);
    token = (await db.as(IDS.rita)<{ t: string }>("select reset_job_inbox($1) t", [IDS.acme])).rows[0].t;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
    expect((await db.as(IDS.rita)("select token from job_inboxes")).rows[0].token).toBe(token);
    expect((await db.as(IDS.gary)("select count(*)::int n from job_inboxes")).rows[0].n).toBe(0);
    expect((await db.as(IDS.maya)("select count(*)::int n from job_inboxes")).rows[0].n).toBe(0);
  });

  it("a forwarded email becomes a draft workspace job", async () => {
    const r = await createJobFromEmail(svc(), IDS.acme, {
      subject: "Fwd: We're hiring: Store Manager",
      text: "---------- Forwarded message ---------\nFrom: someone@example.test\n\nStore Manager\nLocation: Karachi\nSend CV to careers@shopco.example.test",
    });
    expect(r.ok).toBe(true);
    const j = await db.root("select * from jobs where id = $1", [(r as { jobId: string }).jobId]);
    expect(j.rows[0]).toMatchObject({
      status: "draft",
      visibility: "workspace",
      origin: "email_forwarded",
      owner_workspace_id: IDS.acme,
      apply_method: "email",
      apply_target: "careers@shopco.example.test",
      location: "Karachi",
    });
    expect(
      (await db.root("select received_count from job_inboxes where workspace_id = $1", [IDS.acme])).rows[0]
        .received_count,
    ).toBe(1);
  });

  it("skips duplicates and emails with no way to apply", async () => {
    const dup = await createJobFromEmail(svc(), IDS.acme, {
      subject: "Store Manager",
      text: "Store Manager\nLocation: Karachi\nSend CV to careers@shopco.example.test",
    });
    expect(dup).toMatchObject({ ok: false, status: 409 });
    const none = await createJobFromEmail(svc(), IDS.acme, {
      subject: "Hello",
      text: "Just saying hi, no job here at all.",
    });
    expect(none).toMatchObject({ ok: false, status: 422 });
  });

  it("strips forwarding headers", () => {
    expect(cleanForwarded("> From: a@b.c\n> Subject: x\n> Real text")).toBe("Real text");
  });
});
