// Offline resume reader used when AI parsing is unavailable (no API key, outage).
// Deterministic and conservative: contact details by pattern, skills from a
// known vocabulary, years of experience from explicit statements. The result
// goes through the same cleanParsedResume() as AI output (protected details stripped).
import type { ParsedResume } from "./schemas";
import { cleanParsedResume, computeExperienceYears } from "./resume";
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

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
// "Jan 2019 - Present", "2019 – 2022", "03/2018 to 06/2021"
const DATE = String.raw`(?:(?:[A-Za-z]{3,9}\.?\s+)|(?:\d{1,2}[/.-]))?\d{4}`;
const RANGE = new RegExp(
  String.raw`\(?\s*(${DATE})\s*(?:-|–|—|to|until)\s*(${DATE}|present|current|now|today)\s*\)?`,
  "i",
);

function toIsoDate(s: string): string {
  const y = s.match(/\d{4}/)?.[0];
  if (!y) return "";
  const word = s
    .match(/^([A-Za-z]{3,9})/)?.[1]
    ?.toLowerCase()
    .slice(0, 4);
  const num = s.match(/^(\d{1,2})[/.-]/)?.[1];
  const m = (word && (MONTHS[word] ?? MONTHS[word.slice(0, 3)])) || (num ? Math.min(12, Math.max(1, Number(num))) : 1);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Work history from lines like "Title at Company (2019 - present)" or "Title | Company | 2018 – 2021". */
function experiencesFrom(lines: string[]): ParsedResume["experiences"] {
  const out: ParsedResume["experiences"] = [];
  for (const line of lines) {
    const r = line.match(RANGE);
    if (!r || line.length > 160) continue;
    const rest = line
      .replace(r[0], " ")
      .replace(/[,|•·–—-]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const parts = rest
      .split(/\s+(?:at|@)\s+|\s*[|•·]\s*|\s+[–—-]\s+|,\s+/i)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length || parts[0].length > 100 || EMAIL.test(parts[0])) continue;
    const current = /present|current|now|today/i.test(r[2]);
    out.push({
      title: parts[0],
      company: parts[1] ?? "",
      start_date: toIsoDate(r[1]),
      end_date: current ? "" : toIsoDate(r[2]),
      is_current: current,
      description: "",
    });
    if (out.length >= 15) break;
  }
  return out;
}

/** "City, Country" from a contact line split on | or • (never an email or phone). */
function locationFrom(lines: string[]): string {
  for (const line of lines.slice(0, 8)) {
    for (const part of line.split(/\s*[|•·]\s*/)) {
      const p = part.trim();
      if (!EMAIL.test(p) && !/\d/.test(p) && /^[\p{L}][\p{L} .'’-]{1,40},\s*[\p{L}][\p{L} .'’-]{1,40}$/u.test(p))
        return p;
    }
  }
  return "";
}

export function basicParseResume(text: string): ParsedResume & { experience_years_hint: number | null } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const email = text.match(EMAIL)?.[0] ?? "";
  // look for a phone number outside email addresses (digits in an address are not a phone)
  const phone = text.replace(new RegExp(EMAIL.source, "gi"), " ").match(PHONE)?.[1]?.trim() ?? "";
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
  const experiences = experiencesFrom(lines);
  const parsed = cleanParsedResume({
    full_name,
    email,
    phone,
    headline,
    summary,
    location: locationFrom(lines),
    skills: [...found].slice(0, 30),
    experiences,
    education: [],
    certifications: [],
    languages: [],
  });
  const fromDates = computeExperienceYears(parsed.experiences);
  return {
    ...parsed,
    experience_years_hint: years ? Math.min(50, Number(years[1])) : fromDates > 0 ? fromDates : null,
  };
}
