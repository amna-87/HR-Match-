// Forward-by-email jobs (D-037): turn a forwarded email into a DRAFT job in the
// inbox's workspace. Used by /api/inbound/jobs/<token>; kept separate for tests.
import type { Queryable } from "@/lib/db";
import type { ParsedJob } from "@/lib/parsing/schemas";
import { basicParseJob } from "@/lib/parsing/basic-job";
import { sanitizeLine, sanitizeText } from "@/lib/security/sanitize";

export type InboundEmail = { subject: string; text: string; from?: string };
export type InboundResult = { ok: true; jobId: string } | { ok: false; status: number; error: string };

/** Drop forwarding headers ("---------- Forwarded message ----------", From:, Date: ...). */
export function cleanForwarded(text: string): string {
  return text
    .replace(/^>+ ?/gm, "")
    .replace(/^-{2,}\s*Forwarded message\s*-{2,}\s*$/gim, "")
    .replace(/^(From|Date|Sent|To|Cc|Subject):.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function createJobFromEmail(
  db: Queryable,
  workspaceId: string,
  email: InboundEmail,
  parse: (text: string) => Promise<ParsedJob> = async (t) => basicParseJob(t),
): Promise<InboundResult> {
  const subject = sanitizeLine(email.subject.replace(/^(fwd?|fw):\s*/i, ""), 200);
  const body = sanitizeText(cleanForwarded(email.text), 20000);
  if (body.length + subject.length < 20) return { ok: false, status: 422, error: "The email is empty." };
  const p = await parse(`${subject}\n${body}`);
  const title = sanitizeLine(p.title || subject, 200);
  if (title.length < 2) return { ok: false, status: 422, error: "No job title found." };
  const method = p.apply_method === "unknown" ? null : p.apply_method;
  if (!method || !p.apply_target)
    return { ok: false, status: 422, error: "No way to apply found (email, phone, WhatsApp or link)." };
  const dup = await db.query("select 1 from public.find_similar_jobs($1, $2, $3, '', $4) limit 1", [
    title,
    p.company_name || null,
    p.location || null,
    workspaceId,
  ]);
  if (dup.rows.length) return { ok: false, status: 409, error: "This job is already listed." };
  const r = await db.query<{ id: string }>(
    `insert into public.jobs(source_type, origin, owner_workspace_id, visibility, source_name, source_company_name,
       title, description_summary, required_skills, min_exp, location, work_mode, employment_type,
       apply_method, apply_target, status)
     values ('sourced', 'email_forwarded', $1, 'workspace', 'Forwarded email', $2, $3, $4, $5, $6, $7, $8, $9,
       $10::public.apply_method, $11, 'draft')
     returning id`,
    [
      workspaceId,
      p.company_name || null,
      title,
      (p.description_summary || body).slice(0, 1500),
      p.required_skills,
      p.min_exp,
      p.location || null,
      p.work_mode,
      p.employment_type,
      method,
      p.apply_target,
    ],
  );
  await db.query(
    "update public.job_inboxes set last_received_at = now(), received_count = received_count + 1 where workspace_id = $1",
    [workspaceId],
  );
  return { ok: true, jobId: r.rows[0].id };
}
