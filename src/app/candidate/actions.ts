"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCandidate } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requestMeta } from "@/lib/server/context";
import { scheduleCandidateMatching } from "@/lib/server/background";
import { extractResumeText, validateResumeFile } from "@/lib/parsing/extract-text";
import { computeExperienceYears, parseResumeText } from "@/lib/parsing/resume";
import { AiUnavailableError } from "@/lib/parsing/claude";
import { ProfileSchema } from "@/lib/profile-schema";
import { listFromForm, numOrNull } from "@/lib/utils";
import { sanitizeLine, sanitizeList } from "@/lib/security/sanitize";

const go = (path: string, key: "ok" | "error", msg: string): never => redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
const isRedirect = (e: unknown) => !!e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");

// ---------------------------------------------------------------------------
// Resume upload + AI parsing (M3). Parse failure falls back to manual entry.
// ---------------------------------------------------------------------------
export async function uploadResume(formData: FormData) {
  const { supabase, user, candidate } = await requireCandidate();
  if (!(await checkRateLimit(getPool(), "upload", user.id))) go("/candidate/profile", "error", "Too many uploads. Try again later.");
  const file = formData.get("resume");
  if (!(file instanceof File)) go("/candidate/profile", "error", "Choose a file to upload.");
  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const v = validateResumeFile((file as File).name, bytes);
  if (!v.ok) go("/candidate/profile", "error", v.error);
  if (!v.ok) return;

  const path = `${user.id}/${randomUUID()}.${v.ext}`;
  const up = await supabase.storage.from("resumes").upload(path, bytes, { contentType: v.mime, upsert: false });
  if (up.error) go("/candidate/profile", "error", "Upload failed. Please try again.");

  await supabase.from("resumes").update({ is_current: false }).eq("candidate_id", candidate.id);
  const { data: resume, error } = await supabase
    .from("resumes")
    .insert({
      candidate_id: candidate.id,
      storage_path: path,
      original_filename: sanitizeLine((file as File).name, 200),
      mime_type: v.mime,
      size_bytes: bytes.byteLength,
      parse_status: "processing",
    })
    .select("id")
    .single();
  if (error || !resume) go("/candidate/profile", "error", "Could not save the resume.");

  try {
    const text = await extractResumeText(v.kind, bytes);
    if (text.trim().length < 50) throw new Error("We couldn't read text from this file (is it a scanned image?).");
    const parsed = await parseResumeText(text);
    await supabase.from("resumes").update({ parsed_json: parsed, parse_status: "succeeded", parse_error: null }).eq("id", resume!.id);
    redirect(`/candidate/profile?review=${resume!.id}`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    const msg = e instanceof AiUnavailableError ? "Automatic parsing is unavailable right now." : e instanceof Error ? e.message : "Parsing failed.";
    await supabase.from("resumes").update({ parse_status: "failed", parse_error: msg.slice(0, 500) }).eq("id", resume!.id);
    go("/candidate/profile", "error", `${msg} Your file is saved — please fill in your profile below.`);
  }
}

// ---------------------------------------------------------------------------
// Profile review/edit
// ---------------------------------------------------------------------------
export async function saveProfile(formData: FormData) {
  const { supabase, candidate } = await requireCandidate();
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    go("/candidate/profile", "error", "Invalid form data.");
  }
  const parsed = ProfileSchema.safeParse(json);
  if (!parsed.success) go("/candidate/profile", "error", parsed.error.issues[0]?.message ?? "Please check the form.");
  const p = parsed.data!;
  const experience_years = computeExperienceYears(p.experiences);
  const { error } = await supabase.rpc("save_candidate_profile", { p: { ...p, experience_years } });
  if (error) go("/candidate/profile", "error", "Could not save your profile.");
  scheduleCandidateMatching(candidate.id);
  revalidatePath("/candidate");
  go("/candidate/profile", "ok", "Profile saved. We'll look for matching jobs.");
}

