// Skill normalization + overlap. Deterministic and dependency-free.

/** Canonical names for common variants. Keys and values are lowercase. */
export const SKILL_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  node: "node.js",
  nodejs: "node.js",
  "node js": "node.js",
  postgres: "postgresql",
  psql: "postgresql",
  "facebook ads": "meta ads",
  "instagram ads": "meta ads",
  "fb ads": "meta ads",
  "social media": "social media marketing",
  smm: "social media marketing",
  "social media management": "social media marketing",
  "copy writing": "copywriting",
  "content writing": "copywriting",
  "content marketing": "content strategy",
  "amazon web services": "aws",
  k8s: "kubernetes",
  "ms excel": "excel",
  "microsoft excel": "excel",
  "ux research": "user research",
  "ui/ux": "ux design",
  "search engine optimization": "seo",
  "google adwords": "google ads",
  ppc: "google ads",
};

export function normalizeSkill(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-•*·]+|[\s.,;:]+$/g, "")
    .trim();
  return SKILL_ALIASES[s] ?? s;
}

export interface WeightedSkill {
  skill: string;
  weight: number; // 1 for self/parsed; >1 for verified
  verified: boolean;
}

function skillMatches(wanted: string, have: string): boolean {
  if (wanted === have) return true;
  // multi-word containment ("meta ads" vs "meta ads campaigns"), but avoid tiny tokens matching everything
  if (wanted.length >= 4 && have.length >= 4 && (have.includes(wanted) || wanted.includes(have))) return true;
  return false;
}

export interface SkillOverlap {
  requiredMatched: string[];
  requiredMissing: string[];
  niceMatched: string[];
  /** 0..1 */
  requiredScore: number;
  /** 0..1 */
  niceScore: number;
  verifiedMatched: string[];
}

/**
 * Compare job skills to candidate skills. A verified skill counts `multiplier`
 * times (capped so a single requirement can't exceed full credit).
 */
export function skillOverlap(
  required: string[],
  nice: string[],
  candidate: WeightedSkill[],
  verifiedMultiplier: number,
): SkillOverlap {
  const have = candidate.map((c) => ({ ...c, n: normalizeSkill(c.skill) }));
  const req = [...new Set(required.map(normalizeSkill).filter(Boolean))];
  const nic = [...new Set(nice.map(normalizeSkill).filter(Boolean))].filter((s) => !req.includes(s));

  const verifiedMatched: string[] = [];
  // exact match = 1, partial (containment) = 0.85; verified skills get the multiplier (capped at 1)
  const credit = (wanted: string): number => {
    let best = 0;
    for (const h of have) {
      if (!skillMatches(wanted, h.n)) continue;
      const base = h.n === wanted ? 1 : 0.85;
      const c = h.verified ? Math.min(1, base * verifiedMultiplier) : base;
      if (h.verified && !verifiedMatched.includes(wanted)) verifiedMatched.push(wanted);
      best = Math.max(best, c);
    }
    return best;
  };

  const reqCredits = req.map((r) => [r, credit(r)] as const);
  const niceCredits = nic.map((r) => [r, credit(r)] as const);
  return {
    requiredMatched: reqCredits.filter(([, c]) => c > 0).map(([s]) => s),
    requiredMissing: reqCredits.filter(([, c]) => c === 0).map(([s]) => s),
    niceMatched: niceCredits.filter(([, c]) => c > 0).map(([s]) => s),
    requiredScore: req.length ? reqCredits.reduce((a, [, c]) => a + c, 0) / req.length : 1,
    niceScore: nic.length ? niceCredits.reduce((a, [, c]) => a + c, 0) / nic.length : 0,
    verifiedMatched,
  };
}
