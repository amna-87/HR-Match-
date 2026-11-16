import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileInput } from "@/lib/profile-schema";

type CandidateRow = {
  id: string;
  full_name: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  languages: string[] | null;
};

/** Loads a candidate profile into the editable form shape. Reads go through RLS. */
export async function loadProfileInput(supabase: SupabaseClient, candidate: CandidateRow): Promise<ProfileInput> {
  const [{ data: skills }, { data: exps }, { data: edu }, { data: certs }] = await Promise.all([
    supabase
      .from("candidate_skills")
      .select("skill, source")
      .eq("candidate_id", candidate.id)
      .neq("source", "verified"),
    supabase.from("experiences").select("*").eq("candidate_id", candidate.id).order("position"),
    supabase.from("education").select("*").eq("candidate_id", candidate.id),
    supabase.from("certifications").select("*").eq("candidate_id", candidate.id),
  ]);
  return {
    full_name: candidate.full_name ?? "",
    headline: candidate.headline ?? "",
    summary: candidate.summary ?? "",
    location: candidate.location ?? "",
    contact_email: candidate.contact_email ?? "",
    contact_phone: candidate.contact_phone ?? "",
    languages: candidate.languages ?? [],
    skills: (skills ?? []).map((s) => s.skill),
    experiences: (exps ?? []).map((e) => ({
      title: e.title,
      company: e.company ?? "",
      start_date: e.start_date ?? "",
      end_date: e.end_date ?? "",
      is_current: e.is_current,
      description: e.description ?? "",
    })),
    education: (edu ?? []).map((e) => ({
      institution: e.institution,
      degree: e.degree ?? "",
      field: e.field ?? "",
      start_date: e.start_date ?? "",
      end_date: e.end_date ?? "",
    })),
    certifications: (certs ?? []).map((c) => ({ name: c.name, issuer: c.issuer ?? "" })),
  };
}
