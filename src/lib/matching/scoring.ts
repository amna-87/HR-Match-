// Combined score (Section 7, steps 3-4). Pure functions: easy to test and tune.
import { MATCHING_CONFIG } from "./config";
import { normalizeSkill, skillOverlap, type SkillOverlap, type WeightedSkill } from "./skills";

export interface JobForScoring {
  id: string;
  title: string;
  required_skills: string[];
  nice_skills: string[];
  domains: string[];
  min_exp: number | null;
  max_exp: number | null;
}

export interface CandidateForScoring {
  id: string;
  experience_years: number;
  skills: { skill: string; source: "self" | "parsed" | "verified"; domain: string | null }[];
  /** Domains the candidate opted in to via the redistribution loop. */
  optedInDomains: string[];
}

export interface ScoreBreakdown {
  semantic: number; // 0..1 (normalized similarity)
  semanticRaw: number; // raw cosine similarity
  skills: number; // 0..1
  experience: number; // 0..1
  verifiedBoost: number; // points added
  base: number; // 0..100 before boost
  llmAdjustment?: number;
  overlap: Pick<SkillOverlap, "requiredMatched" | "requiredMissing" | "niceMatched" | "verifiedMatched">;
  weights: typeof MATCHING_CONFIG.weights;
}

export interface ScoredMatch {
  candidateId: string;
  jobId: string;
  score: number; // 0..100, 2 decimals
  breakdown: ScoreBreakdown;
  isVetted: boolean;
  explanation: string;
}

export function normalizeSemantic(raw: number, provider: string): number {
  const b = MATCHING_CONFIG.semanticBounds[provider] ?? MATCHING_CONFIG.semanticBounds.local;
  return clamp01((raw - b.floor) / (b.ceil - b.floor));
}

export function experienceFit(years: number, min: number | null, max: number | null): number {
  const lo = min ?? 0;
  let fit = lo <= 0 ? 1 : clamp01(years / lo);
  if (max != null && years > max) fit *= MATCHING_CONFIG.overMaxExperienceFactor;
  return fit;
}

export function scoreMatch(
  job: JobForScoring,
  cand: CandidateForScoring,
  semanticRaw: number,
  provider: string,
): ScoredMatch {
  const cfg = MATCHING_CONFIG;
  const weighted: WeightedSkill[] = cand.skills.map((s) => ({
    skill: s.skill,
    verified: s.source === "verified",
    weight: s.source === "verified" ? cfg.verifiedSkillMultiplier : 1,
  }));
  const overlap = skillOverlap(job.required_skills, job.nice_skills, weighted, cfg.verifiedSkillMultiplier);
  const skills = cfg.skillSplit.required * overlap.requiredScore + cfg.skillSplit.nice * overlap.niceScore;
  const semantic = normalizeSemantic(semanticRaw, provider);
  const experience = experienceFit(cand.experience_years, job.min_exp, job.max_exp);
  const base = 100 * (cfg.weights.semantic * semantic + cfg.weights.skills * skills + cfg.weights.experience * experience);

  // Verified-strength boost: only for domains the candidate opted in to that this job is in.
  const jobDomains = new Set(job.domains.map(normalizeSkill));
  const vettedDomains = cand.optedInDomains.map(normalizeSkill).filter((d) => jobDomains.has(d));
  const isVetted = vettedDomains.length > 0;
  let verifiedBoost = 0;
  if (isVetted) {
    const jobSkillCount = new Set([...job.required_skills, ...job.nice_skills].map(normalizeSkill)).size || 1;
    const fraction = Math.min(1, (overlap.verifiedMatched.length + 1) / (jobSkillCount + 1));
    verifiedBoost = cfg.verifiedBoostMax * (0.5 + 0.5 * fraction);
  }
  const score = round2(Math.min(100, base + verifiedBoost));
  const breakdown: ScoreBreakdown = {
    semantic: round4(semantic),
    semanticRaw: round4(semanticRaw),
    skills: round4(skills),
    experience: round4(experience),
    verifiedBoost: round2(verifiedBoost),
    base: round2(base),
    overlap: {
      requiredMatched: overlap.requiredMatched,
      requiredMissing: overlap.requiredMissing,
      niceMatched: overlap.niceMatched,
      verifiedMatched: overlap.verifiedMatched,
    },
    weights: cfg.weights,
  };
  return {
    candidateId: cand.id,
    jobId: job.id,
    score,
    breakdown,
    isVetted,
    explanation: explainMatch(job, cand, breakdown, isVetted),
  };
}

export function explainMatch(
  job: JobForScoring,
  cand: CandidateForScoring,
  b: ScoreBreakdown,
  isVetted: boolean,
): string {
  const parts: string[] = [];
  const matched = [...b.overlap.requiredMatched, ...b.overlap.niceMatched];
  if (matched.length) parts.push(matched.slice(0, 5).join(", "));
  if (cand.experience_years > 0) {
    parts.push(`${formatYears(cand.experience_years)} experience${job.min_exp ? ` (${job.min_exp}+ required)` : ""}`);
  }
  if (isVetted) parts.push("interview-vetted strengths in this area");
  const head = parts.length ? `Matched on: ${parts.join("; ")}.` : "Matched on overall profile similarity.";
  const missing = b.overlap.requiredMissing.length ? ` Missing: ${b.overlap.requiredMissing.slice(0, 3).join(", ")}.` : "";
  return head + missing;
}

function formatYears(y: number) {
  const r = Math.round(y * 10) / 10;
  return `${r} year${r === 1 ? "" : "s"}`;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const round2 = (x: number) => Math.round(x * 100) / 100;
const round4 = (x: number) => Math.round(x * 10000) / 10000;
