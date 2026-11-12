"use server";
import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requestMeta } from "@/lib/server/context";
import { sanitizeLine, sanitizeText } from "@/lib/security/sanitize";

export async function submitTakedown(formData: FormData) {
  const { ip } = await requestMeta();
  const back = (q: string) => redirect(`/takedown?${q}`);
  if (formData.get("website")) back("ok=Thanks"); // honeypot
  if (!(await checkRateLimit(getPool(), "takedown", ip)))
    back("error=" + encodeURIComponent("Too many requests. Try again later."));
  const jobId = String(formData.get("job_id") ?? "");
  const contact = sanitizeLine(String(formData.get("contact") ?? ""), 320);
  const reason = sanitizeText(String(formData.get("reason") ?? ""), 5000);
  const reference = sanitizeLine(String(formData.get("reference") ?? ""), 500);
  if (contact.length < 3 || !reason) back("error=" + encodeURIComponent("Please include a contact and a reason."));
  const validJob = /^[0-9a-f-]{36}$/i.test(jobId)
    ? ((await getPool().query("select id from public.jobs where id = $1", [jobId])).rows[0]?.id ?? null)
    : null;
  await getPool().query(
    "insert into public.takedown_requests(job_id, job_reference, requester_contact, reason) values ($1, $2, $3, $4)",
    [validJob, reference || null, contact, reason],
  );
  back("ok=" + encodeURIComponent("Thanks — we've received your request and will review it promptly."));
}
