import "server-only";
// C1: rank a workspace's talent pool (and pools shared with the Vouch network)
// against one of its jobs, and the reverse: best open jobs for one pool profile.
// Reuses the v1.0 pipeline: vector similarity, skill overlap, experience fit,
// with a one-line reason. Hard filters: do-not-contact people are never offered
// from the network; required certifications are not modelled for pool profiles.
import type { SupabaseClient } from "@supabase/supabase-js";
import { engineDeps } from "@/lib/server/context";
import { prepareJobForRanking } from "@/lib/matching/engine";
import { scoreMatch } from "@/lib/matching/scoring";

export type PoolMatch = {
  candidateId: string;
  isOwn: boolean;
  score: number;
  reason: string;
  fullName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  headline: string | null;
  location: string | null;
  experienceYears: number;
  skills: string[];
  status: string | null;
  doNotContact: boolean;
  intro?: { id: string; status: string } | null;
};

type RankRow = {
  candidate_id: string;
  is_own: boolean;
  similarity: number;
  full_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  headline: string | null;
  location: string | null;
  experience_years: number;
  skills: string[];
  status: string | null;
  do_not_contact: boolean;
};

export async function rankPoolForJob(
  supabase: SupabaseClient,
  jobId: string,
  limit = 50,
): Promise<{ own: PoolMatch[]; network: PoolMatch[] }> {
  const deps = engineDeps();
  const job = await prepareJobForRanking(deps, jobId);
  if (!job) return { own: [], network: [] };
  const [{ data }, { data: intros }] = await Promise.all([
    supabase.rpc("talent_pool_for_job", { p_job_id: jobId, p_limit: limit * 2 }),
    supabase.rpc("intro_status_for_job", { p_job_id: jobId }),
  ]);
  const introBy = new Map(
    ((intros ?? []) as { pool_candidate_id: string; intro_id: string; status: string }[]).map((i) => [
      i.pool_candidate_id,
      { id: i.intro_id, status: i.status },
    ]),
  );
  const scored = ((data ?? []) as RankRow[]).map((r): PoolMatch => {
    const s = scoreMatch(
      job,
      {
        id: r.candidate_id,
        experience_years: Number(r.experience_years) || 0,
        skills: r.skills.map((x) => ({ skill: x, source: "parsed" as const, domain: null })),
        optedInDomains: [],
      },
      Number(r.similarity),
      deps.embedder.name,
    );
    return {
      candidateId: r.candidate_id,
      isOwn: r.is_own,
      score: s.score,
      reason: s.explanation,
      fullName: r.full_name,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      headline: r.headline,
      location: r.location,
      experienceYears: Number(r.experience_years) || 0,
      skills: r.skills,
      status: r.status,
      doNotContact: r.do_not_contact,
      intro: introBy.get(r.candidate_id) ?? null,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return {
    own: scored.filter((m) => m.isOwn).slice(0, limit),
    network: scored.filter((m) => !m.isOwn).slice(0, 20),
  };
}

export type JobForPerson = {
  jobId: string;
  title: string;
  company: string | null;
  location: string | null;
  isOwn: boolean;
  score: number;
  reason: string;
};

/** Best open jobs (this workspace's jobs and the public board) for one pool profile. */
export async function bestJobsForPoolCandidate(
  supabase: SupabaseClient,
  pool: { id: string; workspace_id: string; experience_years: number; skills: string[] },
  limit = 10,
): Promise<JobForPerson[]> {
  const deps = engineDeps();
  // make sure open jobs have embeddings (workspace jobs are embedded on demand)
  const missing = await deps.db.query<{ id: string }>(
    `select id from public.jobs where status = 'published' and embedding is null
       and (owner_workspace_id = $1 or visibility = 'public') limit 40`,
    [pool.workspace_id],
  );
  for (const m of missing.rows) await prepareJobForRanking(deps, m.id);
  const { data } = await supabase.rpc("jobs_for_pool_candidate", { p_id: pool.id, p_limit: limit * 2 });
  const rows = (data ?? []) as {
    job_id: string;
    title: string;
    company: string | null;
    location: string | null;
    is_own: boolean;
    similarity: number;
  }[];
  const out: JobForPerson[] = [];
  for (const r of rows) {
    const job = await prepareJobForRanking(deps, r.job_id);
    if (!job) continue;
    const s = scoreMatch(
      job,
      {
        id: pool.id,
        experience_years: Number(pool.experience_years) || 0,
        skills: pool.skills.map((x) => ({ skill: x, source: "parsed" as const, domain: null })),
        optedInDomains: [],
      },
      Number(r.similarity),
      deps.embedder.name,
    );
    out.push({
      jobId: r.job_id,
      title: r.title,
      company: r.company,
      location: r.location,
      isOwn: r.is_own,
      score: s.score,
      reason: s.explanation,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
