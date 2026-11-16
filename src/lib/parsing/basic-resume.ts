// Offline resume reader used when AI parsing is unavailable (no API key, outage).
// Deterministic and conservative: contact details by pattern, skills from a
// known vocabulary, years of experience from explicit statements. The result
// goes through the same cleanParsedResume() as AI output (protected details stripped).
import type { ParsedResume } from "./schemas";
import { cleanParsedResume } from "./resume";
import { SKILL_ALIASES, normalizeSkill } from "@/lib/matching/skills";
import { stripProtectedCharacteristics } from "@/lib/matching/sanitize";

const SKILLS = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c#",
  "c++",
  "go",
  "rust",
  "ruby",
  "php",
  "kotlin",
  "swift",
  "scala",
  "sql",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "graphql",
  "rest api",
  "node.js",
  "react",
  "next.js",
  "vue",
  "angular",
  "svelte",
  "django",
  "flask",
  "fastapi",
  "spring",
  "rails",
  "laravel",
  ".net",
  "html",
  "css",
  "tailwind",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "terraform",
  "ci/cd",
  "linux",
  "git",
  "microservices",
  "machine learning",
  "data analysis",
  "data science",
  "pandas",
  "tableau",
  "power bi",
  "excel",
  "statistics",
  "etl",
  "spark",
  "airflow",
  "dbt",
  "snowflake",
  "bigquery",
  "llm",
  "nlp",
  "computer vision",
  "product management",
  "project management",
  "agile",
  "scrum",
  "jira",
  "stakeholder management",
  "ux design",
  "ui design",
  "figma",
  "user research",
  "prototyping",
  "graphic design",
  "adobe photoshop",
  "adobe illustrator",
  "video editing",
  "social media marketing",
  "content strategy",
  "copywriting",
  "seo",
  "sem",
  "google ads",
  "meta ads",
  "email marketing",
  "marketing automation",
  "hubspot",
  "google analytics",
  "brand strategy",
  "community management",
  "public relations",
  "sales",
  "business development",
  "account management",
  "salesforce",
  "crm",
  "customer success",
  "customer service",
  "negotiation",
  "lead generation",
  "accounting",
  "bookkeeping",
  "financial reporting",
  "financial analysis",
  "budgeting",
  "forecasting",
  "audit",
  "tax",
  "ifrs",
  "gaap",
  "accounts payable",
  "accounts receivable",
  "payroll",
  "quickbooks",
  "sap",
  "xero",
  "recruiting",
  "talent acquisition",
  "hr",
  "onboarding",
  "employee relations",
  "training",
  "operations",
  "supply chain",
  "logistics",
  "procurement",
  "inventory management",
  "teaching",
  "nursing",
  "patient care",
  "legal research",
  "contract management",
  "compliance",
  "communication",
  "leadership",
  "team management",
  "public speaking",
  "translation",
];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const YEARS = /(\d{1,2})\+?\s*(?:years|yrs)(?:\s+of)?\s+(?:professional\s+|work\s+|relevant\s+)?experience/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function basicParseResume(text: string): ParsedResume & { experience_years_hint: number | null } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const email = text.match(EMAIL)?.[0] ?? "";
  const phone = text.match(PHONE)?.[1]?.trim() ?? "";
  // The name is usually the first short line made only of letters.
  const full_name =
    lines.slice(0, 5).find((l) => /^[\p{L}][\p{L}'’.-]*(\s+[\p{L}][\p{L}'’.-]*){1,3}$/u.test(l) && l.length <= 60) ??
    "";
  const nameIdx = full_name ? lines.indexOf(full_name) : -1;
  const headlineCandidate = nameIdx >= 0 ? lines[nameIdx + 1] : undefined;
  const headline =
    headlineCandidate &&
    headlineCandidate.length <= 80 &&
    !EMAIL.test(headlineCandidate) &&
    !/\d{4}/.test(headlineCandidate)
      ? headlineCandidate
      : "";

  const lower = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const found = new Set<string>();
  for (const s of [...SKILLS, ...Object.keys(SKILL_ALIASES)]) {
    if (new RegExp(`(^|[^a-z0-9+#.])${escape(s)}($|[^a-z0-9+#])`).test(lower)) found.add(normalizeSkill(s));
  }

  // Strip protected details line by line (the filter is line-based) before flattening.
  const summary = stripProtectedCharacteristics(text.replace(EMAIL, " ").replace(PHONE, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
  const years = text.match(YEARS);
  const parsed = cleanParsedResume({
    full_name,
    email,
    phone,
    headline,
    summary,
    location: "",
    skills: [...found].slice(0, 30),
    experiences: [],
    education: [],
    certifications: [],
    languages: [],
  });
  return { ...parsed, experience_years_hint: years ? Math.min(50, Number(years[1])) : null };
}
