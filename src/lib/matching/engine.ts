// Matching engine orchestration (Section 7). Runs as trusted backend code.
// Idempotent: re-running never duplicates matches (unique job/candidate +
// upsert_match), never re-opens answered matches, never re-sends emails
// (the notifier only picks up 'suggested' matches).
import type { Queryable } from "@/lib/db";
import { MATCHING_CONFIG } from "./config";
import { candidateEmbeddingText, jobEmbeddingText } from "./sanitize";
import { textHash, toPgVector, type EmbeddingProvider } from "./embeddings";
import { scoreMatch, type CandidateForScoring, type JobForScoring, type ScoredMatch } from "./scoring";

export interface Reranker {
  rerank(
    job: JobForScoring & { description_summary: string },
    items: { candidateId: string; profileText: string; score: number }[],
  ): Promise<{ candidateId: string; adjustment: number; explanation?: string }[]>;
}

export interface EngineDeps {
  db: Queryable;
  embedder: EmbeddingProvider;
  reranker?: Reranker | null;
  threshold?: number;
  topN?: number;
}

export interface MatchRunResult {
  scored: number;
  kept: number;
  removed: number;
  matches: ScoredMatch[];
}

type JobRow = JobForScoring & {
  description_summary: string;
  status: string;
  embedding_hash: string | null;
  has_embedding: boolean;
};

async function loadJob(db: Queryable, jobId: string): Promise<JobRow | null> {
  const r = await db.query<JobRow>(
    `select id, title, description_summary, required_skills, nice_skills, domains,
            min_exp::float8 as min_exp, max_exp::float8 as max_exp, status, embedding_hash,
            (embedding is not null) as has_embedding
     from public.jobs where id = $1`,
    [jobId],
  );
  return r.rows[0] ?? null;
}

export async function ensureJobEmbedding(deps: EngineDeps, job: JobRow): Promise<void> {
  const text = jobEmbeddingText(job);
  const hash = textHash(deps.embedder.name, text);
  if (job.has_embedding && job.embedding_hash === hash) return;
  const [vec] = await deps.embedder.embed([text], "query");
  await deps.db.query("update public.jobs set embedding = $2::extensions.vector, embedding_hash = $3 where id = $1", [
    job.id,
    toPgVector(vec),
    hash,
  ]);
}

interface CandidateTextRow {
  id: string;
  headline: string | null;
  summary: string | null;
  desired_roles: string[];
  embedding_hash: string | null;
  has_embedding: boolean;
  skills: string[] | null;
  experiences: { title: string; description: string | null }[] | null;
  certifications: string[] | null;
}

const CANDIDATE_TEXT_SQL = `
  select c.id, c.headline, c.summary, c.desired_roles, c.embedding_hash, (c.embedding is not null) as has_embedding,
         (select array_agg(s.skill order by s.skill) from public.candidate_skills s where s.candidate_id = c.id) as skills,
         (select json_agg(json_build_object('title', e.title, 'description', e.description) order by e.position, e.start_date desc nulls last)
            from public.experiences e where e.candidate_id = c.id) as experiences,
         (select array_agg(ct.name order by ct.name) from public.certifications ct where ct.candidate_id = c.id) as certifications
  from public.candidates c`;

/** Embed every claimed candidate whose profile text changed (or has no embedding). */
export async function refreshCandidateEmbeddings(deps: EngineDeps, candidateIds?: string[]): Promise<number> {
  const r = await deps.db.query<CandidateTextRow>(
    `${CANDIDATE_TEXT_SQL}
     where c.claim_status = 'claimed' and (c.embedding is null or c.needs_matching)
       ${candidateIds ? "and c.id = any($1::uuid[])" : ""}`,
    candidateIds ? [candidateIds] : [],
  );
  const todo: { id: string; text: string; hash: string }[] = [];
  for (const row of r.rows) {
    const text = candidateEmbeddingText({
      headline: row.headline,
      summary: row.summary,
      desiredRoles: row.desired_roles,
      skills: row.skills ?? [],
      experiences: row.experiences ?? [],
      certifications: row.certifications ?? [],
    });
    const hash = textHash(deps.embedder.name, text);
    if (row.has_embedding && row.embedding_hash === hash) continue;
    todo.push({ id: row.id, text, hash });
  }
  if (!todo.length) return 0;
  const vectors = await deps.embedder.embed(
    todo.map((t) => t.text),
    "document",
  );
  for (let i = 0; i < todo.length; i++) {
    await deps.db.query(
      "update public.candidates set embedding = $2::extensions.vector, embedding_hash = $3 where id = $1",
      [todo[i].id, toPgVector(vectors[i]), todo[i].hash],
    );
  }
  return todo.length;
}

