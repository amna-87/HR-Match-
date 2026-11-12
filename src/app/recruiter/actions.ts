"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRecruiter } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { scheduleEmailDelivery, scheduleJobMatching } from "@/lib/server/background";
import { parseJobText } from "@/lib/parsing/job";
import { AiUnavailableError } from "@/lib/parsing/claude";
import type { ParsedJob } from "@/lib/parsing/schemas";
import { JobFormSchema } from "@/lib/job-schema";
import type { SaveState } from "@/lib/job-values";
import { safeHttpUrl, sanitizeLine, sanitizeList, sanitizeText } from "@/lib/security/sanitize";
import { listFromForm, numOrNull } from "@/lib/utils";

const go = (path: string, key: "ok" | "error", msg: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

export async function createCompany(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const name = sanitizeLine(String(formData.get("name") ?? ""), 200);
  if (!name) go("/recruiter", "error", "Company name is required.");
  const { error } = await supabase.rpc("create_company", {
    p_name: name,
    p_website: safeHttpUrl(String(formData.get("website") ?? "")),
    p_description: sanitizeText(String(formData.get("description") ?? ""), 3000) || null,
    p_size: sanitizeLine(String(formData.get("size") ?? ""), 50) || null,
    p_location: sanitizeLine(String(formData.get("location") ?? ""), 200) || null,
  });
  if (error) go("/recruiter", "error", error.message);
  go("/recruiter", "ok", "Company created. You can now post jobs.");
}

export async function updateCompany(formData: FormData) {
  const { supabase, company, isCompanyAdmin } = await requireRecruiter();
  if (!company || !isCompanyAdmin) go("/recruiter/company", "error", "Only company admins can edit the company.");
  const { error } = await supabase
    .from("companies")
    .update({
      name: sanitizeLine(String(formData.get("name") ?? ""), 200),
      website: safeHttpUrl(String(formData.get("website") ?? "")),
      description: sanitizeText(String(formData.get("description") ?? ""), 3000) || null,
      size: sanitizeLine(String(formData.get("size") ?? ""), 50) || null,
      location: sanitizeLine(String(formData.get("location") ?? ""), 200) || null,
      show_name_on_vetted_badge: formData.get("show_name_on_vetted_badge") === "on",
    })
    .eq("id", company!.id);
  if (error) go("/recruiter/company", "error", error.message);
  go("/recruiter/company", "ok", "Company updated.");
}

export async function addMember(formData: FormData) {
  const { supabase, company } = await requireRecruiter();
  const { error } = await supabase.rpc("add_company_member", {
    p_company_id: company?.id,
    p_email: String(formData.get("email") ?? ""),
    p_role: formData.get("role") === "admin" ? "admin" : "recruiter",
  });
  if (error) go("/recruiter/company", "error", error.message);
  go("/recruiter/company", "ok", "Recruiter added.");
}

export async function removeMember(formData: FormData) {
  const { supabase, company } = await requireRecruiter();
  await supabase
    .from("company_members")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("company_id", company?.id ?? "");
  go("/recruiter/company", "ok", "Recruiter removed.");
}

// ---------------------------------------------------------------------------
// Paste-to-structure: returns extracted fields to pre-fill the form. Nothing is published here.
// ---------------------------------------------------------------------------
export type ExtractState = { parsed?: ParsedJob; error?: string };

export async function extractJob(_prev: ExtractState, formData: FormData): Promise<ExtractState> {
  const { user } = await requireRecruiter();
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
          : "Couldn't extract fields. Please fill in the form.",
    };
  }
}

function jobFromForm(formData: FormData) {
  return JobFormSchema.safeParse({
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
    apply_method: String(formData.get("apply_method") || "platform"),
    apply_target: String(formData.get("apply_target") ?? ""),
  });
}

export async function saveJob(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const { supabase, company } = await requireRecruiter();
  if (!company) return { error: "Create your company first." };
  const id = String(formData.get("id") ?? "");
  const publish = formData.get("intent") === "publish";
  const parsed = jobFromForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const j = parsed.data;
  const row = {
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
    expires_at: j.expires_at,
    apply_method: "platform" as const,
    ...(publish ? { status: "published" as const } : {}),
  };
  const res = id
    ? await supabase.from("jobs").update(row).eq("id", id).select("id, status").single()
    : await supabase
        .from("jobs")
        .insert({ ...row, company_id: company!.id, source_type: "verified", status: publish ? "published" : "draft" })
        .select("id, status")
        .single();
  if (res.error || !res.data) return { error: res.error?.message ?? "Could not save the job." };
  if (res.data!.status === "published") scheduleJobMatching(res.data!.id);
  revalidatePath("/recruiter");
  return go(`/recruiter/jobs/${res.data!.id}`, "ok", publish ? "Job published. Matching has started." : "Job saved.");
}

export async function setJobStatus(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["draft", "published", "paused", "closed"].includes(status))
    go(`/recruiter/jobs/${id}`, "error", "Invalid status.");
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
  if (error) go(`/recruiter/jobs/${id}`, "error", error.message);
  if (status === "published") scheduleJobMatching(id);
  go(`/recruiter/jobs/${id}`, "ok", `Job ${status}.`);
}

export async function changeStage(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const id = String(formData.get("application_id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const back = String(formData.get("back") ?? `/recruiter/applications/${id}`);
  if (!["new", "reviewed", "interview", "offer", "hired", "rejected", "redirected"].includes(stage))
    go(back, "error", "Invalid stage.");
  const { error } = await supabase.from("applications").update({ stage }).eq("id", id);
  if (error) go(back, "error", error.message);
  go(back.startsWith("/recruiter/") ? back : `/recruiter/applications/${id}`, "ok", "Stage updated.");
}

export async function submitFeedback(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const applicationId = String(formData.get("application_id") ?? "");
  const back = `/recruiter/applications/${applicationId}`;
  const outcome = String(formData.get("outcome") ?? "");
  if (!["not_a_fit", "good_fit_different_role"].includes(outcome)) go(back, "error", "Choose an outcome.");
  const domains = sanitizeList(listFromForm(formData.get("suggested_domains")), 5, 60).map((d) => d.toLowerCase());
  if (outcome === "good_fit_different_role" && !domains.length)
    go(back, "error", "Add at least one suggested role or domain.");
  const rating = numOrNull(formData.get("rating"));
  const { error } = await supabase.from("interview_feedback").insert({
    application_id: applicationId,
    outcome,
    strengths: sanitizeList(listFromForm(formData.get("strengths")), 10, 80),
    growth_areas: sanitizeList(listFromForm(formData.get("growth_areas")), 10, 120),
    suggested_domains: domains,
    rating: rating && rating >= 1 && rating <= 5 ? Math.round(rating) : null,
    private_note: sanitizeText(String(formData.get("private_note") ?? ""), 5000) || null,
  });
  if (error) go(back, "error", error.message);
  if (outcome === "good_fit_different_role") scheduleEmailDelivery();
  go(
    back,
    "ok",
    outcome === "good_fit_different_role"
      ? "Feedback saved. The candidate will be asked whether to share their strengths."
      : "Feedback saved.",
  );
}
