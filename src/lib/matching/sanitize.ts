// Strip protected characteristics before embedding or sending text to an LLM
// for matching (Principle 7). Matching uses skills and experience only.

const PROTECTED_LINE =
  /^\s*(date of birth|d\.?o\.?b\.?|birth ?date|born|age|gender|sex|marital status|married|single|divorced|widowed|religion|religious|faith|ethnicity|ethnic origin|race|nationality|citizenship|national id|passport( no| number)?|place of birth|photo|photograph|picture|sexual orientation|pronouns|disability|health|pregnan\w*|number of children|children|dependents|spouse|husband|wife|visa status)\b\s*[:\-–].*$/gim;

const INLINE_PATTERNS: RegExp[] = [
  /\b(aged?|age)\s*[:\-]?\s*\d{2}\b/gi,
  /\b\d{2}\s*(years|yrs)\s*old\b/gi,
  /\b(male|female|non-binary|nonbinary)\b/gi,
  /\b(married|unmarried|divorced|widowed)\b/gi,
  /\b(he\/him|she\/her|they\/them)\b/gi,
  /\b(born (on|in)\s+[^.,\n]{2,40})/gi,
  /\b(muslim|christian|catholic|protestant|jewish|hindu|buddhist|sikh|atheist)\b/gi,
];

// Contact details are not matching inputs either.
const CONTACT_PATTERNS: RegExp[] = [/[\w.+-]+@[\w-]+\.[\w.-]+/g, /\+?\d[\d\s().-]{7,}\d/g, /https?:\/\/\S+/g];

export function stripProtectedCharacteristics(text: string): string {
  let out = text.replace(PROTECTED_LINE, "");
  for (const p of INLINE_PATTERNS) out = out.replace(p, " ");
  for (const p of CONTACT_PATTERNS) out = out.replace(p, " ");
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fields that may be used to build a candidate's matching text. Nothing else. */
export interface CandidateMatchingText {
  headline?: string | null;
  summary?: string | null;
  desiredRoles?: string[];
  skills: string[];
  experiences: { title: string; description?: string | null }[];
  certifications: string[];
}

export function candidateEmbeddingText(c: CandidateMatchingText): string {
  const parts = [
    c.headline ?? "",
    (c.desiredRoles ?? []).join(", "),
    `Skills: ${c.skills.join(", ")}`,
    ...c.experiences.map((e) => `${e.title}. ${e.description ?? ""}`),
    c.certifications.length ? `Certifications: ${c.certifications.join(", ")}` : "",
    c.summary ?? "",
  ];
  return stripProtectedCharacteristics(parts.filter(Boolean).join("\n")).slice(0, 8000);
}

export interface JobMatchingText {
  title: string;
  description_summary?: string | null;
  required_skills: string[];
  nice_skills: string[];
  domains?: string[];
}

export function jobEmbeddingText(j: JobMatchingText): string {
  const parts = [
    j.title,
    `Required skills: ${j.required_skills.join(", ")}`,
    j.nice_skills.length ? `Nice to have: ${j.nice_skills.join(", ")}` : "",
    (j.domains ?? []).length ? `Domains: ${(j.domains ?? []).join(", ")}` : "",
    j.description_summary ?? "",
  ];
  return stripProtectedCharacteristics(parts.filter(Boolean).join("\n")).slice(0, 8000);
}
