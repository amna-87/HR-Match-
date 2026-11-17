// Offline job-post reader (used when AI parsing is unavailable). Built for the
// short posts people share on WhatsApp/LinkedIn: title, company, location, how
// to apply (email, phone, WhatsApp, link), work mode, type, years, skills.
// The result is only a pre-fill: the recruiter reviews every field.
import type { ParsedJob } from "./schemas";
import { cleanParsedJob } from "./job";
import { SKILLS } from "./basic-resume";
import { SKILL_ALIASES, normalizeSkill } from "@/lib/matching/skills";
import { stripProtectedCharacteristics } from "@/lib/matching/sanitize";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /https?:\/\/[^\s<>()"']+/i;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function field(lines: string[], names: string): string {
  const re = new RegExp(`^(?:${names})\\s*[:\\-–]\\s*(.+)$`, "i");
  for (const l of lines) {
    const m = l.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

export function basicParseJob(text: string): ParsedJob {
  const raw = text.replace(/\r/g, "");
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^[\s*•·\-–>#📌✅🔹🔸👉]+/u, "").trim())
    .filter(Boolean);
  const noEmails = raw.replace(new RegExp(EMAIL.source, "gi"), " ");
  const email = raw.match(EMAIL)?.[0] ?? "";
  const url = raw.match(URL_RE)?.[0]?.replace(/[.,;]+$/, "") ?? "";
  const phone = noEmails.replace(new RegExp(URL_RE.source, "gi"), " ").match(PHONE)?.[1]?.trim() ?? "";
  const mentionsWhatsapp = /whats\s?app|wa\.me/i.test(raw);

  // title: an explicit field, or the first short line (minus "We're hiring" style prefixes)
  let title = field(lines, "position|job title|title|role|post|vacancy");
  if (!title) {
    const first = lines.find((l) => l.length <= 90 && !EMAIL.test(l) && !URL_RE.test(l)) ?? "";
    title = first.replace(
      /^(we\s*(?:'|a)?re\s+hiring|hiring|urgent(?:ly)?\s+hiring|job\s+opening|vacancy)\s*[:!\-–]*\s*/i,
      "",
    );
  }
  title = title.replace(/[!*]+$/g, "").trim();

  let company = field(lines, "company|organi[sz]ation|employer|client");
  if (!company) company = raw.match(/^\s*([A-Z][\w&.,' -]{1,60}?)\s+is\s+(?:hiring|looking)/m)?.[1]?.trim() ?? "";
  if (!company) company = title.match(/\s+(?:at|@)\s+([A-Z][\w&.' -]{1,60})$/)?.[1]?.trim() ?? "";
  if (company && title.endsWith(company)) title = title.replace(new RegExp(`\\s+(?:at|@)\\s+${escape(company)}$`), "");

  const location = field(lines, "location|city|based in|job location");
  const lower = ` ${raw.toLowerCase().replace(/\s+/g, " ")} `;
  const work_mode = /\bremote\b|work from home|\bwfh\b/.test(lower)
    ? "remote"
    : /\bhybrid\b/.test(lower)
      ? "hybrid"
      : "onsite";
  const employment_type = /\binternship\b|\bintern\b/.test(lower)
    ? "internship"
    : /\bpart[- ]time\b/.test(lower)
      ? "part_time"
      : /\bfreelance\b/.test(lower)
        ? "freelance"
        : /\bcontract\b/.test(lower)
          ? "contract"
          : "full_time";
  const years = raw.match(/(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:years?|yrs)/i);
  const skills = new Set<string>();
  for (const s of [...SKILLS, ...Object.keys(SKILL_ALIASES)])
    if (new RegExp(`(^|[^a-z0-9+#.])${escape(s)}($|[^a-z0-9+#])`).test(lower)) skills.add(normalizeSkill(s));

  const apply_method = email ? "email" : phone ? (mentionsWhatsapp ? "whatsapp" : "phone") : url ? "link" : "unknown";
  const apply_target = email || (phone ? phone : url);
  const summary = stripProtectedCharacteristics(
    lines
      .filter((l) => l !== title && !EMAIL.test(l) && !URL_RE.test(l))
      .join("\n")
      .replace(new RegExp(PHONE.source, "g"), " "),
  )
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 1400);

  return cleanParsedJob({
    title,
    company_name: company,
    description_summary: summary,
    required_skills: [...skills].slice(0, 12),
    nice_skills: [],
    required_certifications: [],
    domains: [],
    min_exp: years ? Number(years[1]) : null,
    max_exp: null,
    location,
    work_mode,
    employment_type,
    salary_min: null,
    salary_max: null,
    salary_currency: "",
    apply_method,
    apply_target,
  } as ParsedJob);
}