// ---------------------------------------------------------------------------
// Preferences, visibility, notifications
// ---------------------------------------------------------------------------
export async function savePreferences(formData: FormData) {
  const { supabase, candidate } = await requireCandidate();
  const modes = ["remote", "hybrid", "onsite"].filter((m) => formData.get(`mode_${m}`) === "on");
  const currency = String(formData.get("salary_currency") ?? "").toUpperCase().trim();
  const salaryMin = numOrNull(formData.get("salary_min"));
  const salaryMax = numOrNull(formData.get("salary_max"));
  if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) go("/candidate/settings", "error", "Minimum salary is above maximum.");
  const { error } = await supabase
    .from("candidates")
    .update({
      desired_roles: sanitizeList(listFromForm(formData.get("desired_roles")), 15),
      industries: sanitizeList(listFromForm(formData.get("industries")), 15),
      preferred_locations: sanitizeList(listFromForm(formData.get("preferred_locations")), 15),
      work_mode_pref: modes,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
      availability: sanitizeLine(String(formData.get("availability") ?? ""), 200) || null,
      open_to_work: formData.get("open_to_work") === "on",
      visibility_paused: formData.get("visibility_paused") === "on",
      match_emails_enabled: formData.get("match_emails_enabled") === "on",
      match_email_frequency: ["instant", "daily", "weekly"].includes(String(formData.get("match_email_frequency")))
        ? String(formData.get("match_email_frequency"))
        : "instant",
    })
    .eq("id", candidate.id);
  if (error) go("/candidate/settings", "error", "Could not save preferences.");
  scheduleCandidateMatching(candidate.id);
  go("/candidate/settings", "ok", "Preferences saved.");
}

export async function blockCompany(formData: FormData) {
  const { supabase, candidate } = await requireCandidate();
  const companyId = String(formData.get("company_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) go("/candidate/settings", "error", "Choose a company.");
  await supabase.from("blocked_companies").upsert({ candidate_id: candidate.id, company_id: companyId }, { onConflict: "candidate_id,company_id" });
  // pending suggestions for that company are dropped on the next matching run
  await supabase.from("candidates").update({ needs_matching: true }).eq("id", candidate.id);
  scheduleCandidateMatching(candidate.id);
  go("/candidate/settings", "ok", "Company blocked. They will never see your profile.");
}

export async function unblockCompany(formData: FormData) {
  const { supabase, candidate } = await requireCandidate();
  await supabase.from("blocked_companies").delete().eq("candidate_id", candidate.id).eq("id", String(formData.get("id") ?? ""));
  go("/candidate/settings", "ok", "Company unblocked.");
}

// ---------------------------------------------------------------------------
// Consent: approve / decline matches, redistribution opt-in
// ---------------------------------------------------------------------------
export async function respondToMatch(formData: FormData) {
  const { supabase } = await requireCandidate();
  const matchId = String(formData.get("match_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["approve", "decline", "view"].includes(decision)) go("/candidate", "error", "Invalid choice.");
  const { ipHash, uaHash } = await requestMeta();
  const { data, error } = await supabase.rpc("respond_to_match", {
    p_match_id: matchId,
    p_decision: decision,
    p_ip_hash: ipHash,
    p_ua_hash: uaHash,
  });
  if (error) go("/candidate", "error", error.message);
  const status = (data as { status: string })?.status;
  revalidatePath("/candidate");
  go("/candidate", "ok", status === "applied" ? "Application sent." : status === "declined" ? "Match declined." : status === "expired" ? "That match had expired." : "Updated.");
}

export async function setRedistribution(formData: FormData) {
  const { supabase, candidate } = await requireCandidate();
  const { ipHash, uaHash } = await requestMeta();
  const { error } = await supabase.rpc("set_redistribution_consent", {
    p_id: String(formData.get("id") ?? ""),
    p_status: String(formData.get("status") ?? ""),
    p_ip_hash: ipHash,
    p_ua_hash: uaHash,
  });
  if (error) go("/candidate", "error", error.message);
  scheduleCandidateMatching(candidate.id);
  go("/candidate", "ok", "Visibility updated.");
}

export async function markNotificationsRead() {
  const { supabase, user } = await requireCandidate();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/candidate");
}

// ---------------------------------------------------------------------------
// Privacy: account deletion (export is /api/candidate/export)
// ---------------------------------------------------------------------------
export async function deleteAccount(formData: FormData) {
  const { supabase, user } = await requireCandidate();
  if (String(formData.get("confirm") ?? "") !== "DELETE") go("/candidate/privacy", "error", 'Type "DELETE" to confirm.');
  const service = createServiceClient();
  const { rows } = await getPool().query<{ paths: string[] }>("select public.erase_user($1) as paths", [user.id]);
  const paths = rows[0]?.paths ?? [];
  if (paths.length) await service.storage.from("resumes").remove(paths);
  await service.auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  redirect("/?ok=" + encodeURIComponent("Your account and data have been deleted."));
}
