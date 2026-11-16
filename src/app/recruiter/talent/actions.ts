"use server";
// Talent pool (D-022): recruiters upload resumes of people who are not on Vouch.
// Writes go through security-definer RPCs that re-check company membership.
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRecruiter } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { engineDeps } from "@/lib/server/context";
import { refreshCandidateEmbeddings } from "@/lib/matching/engine";
import { extractResumeText, validateResumeFile } from "@/lib/parsing/extract-text";
import { computeExperienceYears, parseResumeText } from "@/lib/parsing/resume";
import { basicParseResume } from "@/lib/parsing/basic-resume";
import { AiUnavailableError } from "@/lib/parsing/claude";
import type { ParsedResume } from "@/lib/parsing/schemas";
import { ProfileSchema } from "@/lib/profile-schema";
import { sanitizeLine } from "@/lib/security/sanitize";

const MAX_FILES = 10;
const go = (path: string, key: "ok" | "error", msg: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

async function parse(text: string): Promise<{ parsed: ParsedResume; years: number; ai: boolean }> {
  try {
    const parsed = await parseResumeText(text);
    return { parsed, years: computeExperienceYears(parsed.experiences), ai: true };
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.warn("[talent] AI parse failed, using basic reader", e);
    const b = basicParseResume(text);
    const { experience_years_hint, ...parsed } = b;
    return { parsed, years: experience_years_hint ?? 0, ai: false };
  }
}

export async function uploadTalentResumes(formData: FormData) {
  const { supabase, user, company } = await requireRecruiter();
  if (!company) go("/recruiter", "error", "Create your company first.");
  if (formData.get("lawful_basis") !== "on")
    go("/recruiter/talent", "error", "Please confirm you are allowed to share these resumes with Vouch.");
  const files = formData.getAll("resumes").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) go("/recruiter/talent", "error", "Choose at least one PDF or DOCX file.");
  if (files.length > MAX_FILES) go("/recruiter/talent", "error", `Upload at most ${MAX_FILES} files at a time.`);

  const service = createServiceClient();
  const done: string[] = [];
  const failed: string[] = [];
  let usedBasicReader = false;
  let withoutEmail = 0;

  for (const file of files) {
    const name = sanitizeLine(file.name, 200) || "resume";
    if (!(await checkRateLimit(getPool(), "talentUpload", user.id))) {
      failed.push(`${name}: upload limit reached, try again later`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const v = validateResumeFile(file.name, bytes);
    if (!v.ok) {
      failed.push(`${name}: ${v.error}`);
      continue;
    }
    let text: string;
    try {
      text = await extractResumeText(v.kind, bytes);
    } catch {
      failed.push(`${name}: could not read the file`);
      continue;
    }
    if (text.trim().length < 50) {
      failed.push(`${name}: no readable text (scanned image?)`);
      continue;
    }
    const { parsed, years, ai } = await parse(text);
    if (!ai) usedBasicReader = true;
    const profile = ProfileSchema.safeParse({
      full_name: parsed.full_name,
      headline: parsed.headline,
      summary: parsed.summary,
      location: parsed.location,
      contact_email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parsed.email) ? parsed.email.toLowerCase() : "",
      contact_phone: parsed.phone,
      skills: parsed.skills,
      languages: parsed.languages,
      experiences: parsed.experiences,
      education: parsed.education,
      certifications: parsed.certifications,
    });
    if (!profile.success) {
      failed.push(`${name}: could not build a profile`);
      continue;
    }
    if (!profile.data.contact_email) withoutEmail++;

    const path = `company/${company!.id}/${randomUUID()}.${v.ext}`;
    const up = await service.storage.from("resumes").upload(path, bytes, { contentType: v.mime, upsert: false });
    if (up.error) {
      failed.push(`${name}: storage upload failed`);
      continue;
    }
    // Re-uploading the same person (same email) updates their profile instead of duplicating it.
    let existing: string | null = null;
    if (profile.data.contact_email) {
      const { data } = await supabase
        .from("candidates")
        .select("id")
        .eq("uploaded_by_company_id", company!.id)
        .eq("claim_status", "unclaimed")
        .eq("contact_email", profile.data.contact_email)
        .maybeSingle();
      existing = data?.id ?? null;
    }
    const { data: id, error } = await supabase.rpc("save_uploaded_profile", {
      p_company_id: company!.id,
      p_candidate_id: existing,
      p: { ...profile.data, experience_years: years },
      p_resume: {
        storage_path: path,
        original_filename: name,
        mime_type: v.mime,
        size_bytes: bytes.byteLength,
        parsed_json: parsed,
        parse_status: "succeeded",
      },
    });
    if (error || !id) {
      await service.storage.from("resumes").remove([path]);
      failed.push(`${name}: ${error?.message ?? "could not save"}`);
      continue;
    }
    try {
      await refreshCandidateEmbeddings(engineDeps(), [id as string]);
    } catch (e) {
      console.error("[talent] embedding failed", e);
    }
    done.push(profile.data.full_name || name);
  }

  revalidatePath("/recruiter/talent");
  const parts: string[] = [];
  if (done.length) parts.push(`Added ${done.length} profile${done.length === 1 ? "" : "s"}.`);
  if (usedBasicReader) parts.push("AI reading is off, so we used a basic reader. Check and edit the profiles.");
  if (withoutEmail) parts.push(`${withoutEmail} had no email address, so that person can't claim the profile later.`);
  if (failed.length) parts.push(`Not added: ${failed.join("; ")}.`);
  go("/recruiter/talent", done.length ? "ok" : "error", parts.join(" ") || "Nothing was uploaded.");
}

export async function saveTalentProfile(candidateId: string, formData: FormData) {
  const { supabase, company } = await requireRecruiter();
  if (!company) go("/recruiter", "error", "Create your company first.");
  const back = `/recruiter/talent/${candidateId}`;
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    go(back, "error", "Invalid form data.");
  }
  const parsed = ProfileSchema.safeParse(json);
  if (!parsed.success) go(back, "error", parsed.error.issues[0]?.message ?? "Please check the form.");
  const p = parsed.data!;
  const { data: current } = await supabase
    .from("candidates")
    .select("experience_years")
    .eq("id", candidateId)
    .maybeSingle();
  if (!current) go("/recruiter/talent", "error", "Profile not found.");
  const fromDates = computeExperienceYears(p.experiences);
  const { error } = await supabase.rpc("save_uploaded_profile", {
    p_company_id: company!.id,
    p_candidate_id: candidateId,
    p: {
      ...p,
      contact_email: p.contact_email.toLowerCase(),
      experience_years: fromDates || Number(current!.experience_years) || 0,
    },
  });
  if (error) go(back, "error", error.message);
  try {
    await refreshCandidateEmbeddings(engineDeps(), [candidateId]);
  } catch (e) {
    console.error("[talent] embedding failed", e);
  }
  revalidatePath("/recruiter/talent");
  go(back, "ok", "Profile saved.");
}

export async function deleteTalentProfile(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const id = String(formData.get("id") ?? "");
  const { data: paths, error } = await supabase.rpc("delete_uploaded_profile", { p_candidate_id: id });
  if (error) go("/recruiter/talent", "error", error.message);
  if ((paths as string[] | null)?.length)
    await createServiceClient()
      .storage.from("resumes")
      .remove(paths as string[]);
  revalidatePath("/recruiter/talent");
  go("/recruiter/talent", "ok", "Profile and resume deleted.");
}
