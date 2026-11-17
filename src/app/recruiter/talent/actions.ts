"use server";
// Talent pool (A2, D-027). Files go straight from the browser to private
// storage; these actions start an upload (lawful basis + caps checked in the
// database), queue the files and edit pool profiles. All under RLS.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRecruiter } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { refreshPoolEmbeddings } from "@/lib/pool/process";
import { getEmbeddingProvider } from "@/lib/matching/embeddings";
import { computeExperienceYears } from "@/lib/parsing/resume";
import { ProfileSchema } from "@/lib/profile-schema";
import { sanitizeLine, sanitizeText } from "@/lib/security/sanitize";

const go = (path: string, key: "ok" | "error", msg: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

export type StartResult = { ok: true; importId: string; workspaceId: string } | { ok: false; error: string };

/** Step 1 of a bulk upload: checks lawful basis, batch cap and pool room; returns where to upload. */
export async function startPoolImport(fileCount: number, lawfulBasis: boolean): Promise<StartResult> {
  const { supabase, user, company } = await requireRecruiter();
  if (!company) return { ok: false, error: "Set up your workspace first." };
  if (!(await checkRateLimit(getPool(), "poolImport", user.id)))
    return { ok: false, error: "Too many uploads in the last hour. Try again later." };
  const { data, error } = await supabase.rpc("start_pool_import", {
    p_workspace_id: company.id,
    p_file_count: fileCount,
    p_lawful_basis: lawfulBasis,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start the upload." };
  return { ok: true, importId: data as string, workspaceId: company.id };
}

/** Step 2: register the files that reached storage; they join the background queue. */
export async function queuePoolFiles(
  importId: string,
  files: { storage_path: string; original_filename: string; size_bytes: number }[],
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireRecruiter();
  const clean = files.map((f) => ({
    storage_path: String(f.storage_path),
    original_filename: sanitizeLine(String(f.original_filename), 200) || "resume",
    size_bytes: Math.trunc(Number(f.size_bytes) || 0),
  }));
  const { error } = await supabase.rpc("queue_pool_files", { p_import_id: importId, p_files: clean });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/recruiter/talent");
  return { ok: true };
}

function embedLater(ids: string[]) {
  return refreshPoolEmbeddings({ db: getPool(), embedder: getEmbeddingProvider() }, ids).catch((e) =>
    console.error("[pool] embedding failed", e),
  );
}

/** Edit the parsed profile of a pool candidate. */
export async function savePoolProfile(id: string, formData: FormData) {
  const { supabase } = await requireRecruiter();
  const back = `/recruiter/talent/${id}`;
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    go(back, "error", "Invalid form data.");
  }
  const parsed = ProfileSchema.safeParse(json);
  if (!parsed.success) go(back, "error", parsed.error.issues[0]?.message ?? "Please check the form.");
  const p = parsed.data!;
  const latest = p.experiences.find((e) => e.is_current) ?? p.experiences[0];
  const { data: current } = await supabase
    .from("pool_candidates")
    .select("experience_years")
    .eq("id", id)
    .maybeSingle();
  if (!current) go("/recruiter/talent", "error", "Profile not found.");
  const { error } = await supabase
    .from("pool_candidates")
    .update({
      full_name: p.full_name || null,
      headline: p.headline || null,
      summary: p.summary || null,
      location: p.location || null,
      contact_email: p.contact_email ? p.contact_email.toLowerCase() : null,
      contact_phone: p.contact_phone || null,
      latest_title: latest?.title || null,
      latest_employer: latest?.company || null,
      experience_years: computeExperienceYears(p.experiences) || Number(current!.experience_years) || 0,
      skills: [...new Set(p.skills.map((s) => s.trim().toLowerCase()).filter(Boolean))],
      languages: p.languages,
      experiences: p.experiences,
      education: p.education,
      certifications: p.certifications,
      parsed_by: "manual",
    })
    .eq("id", id);
  if (error) go(back, "error", error.message);
  await embedLater([id]);
  revalidatePath("/recruiter/talent");
  go(back, "ok", "Profile saved.");
}

const STATUSES = ["new", "contacted", "interested", "not_interested", "hired"] as const;

/** Workspace-only fields: tags, private notes, status, do-not-contact. */
export async function updatePoolMeta(id: string, formData: FormData) {
  const { supabase } = await requireRecruiter();
  const back = `/recruiter/talent/${id}`;
  const status = String(formData.get("status") ?? "new");
  const tags = [
    ...new Set(
      String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => sanitizeLine(t, 40).toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 30);
  const { error } = await supabase
    .from("pool_candidates")
    .update({
      tags,
      notes: sanitizeText(String(formData.get("notes") ?? ""), 10000),
      status: (STATUSES as readonly string[]).includes(status) ? status : "new",
      do_not_contact: formData.get("do_not_contact") === "on",
    })
    .eq("id", id);
  if (error) go(back, "error", error.message);
  revalidatePath("/recruiter/talent");
  go(back, "ok", "Saved.");
}

/** Quick status change from the pool list. */
export async function setPoolStatus(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!(STATUSES as readonly string[]).includes(status)) return;
  await supabase.from("pool_candidates").update({ status }).eq("id", id);
  revalidatePath("/recruiter/talent");
}

/** Delete removes the file, parsed data and embedding. */
export async function deletePoolCandidate(formData: FormData) {
  const { supabase } = await requireRecruiter();
  const id = String(formData.get("id") ?? "");
  const { data: paths, error } = await supabase.rpc("delete_pool_candidate", { p_id: id });
  if (error) go("/recruiter/talent", "error", error.message);
  if ((paths as string[] | null)?.length)
    await createServiceClient()
      .storage.from("resumes")
      .remove(paths as string[]);
  revalidatePath("/recruiter/talent");
  go("/recruiter/talent", "ok", "Profile, resume file and parsed data deleted.");
}
