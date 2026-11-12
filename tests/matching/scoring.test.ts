import { describe, expect, it } from "vitest";
import { normalizeSkill, skillOverlap } from "@/lib/matching/skills";
import { experienceFit, scoreMatch, type CandidateForScoring, type JobForScoring } from "@/lib/matching/scoring";
import { candidateEmbeddingText, stripProtectedCharacteristics } from "@/lib/matching/sanitize";
import { LocalEmbeddingProvider } from "@/lib/matching/embeddings";
import { MATCHING_CONFIG } from "@/lib/matching/config";

const job: JobForScoring = {
  id: "job",
  title: "Social Media Marketing Manager",
  required_skills: ["social media marketing", "meta ads", "content strategy"],
  nice_skills: ["tiktok", "copywriting"],
  domains: ["marketing", "social media"],
  min_exp: 3,
  max_exp: 10,
};

const cand = (
  id: string,
  skills: string[],
  years: number,
  extra: Partial<CandidateForScoring> = {},
): CandidateForScoring => ({
  id,
  experience_years: years,
  skills: skills.map((s) => ({ skill: s, source: "parsed", domain: null })),
  optedInDomains: [],
  ...extra,
});

describe("skills", () => {
  it("normalizes aliases", () => {
    expect(normalizeSkill(" Facebook Ads ")).toBe("meta ads");
    expect(normalizeSkill("NodeJS")).toBe("node.js");
    expect(normalizeSkill("Social Media")).toBe("social media marketing");
  });

  it("computes required/nice overlap", () => {
    const o = skillOverlap(
      job.required_skills,
      job.nice_skills,
      [{ skill: "Facebook Ads", weight: 1, verified: false }],
      1.5,
    );
    expect(o.requiredMatched).toEqual(["meta ads"]);
    expect(o.requiredMissing).toEqual(["social media marketing", "content strategy"]);
    expect(o.requiredScore).toBeCloseTo(1 / 3);
  });

  it("verified skills earn more credit than unverified partial matches", () => {
    const unverified = skillOverlap(
      ["copywriting"],
      [],
      [{ skill: "strong copywriting", weight: 1, verified: false }],
      1.5,
    );
    const verified = skillOverlap(
      ["copywriting"],
      [],
      [{ skill: "strong copywriting", weight: 1.5, verified: true }],
      1.5,
    );
    expect(verified.requiredScore).toBeGreaterThan(unverified.requiredScore);
    expect(verified.verifiedMatched).toEqual(["copywriting"]);
  });
});

describe("experience fit", () => {
  it("scales below the minimum, full at/above, small penalty above max", () => {
    expect(experienceFit(1.5, 3, null)).toBeCloseTo(0.5);
    expect(experienceFit(5, 3, 10)).toBe(1);
    expect(experienceFit(15, 3, 10)).toBeCloseTo(MATCHING_CONFIG.overMaxExperienceFactor);
    expect(experienceFit(0, null, null)).toBe(1);
  });
});

describe("combined score", () => {
  it("is 0..100 with a stored breakdown and human-readable explanation", () => {
    const m = scoreMatch(
      job,
      cand("a", ["social media marketing", "meta ads", "content strategy", "tiktok"], 6),
      0.5,
      "local",
    );
    expect(m.score).toBeGreaterThan(70);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(m.breakdown.overlap.requiredMatched).toHaveLength(3);
    expect(m.explanation).toMatch(
      /^Matched on: social media marketing, meta ads, content strategy, tiktok; 6 years experience/,
    );
  });

  it("ranks a relevant marketer above an unrelated engineer", () => {
    const embedder = new LocalEmbeddingProvider();
    const jobVec = embedder.embedOne("Social Media Marketing Manager. Meta Ads, content strategy, TikTok.");
    const marketer = embedder.embedOne(
      candidateEmbeddingText({
        headline: "Social media manager",
        skills: ["social media marketing", "meta ads"],
        experiences: [],
        certifications: [],
      }),
    );
    const engineer = embedder.embedOne(
      candidateEmbeddingText({
        headline: "Backend engineer",
        skills: ["typescript", "postgresql"],
        experiences: [],
        certifications: [],
      }),
    );
    const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    const mk = scoreMatch(job, cand("m", ["social media marketing", "meta ads"], 5), cos(jobVec, marketer), "local");
    const en = scoreMatch(job, cand("e", ["typescript", "postgresql"], 7), cos(jobVec, engineer), "local");
    expect(mk.score).toBeGreaterThan(en.score + 30);
    expect(en.score).toBeLessThan(MATCHING_CONFIG.threshold);
  });

  it("vetted candidates get a bounded boost only for opted-in domains in this job", () => {
    const skills = ["social media marketing", "content strategy"];
    const plain = scoreMatch(job, cand("p", skills, 4), 0.3, "local");
    const vetted = scoreMatch(job, cand("v", skills, 4, { optedInDomains: ["Social Media"] }), 0.3, "local");
    const otherDomain = scoreMatch(job, cand("o", skills, 4, { optedInDomains: ["finance"] }), 0.3, "local");
    expect(vetted.isVetted).toBe(true);
    expect(vetted.score - plain.score).toBeGreaterThan(0);
    expect(vetted.score - plain.score).toBeLessThanOrEqual(MATCHING_CONFIG.verifiedBoostMax);
    expect(otherDomain.score).toBe(plain.score);
    expect(vetted.explanation).toContain("interview-vetted");
  });

  it("weights sum to 1", () => {
    const w = MATCHING_CONFIG.weights;
    expect(w.semantic + w.skills + w.experience).toBeCloseTo(1);
  });
});

describe("protected characteristics", () => {
  const resume = `Maya Chen
Date of Birth: 01/02/1990
Gender: Female
Marital status: Married
Nationality: British
Religion: Christian
Email: maya@example.test  Phone: +44 20 7946 0958
Aged 34, she/her.
Social media marketing manager with 6 years of Meta Ads experience.`;

  it("are stripped before embedding", () => {
    const out = stripProtectedCharacteristics(resume);
    for (const banned of [
      "1990",
      "Female",
      "Married",
      "British",
      "Christian",
      "maya@example.test",
      "7946",
      "34",
      "she/her",
    ]) {
      expect(out).not.toContain(banned);
    }
    expect(out).toContain("Social media marketing manager with 6 years of Meta Ads experience.");
  });

  it("do not change the embedding (or the score)", () => {
    const e = new LocalEmbeddingProvider();
    const base = candidateEmbeddingText({
      summary: "Social media marketing manager.",
      skills: ["meta ads"],
      experiences: [],
      certifications: [],
    });
    const withProtected = candidateEmbeddingText({
      summary: "Gender: Male\nReligion: Hindu\nNationality: Indian\nSocial media marketing manager.",
      skills: ["meta ads"],
      experiences: [],
      certifications: [],
    });
    expect(e.embedOne(withProtected)).toEqual(e.embedOne(base));
  });
});
