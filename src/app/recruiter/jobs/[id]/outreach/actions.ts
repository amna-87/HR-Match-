"use server";
// C2 outreach (D-031). The database (prepare_outreach) decides who may be
// contacted: do-not-contact, the global suppression list, caps and the
// lawful-basis confirmation are enforced there, for every channel.
import { requireRecruiter } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { getEmailSender } from "@/lib/email/sender";
import { sanitizeText } from "@/lib/security/sanitize";
import { buildMessage, contactHash, optOutToken, optOutUrl, type OutreachJob } from "@/lib/outreach/message";

export type OutreachRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  blocked: string | null;
  subject?: string;
  message?: string;
  sent?: boolean;
};
export type OutreachResult = { error?: string; rows?: OutreachRow[]; csv?: string };

export const emailOutreachEnabled = async () => process.env.OUTREACH_EMAIL_ENABLED === "true";

const csvCell = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function prepareOutreachAction(
  jobId: string,
  ids: string[],
  channel: "copy" | "export" | "email",
  lawfulBasis: boolean,
  intro: string,
): Promise<OutreachResult> {
  const { supabase, user, company } = await requireRecruiter();
  if (!company) return { error: "Set up your workspace first." };
  if (channel === "email" && process.env.OUTREACH_EMAIL_ENABLED !== "true")
    return { error: "Email sending isn't switched on yet. Use Copy message or Export instead." };
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, title, location, description_summary, source_type, source_company_name, apply_method, apply_target, visibility, status, company:companies!jobs_company_id_fkey(name, kind)",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "Job not found." };
  const { data, error } = await supabase.rpc("prepare_outreach", {
    p_job_id: jobId,
    p_pool_ids: ids.slice(0, 200),
    p_channel: channel,
    p_lawful_basis: lawfulBasis,
  });
  if (error) return { error: error.message };
  const co = job.company as unknown as { name: string; kind: string } | null;
  const oj: OutreachJob = {
    id: job.id,
    title: job.title,
    company: (co?.kind === "company" ? co.name : null) ?? job.source_company_name,
    location: job.location,
    summary: job.description_summary,
    sourceType: job.source_type,
    applyMethod: job.apply_method,
    applyTarget: job.apply_target,
    isPublic: job.visibility === "public" && job.status === "published",
  };
  const recruiterName = user.name || user.email || "A recruiter";
  const cleanIntro = sanitizeText(intro, 1500);
  const rows: OutreachRow[] = (
    (data ?? []) as {
      pool_candidate_id: string;
      full_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      blocked: string | null;
    }[]
  ).map((r) => {
    const base = {
      id: r.pool_candidate_id,
      name: r.full_name || "Unnamed profile",
      email: r.contact_email,
      phone: r.contact_phone,
      blocked: r.blocked,
    };
    if (r.blocked) return base;
    const hash = contactHash(channel === "email" ? r.contact_email : (r.contact_email ?? r.contact_phone));
    const m = buildMessage({
      job: oj,
      personName: r.full_name,
      recruiterName,
      workspaceName: company.name,
      intro: cleanIntro,
      optOut: hash ? optOutUrl(hash) : "",
    });
    return { ...base, subject: m.subject, message: m.text };
  });

  if (channel === "email") {
    const sender = getEmailSender();
    for (const r of rows) {
      if (r.blocked || !r.email || !r.message) continue;
      const hash = contactHash(r.email)!;
      try {
        const res = await sender.send({
          to: r.email,
          subject: r.subject!,
          text: r.message,
          html: r.message
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
            .replace(/\n/g, "<br>"),
          headers: {
            "List-Unsubscribe": `<${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/api/stop/${optOutToken(hash)}>, <${optOutUrl(hash)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        r.sent = !res.skipped;
        if (res.id)
          await getPool().query(
            `update public.outreach_log set provider_message_id = $1
             where id = (select id from public.outreach_log where pool_candidate_id = $2 and job_id = $3 and channel = 'email'
                         and provider_message_id is null order by created_at desc limit 1)`,
            [res.id, r.id, jobId],
          );
      } catch (e) {
        console.error("[outreach] send failed", e);
        r.sent = false;
      }
    }
  }

  const csv =
    channel === "export"
      ? [
          ["Name", "Email", "Phone", "Job", "Company", "Location", "How to apply", "Message"].map(csvCell).join(","),
          ...rows
            .filter((r) => !r.blocked)
            .map((r) =>
              [
                r.name,
                r.email,
                r.phone,
                oj.title,
                oj.company ?? "Hiring directly",
                oj.location,
                oj.applyTarget ?? "",
                r.message,
              ]
                .map(csvCell)
                .join(","),
            ),
        ].join("\n")
      : undefined;
  return { rows, csv };
}