async function loadCandidatesForScoring(db: Queryable, ids: string[]): Promise<Map<string, CandidateForScoring>> {
  if (!ids.length) return new Map();
  const r = await db.query<{
    id: string;
    experience_years: number;
    skills: CandidateForScoring["skills"] | null;
    opted_in_domains: string[] | null;
  }>(
    `select c.id, c.experience_years::float8 as experience_years,
            (select json_agg(json_build_object('skill', s.skill, 'source', s.source, 'domain', s.domain))
               from public.candidate_skills s where s.candidate_id = c.id) as skills,
            (select array_agg(distinct rc.domain) from public.redistribution_consent rc
               where rc.candidate_id = c.id and rc.status = 'opted_in') as opted_in_domains
     from public.candidates c where c.id = any($1::uuid[])`,
    [ids],
  );
  return new Map(
    r.rows.map((row) => [
      row.id,
      {
        id: row.id,
        experience_years: Number(row.experience_years) || 0,
        skills: row.skills ?? [],
        optedInDomains: row.opted_in_domains ?? [],
      },
    ]),
  );
}

async function profileTexts(db: Queryable, ids: string[]): Promise<Map<string, string>> {
  const r = await db.query<CandidateTextRow>(`${CANDIDATE_TEXT_SQL} where c.id = any($1::uuid[])`, [ids]);
  return new Map(
    r.rows.map((row) => [
      row.id,
      candidateEmbeddingText({
        headline: row.headline,
        summary: row.summary,
        desiredRoles: row.desired_roles,
        skills: row.skills ?? [],
        experiences: row.experiences ?? [],
        certifications: row.certifications ?? [],
      }),
    ]),
  );
}

async function applyRerank(deps: EngineDeps, job: JobRow, scored: ScoredMatch[]): Promise<void> {
  if (!deps.reranker) return;
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, MATCHING_CONFIG.rerank.topK);
  if (!top.length) return;
  const texts = await profileTexts(
    deps.db,
    top.map((t) => t.candidateId),
  );
  try {
    const adjustments = await deps.reranker.rerank(
      job,
      top.map((t) => ({ candidateId: t.candidateId, profileText: texts.get(t.candidateId) ?? "", score: t.score })),
    );
    const max = MATCHING_CONFIG.rerank.maxAdjustment;
    for (const a of adjustments) {
      const m = top.find((t) => t.candidateId === a.candidateId);
      if (!m) continue;
      const adj = Math.max(-max, Math.min(max, Math.round(a.adjustment)));
      m.score = Math.max(0, Math.min(100, m.score + adj));
      m.breakdown.llmAdjustment = adj;
      if (a.explanation) m.explanation = a.explanation.slice(0, 500);
    }
  } catch (e) {
    // Re-rank is optional: fall back to deterministic scores.
    console.warn("[matching] re-rank failed, using deterministic scores", e);
  }
}

async function persist(deps: EngineDeps, matches: ScoredMatch[]): Promise<void> {
  for (const m of matches) {
    await deps.db.query("select public.upsert_match($1, $2, $3, $4::jsonb, $5, $6)", [
      m.jobId,
      m.candidateId,
      m.score,
      JSON.stringify(m.breakdown),
      m.explanation,
      m.isVetted,
    ]);
  }
}

