// Structured outputs for AI parsing. Note what is NOT here: age, gender,
// marital status, religion, nationality, photo — we never extract them.
import { z } from "zod";

const dateish = z.string().describe("YYYY-MM or YYYY-MM-DD, or empty string if unknown");

export const ParsedResumeSchema = z.object({
  full_name: z.string(),
  email: z.string().describe("Email address on the resume, or empty string"),
  phone: z.string().describe("Phone number on the resume, or empty string"),
  headline: z.string().describe("Short professional headline, e.g. 'Social Media Marketing Manager'"),
  summary: z.string().describe("2-4 sentence professional summary in neutral third person"),
  location: z.string().describe("City, Country if stated; else empty string"),
  skills: z.array(z.string()).describe("Distinct professional skills, lowercase, max 30"),
  experiences: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      start_date: dateish,
      end_date: dateish.describe("Empty string if current"),
      is_current: z.boolean(),
      description: z.string(),
    }),
  ),
  education: z.array(
    z.object({ institution: z.string(), degree: z.string(), field: z.string(), start_date: dateish, end_date: dateish }),
  ),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string() })),
  languages: z.array(z.string()),
});
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

export const ParsedJobSchema = z.object({
  title: z.string(),
  company_name: z.string().describe("Hiring company name if stated, else empty string"),
  description_summary: z
    .string()
    .describe("Neutral 2-5 sentence summary of the role in our own words; do not copy the posting verbatim"),
  required_skills: z.array(z.string()).describe("lowercase, max 12"),
  nice_skills: z.array(z.string()).describe("lowercase, max 12"),
  required_certifications: z.array(z.string()),
  domains: z.array(z.string()).describe("1-3 broad domains, e.g. 'marketing', 'engineering', 'finance'"),
  min_exp: z.number().nullable(),
  max_exp: z.number().nullable(),
  location: z.string().describe("City, Country or empty string"),
  work_mode: z.enum(["remote", "hybrid", "onsite"]),
  employment_type: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "freelance"]),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string().describe("ISO 4217 code or empty string"),
  apply_method: z.enum(["email", "phone", "link", "unknown"]),
  apply_target: z.string().describe("Application email/phone/URL if stated, else empty string"),
});
export type ParsedJob = z.infer<typeof ParsedJobSchema>;
