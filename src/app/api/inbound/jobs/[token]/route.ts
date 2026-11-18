import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { aiConfigured } from "@/lib/parsing/claude";
import { parseJobText } from "@/lib/parsing/job";
import { basicParseJob } from "@/lib/parsing/basic-job";
import { createJobFromEmail, type InboundEmail } from "@/lib/jobs/inbound";

export const dynamic = "force-dynamic";

/**
 * Forward-by-email jobs (D-037). An email-forwarding service posts each email
 * here (the URL holds the workspace's secret token). Accepts JSON
 * {subject, text, from} or form posts (Mailgun: body-plain, SendGrid: text).
 * Each email becomes a DRAFT job in the workspace for review.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = getPool();
  const inbox = (
    await db.query<{ workspace_id: string }>("select workspace_id from public.job_inboxes where token = $1", [token])
  ).rows[0];
  if (!inbox) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await checkRateLimit(db, "inbound", inbox.workspace_id)))
    return NextResponse.json({ error: "too many emails today" }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > 512_000)
    return NextResponse.json({ error: "email too large" }, { status: 413 });

  let email: InboundEmail;
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      email = {
        subject: String(j.subject ?? ""),
        text: String(j.text ?? j.body ?? j.plain ?? ""),
        from: String(j.from ?? ""),
      };
    } else {
      const f = await req.formData();
      const get = (...k: string[]) => k.map((x) => f.get(x)).find((v) => typeof v === "string") as string | undefined;
      email = {
        subject: get("subject") ?? "",
        text: get("stripped-text", "body-plain", "text", "plain") ?? "",
        from: get("from", "sender") ?? "",
      };
    }
  } catch {
    return NextResponse.json({ error: "could not read the email" }, { status: 400 });
  }

  const parse = async (t: string) => {
    if (aiConfigured()) {
      try {
        return await parseJobText(t);
      } catch {
        /* fall back */
      }
    }
    return basicParseJob(t);
  };
  const res = await createJobFromEmail(db, inbox.workspace_id, email, parse);
  // Answer 200 for "handled but not created" so forwarding services don't retry forever.
  return res.ok
    ? NextResponse.json({ created: res.jobId })
    : NextResponse.json(
        { skipped: res.error },
        { status: res.status === 422 || res.status === 409 ? 200 : res.status },
      );
}