/** Match one published job against the candidate pool. */
export async function matchJob(deps: EngineDeps, jobId: string): Promise<MatchRunResult> {
  const threshold = deps.threshold ?? MATCHING_CONFIG.threshold;
  const job = await loadJob(deps.db, jobId);
  if (!job || job.status !== "published") {
    await deps.db.query("update public.jobs set needs_matching = false where id = $1", [jobId]);
    return { scored: 0, kept: 0, removed: 0, matches: [] };
  }
  await ensureJobEmbedding(deps, job);
  await refreshCandidateEmbeddings(deps);

  const hits = await deps.db.query<{ candidate_id: string; similarity: number }>(
    "select candidate_id, similarity from public.match_candidates_for_job($1, $2)",
    [jobId, deps.topN ?? MATCHING_CONFIG.topN],
  );
  const cands = await loadCandidatesForScoring(
    deps.db,
    hits.rows.map((h) => h.candidate_id),
  );
  const scored = hits.rows
    .map(
      (h) =>
        cands.get(h.candidate_id) &&
        scoreMatch(job, cands.get(h.candidate_id)!, Number(h.similarity), deps.embedder.name),
    )
    .filter((m): m is ScoredMatch => !!m);
  await applyRerank(deps, job, scored);

  const kept = scored.filter((m) => m.score >= threshold).sort((a, b) => b.score - a.score);
  await persist(deps, kept);
  // drop unsent suggestions that no longer qualify
  const removed = await deps.db.query(
    "delete from public.matches where job_id = $1 and status = 'suggested' and not (candidate_id = any($2::uuid[]))",
    [jobId, kept.map((k) => k.candidateId)],
  );
  await deps.db.query("update public.jobs set needs_matching = false where id = $1", [jobId]);
  return { scored: scored.length, kept: kept.length, removed: removed.rowCount ?? 0, matches: kept };
}

/** Match one candidate against all published jobs (profile created/updated). */
export async function matchCandidate(deps: EngineDeps, candidateId: string): Promise<MatchRunResult> {
  const threshold = deps.threshold ?? MATCHING_CONFIG.threshold;
  await refreshCandidateEmbeddings(deps, [candidateId]);
  // make sure published jobs have embeddings
  const unembedded = await deps.db.query<{ id: string }>(
    "select id from public.jobs where status = 'published' and embedding is null",
  );
  for (const j of unembedded.rows) {
    const job = await loadJob(deps.db, j.id);
    if (job) await ensureJobEmbedding(deps, job);
  }
  const hits = await deps.db.query<{ job_id: string; similarity: number }>(
    "select job_id, similarity from public.match_jobs_for_candidate($1, $2)",
    [candidateId, deps.topN ?? MATCHING_CONFIG.topN],
  );
  const cand = (await loadCandidatesForScoring(deps.db, [candidateId])).get(candidateId);
  const kept: ScoredMatch[] = [];
  let scoredCount = 0;
  if (cand) {
    for (const h of hits.rows) {
      const job = await loadJob(deps.db, h.job_id);
      if (!job) continue;
      scoredCount++;
      const m = scoreMatch(job, cand, Number(h.similarity), deps.embedder.name);
      if (m.score >= threshold) kept.push(m);
    }
  }
  await persist(deps, kept);
  const removed = await deps.db.query(
    "delete from public.matches where candidate_id = $1 and status = 'suggested' and not (job_id = any($2::uuid[]))",
    [candidateId, kept.map((k) => k.jobId)],
  );
  await deps.db.query("update public.candidates set needs_matching = false where id = $1", [candidateId]);
  return { scored: scoredCount, kept: kept.length, removed: removed.rowCount ?? 0, matches: kept };
}

/** Process everything flagged needs_matching (cron / after writes). */
export async function runPendingMatching(deps: EngineDeps, limit = 50) {
  const jobs = await deps.db.query<{ id: string }>(
    "select id from public.jobs where needs_matching and status = 'published' order by updated_at limit $1",
    [limit],
  );
  let jobMatches = 0;
  for (const j of jobs.rows) jobMatches += (await matchJob(deps, j.id)).kept;
  const cands = await deps.db.query<{ id: string }>(
    "select id from public.candidates where needs_matching and claim_status = 'claimed' order by updated_at limit $1",
    [limit],
  );
  let candidateMatches = 0;
  for (const c of cands.rows) candidateMatches += (await matchCandidate(deps, c.id)).kept;
  return { jobs: jobs.rowCount ?? 0, candidates: cands.rowCount ?? 0, jobMatches, candidateMatches };
}
