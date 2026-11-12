// Matching engine tuning — the ONE place weights and thresholds live (Section 7).
// Change values here and re-run `npm test` (tests/matching) to check rankings.
// Decisions/tuning notes: docs/decisions.md (D-004).

export const MATCHING_CONFIG = {
  /** Candidates taken from the vector search after hard filters. */
  topN: 50,
  /** Only matches at or above this score enter the notify step. */
  threshold: 70,
  /** Base score blend (sums to 1). */
  weights: {
    semantic: 0.35,
    skills: 0.45,
    experience: 0.2,
  },
  /** Within the skill score: required vs nice-to-have. */
  skillSplit: { required: 0.8, nice: 0.2 },
  /** Verified (interview-vetted) strengths count more than self/parsed skills. */
  verifiedSkillMultiplier: 1.5,
  /** Points added (score is capped at 100) when vetted strengths fit the job's domains. */
  verifiedBoostMax: 8,
  /** Over-qualification: score multiplier when experience exceeds max_exp. */
  overMaxExperienceFactor: 0.85,
  /** Raw cosine similarity is mapped to 0..1 between these bounds, per embeddings provider. */
  semanticBounds: {
    local: { floor: 0.05, ceil: 0.55 },
    voyage: { floor: 0.3, ceil: 0.8 },
  } as Record<string, { floor: number; ceil: number }>,
  /** Optional LLM re-rank (toggle with MATCHING_LLM_RERANK=true) on the top K only. */
  rerank: { topK: 20, maxAdjustment: 10 },
} as const;

export const NOTIFY_CONFIG = {
  /** Max match emails per candidate per rolling 7 days. */
  maxEmailsPerWeek: 3,
  /** Max matches listed in one email (the rest wait for the next email). */
  maxMatchesPerEmail: 5,
  /** Days a notified match waits for a reply before expiring. */
  matchExpiryDays: 14,
  /** Minimum gap between match emails by frequency preference (hours). */
  frequencyHours: { instant: 0, daily: 24, weekly: 24 * 7 } as Record<string, number>,
  /** Delivery retries for transient email failures. */
  maxAttempts: 3,
} as const;

export const SOURCED_JOB_CONFIG = {
  defaultExpiryDays: 30,
} as const;
