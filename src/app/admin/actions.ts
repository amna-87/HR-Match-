"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { audit } from "@/lib/server/context";
import { scheduleJobMatching } from "@/lib/server/background";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { parseJobText } from "@/lib/parsing/job";
import { AiUnavailableError } from "@/lib/parsing/claude";
import { SourcedJobSchema } from "@/lib/job-schema";
import { SOURCED_JOB_CONFIG } from "@/lib/matching/config";
import { sanitizeText } from "@/lib/security/sanitize";
import { listFromForm, numOrNull } from "@/lib/utils";
import type { SaveState } from "@/lib/job-values";
import type { ExtractState } from "@/app/recruiter/actions";

const go = (path: string, key: "ok" | "error", msg: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

export async function setUserStatus(formData: FormData) {
  const { user } = await requireRole("admin");
  const target = String(formData.get("user_id") ?? "");
  const status = formData.get("status") === "suspended" ? "suspended" : "active";
  if (target === user.id) go("/admin/users", "error", "You can't suspend yourself.");
  // users.status is protected from API roles; the trusted backend changes it after the admin check above.
  await getPool().query("update public.users set status = $2 where id = $1 and role <> 'admin'", [target, status]);
  await audit(user.id, "admin", `admin.user_${status === "suspended" ? "suspended" : "reactivated"}`, "users", target);
  go("/admin/users", "ok", `User ${status}.`);
}

export async function moderateJob(formData: FormData) {
  const { supabase, user } = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["removed", "published", "paused"].includes(status)) go("/admin/jobs", "error", "Invalid status.");
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
  if (error) go("/admin/jobs", "error", error.message);
  await audit(user.id, "admin", "admin.job_moderated", "jobs", id, {
    status,
    reason: sanitizeText(String(formData.get("reason") ?? ""), 500),
  });
  if (status === "published") scheduleJobMatching(id);
  go("/admin/jobs", "ok", `Job ${status}.`);
}

export async function extractSourcedJob(_prev: ExtractState, formData: FormData): Promise<ExtractState> {
  const { user } = await requireRole("admin");
  if (!(await checkRateLimit(getPool(), "parse", user.id))) return { error: "Too many extractions. Try again later." };
  const text = sanitizeText(String(formData.get("raw") ?? ""), 30000);
  if (text.length < 40) return { error: "Paste the full job posting text." };
  try {
    return { parsed: await parseJobText(text) };
  } catch (e) {
    return {
      error:
        e instanceof AiUnavailableError
          ? "Automatic extraction is unavailable — please fill in the form."
          : "Couldn't extract fields.",
    };
  }
}

export async function saveSourcedJob(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase, user } = await requireRole("admin");
  const parsed = SourcedJobSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description_summary: String(formData.get("description_summary") ?? ""),
    required_skills: listFromForm(formData.get("required_skills")),
    nice_skills: listFromForm(formData.get("nice_skills")),
    required_certifications: listFromForm(formData.get("required_certifications")),
    domains: listFromForm(formData.get("domains")),
    min_exp: numOrNull(formData.get("min_exp")),
    max_exp: numOrNull(formData.get("max_exp")),
    location: String(formData.get("location") ?? ""),
    work_mode: String(formData.get("work_mode") ?? "onsite"),
    employment_type: String(formData.get("employment_type") ?? "full_time"),
    salary_min: numOrNull(formData.get("salary_min")),
    salary_max: numOrNull(formData.get("salary_max")),
    salary_currency: String(formData.get("salary_currency") ?? ""),
    expires_at: String(formData.get("expires_at") ?? ""),
    source_name: String(formData.get("source_name") ?? ""),
    source_url: String(formData.get("source_url") ?? ""),
    source_company_name: String(formData.get("source_company_name") ?? ""),
    apply_method: String(formData.get("apply_method") ?? "link"),
    apply_target: String(formData.get("apply_target") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const j = parsed.data;
  if (j.description_summary.length > 1500) {
    return {
      error: "Keep the summary short and in our own words (max 1500 characters) — don't copy the full listing.",
    };
  }

  // Duplicate detection: title + company + location + text similarity.
  if (formData.get("allow_duplicate") !== "on") {
    const d = await getPool().query("select * from public.find_duplicate_jobs($1, $2, $3, $4)", [
      j.title,
      j.source_company_name,
      j.location,
      j.description_summary,
    ]);
    if (d.rows.length) return { error: "This looks like a duplicate.", duplicates: d.rows };
  }

  const publish = formData.get("intent") === "publish";
  const expires = j.expires_at ?? new Date(Date.now() + SOURCED_JOB_CONFIG.defaultExpiryDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      source_type: "sourced",
      company_id: null,
      source_name: j.source_name,
      source_url: j.source_url,
      source_company_name: j.source_company_name,
      title: j.title,
      description_summary: j.description_summary,
      required_skills: j.required_skills,
      nice_skills: j.nice_skills,
      required_certifications: j.required_certifications,
      domains: j.domains,
      min_exp: j.min_exp,
      max_exp: j.max_exp,
      location: j.location,
      work_mode: j.work_mode,
      employment_type: j.employment_type,
      salary_min: j.salary_min,
      salary_max: j.salary_max,
      salary_currency: j.salary_currency,
      apply_method: j.apply_method,
      apply_target: j.apply_target,
      expires_at: expires,
      status: publish ? "published" : "draft",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not save." };
  await audit(user.id, "admin", "admin.sourced_job_created", "jobs", data.id, {
    source_name: j.source_name,
    source_url: j.source_url,
  });
  if (publish) scheduleJobMatching(data.id);
  revalidatePath("/admin/jobs");
  return go("/admin/jobs", "ok", publish ? "Sourced job published." : "Sourced job saved as draft.");
}

export async function resolveTakedown(formData: FormData) {
  const { supabase, user } = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision") === "reject" ? "rejected" : "resolved";
  const note = sanitizeText(String(formData.get("note") ?? ""), 1000) || null;
  const { data: req } = await supabase.from("takedown_requests").select("job_id").eq("id", id).single();
  if (decision === "resolved" && req?.job_id) {
    const { error } = await supabase.from("jobs").update({ status: "removed" }).eq("id", req.job_id);
    if (error) go("/admin/takedowns", "error", error.message);
  }
  const { error } = await supabase
    .from("takedown_requests")
    .update({ status: decision, resolved_at: new Date().toISOString(), resolved_by: user.id, resolution_note: note })
    .eq("id", id);
  if (error) go("/admin/takedowns", "error", error.message);
  go("/admin/takedowns", "ok", decision === "resolved" ? "Listing removed and request resolved." : "Request rejected.");
}

export async function readFeedback(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("feedback_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  redirect(`/admin/feedback?id=${encodeURIComponent(id)}&reason=${encodeURIComponent(reason)}`);
}
