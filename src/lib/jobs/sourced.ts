import "server-only";
// Shared create/update for jobs from other sources (addendum 4, D-028): used by
// admins (public board) and recruiters (their own workspace). Writes go through
// the caller's Supabase client, so RLS and the jobs guard trigger apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPool } from "@/lib/db";
import { SourcedJobSchema, type JobForm } from "@/lib/job-schema";
import { SOURCED_JOB_CONFIG } from "@/lib/matching/config";
import { listFromForm, numOrNull } from "@/lib/utils";
import type { SaveState } from "@/lib/job-values";

export type SourcedParse = { ok: true; job: JobForm } | { ok: false; state: SaveState };

export function parseSourcedForm(formData: FormData): SourcedParse {
  const str = (k: string) => String(formData.get(k) ?? "");
  const parsed = SourcedJobSchema.safeParse({
    title: str("title"),
    description_summary: str("description_summary"),
    required_skills: listFromForm(formData.get("required_skills")),
    nice_skills: listFromForm(formData.get("nice_skills")),
    required_certifications: listFromForm(formData.get("required_certifications")),
    domains: listFromForm(formData.get("domains")),
    min_exp: numOrNull(formData.get("min_exp")),
    max_exp: numOrNull(formData.get("max_exp")),
    location: str("location"),
    work_mode: str("work_mode") || "onsite",
    employment_type: str("employment_type") || "full_time",
    salary_min: numOrNull(formData.get("salary_min")),
    salary_max: numOrNull(formData.get("salary_max")),
    salary_currency: str("salary_currency"),
    expires_at: str("expires_at"),
    source_name: str("source_name"),
    source_url: str("source_url"),
    source_company_name: str("source_company_name"),
    apply_method: str("apply_method") || "link",
    apply_target: str("apply_target"),
    apply_instructions: str("apply_instructions"),
  });
  if (!parsed.success)
    return { ok: false, state: { error: parsed.error.issues[0]?.message ?? "Please check the form." } };
  const j = parsed.data;
  if (j.description_summary.length > 1500)
    return {
      ok: false,
      state: { error: "Keep the summary short and in our own words (max 1500 characters), not the full listing." },
    };
  return { ok: true, job: j };
}

/** Similar jobs the caller may see: the public board plus their own workspace (admins: all jobs). */
export async function findSimilarJobs(j: JobForm, workspaceId: string | null, excludeId?: string) {
  const r = workspaceId
    ? await getPool().query("select * from public.find_similar_jobs($1, $2, $3, $4, $5, $6)", [
        j.title,
        j.source_company_name,
        j.location,
        j.description_summary,
        workspaceId,
        excludeId ?? null,
      ])
    : await getPool().query("select * from public.find_duplicate_jobs($1, $2, $3, $4, $5)", [
        j.title,
        j.source_company_name,
        j.location,
        j.description_summary,
        excludeId ?? null,
      ]);
  return r.rows as SaveState["duplicates"];
}

export function sourcedRow(j: JobForm) {
  return {
    source_type: "sourced" as const,
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
    apply_instructions: j.apply_instructions,
    expires_at: j.expires_at ?? new Date(Date.now() + SOURCED_JOB_CONFIG.defaultExpiryDays * 86400_000).toISOString(),
  };
}

export async function insertSourcedJob(
  supabase: SupabaseClient,
  j: JobForm,
  opts: {
    ownerWorkspaceId: string | null;
    origin: "manual" | "pasted" | "csv_import" | "email_forwarded";
    publish: boolean;
    /** Admins only (the database ignores it for everyone else): put it straight on the public board. */
    publicBoard?: boolean;
  },
): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      ...sourcedRow(j),
      owner_workspace_id: opts.ownerWorkspaceId,
      visibility: opts.ownerWorkspaceId && !opts.publicBoard ? "workspace" : "public",
      origin: opts.origin,
      status: opts.publish ? "published" : "draft",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not save." };
  return { id: data.id as string };
}
