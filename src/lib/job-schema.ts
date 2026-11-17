import { z } from "zod";
import { safeHttpUrl, sanitizeLine, sanitizeList, sanitizeText } from "@/lib/security/sanitize";

const optNum = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === "" || v == null ? null : Number(v)))
  .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Must be a positive number");

export const JobFormSchema = z
  .object({
    title: z
      .string()
      .transform((s) => sanitizeLine(s, 200))
      .pipe(z.string().min(2, "Title is required")),
    description_summary: z.string().transform((s) => sanitizeText(s, 5000)),
    required_skills: z.array(z.string()).transform((a) => sanitizeList(a, 20, 80).map((s) => s.toLowerCase())),
    nice_skills: z.array(z.string()).transform((a) => sanitizeList(a, 20, 80).map((s) => s.toLowerCase())),
    required_certifications: z.array(z.string()).transform((a) => sanitizeList(a, 10, 120)),
    domains: z.array(z.string()).transform((a) => sanitizeList(a, 5, 60).map((s) => s.toLowerCase())),
    min_exp: optNum,
    max_exp: optNum,
    location: z.string().transform((s) => sanitizeLine(s, 200) || null),
    work_mode: z.enum(["remote", "hybrid", "onsite"]),
    employment_type: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "freelance"]),
    salary_min: optNum,
    salary_max: optNum,
    salary_currency: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .transform((s) => (/^[A-Z]{3}$/.test(s) ? s : null)),
    expires_at: z
      .string()
      .transform((s) => (s ? new Date(s).toISOString() : null))
      .nullable(),
    // sourced-only
    source_name: z
      .string()
      .optional()
      .transform((s) => (s ? sanitizeLine(s, 200) : null)),
    source_url: z
      .string()
      .optional()
      .transform((s) => safeHttpUrl(s)),
    source_company_name: z
      .string()
      .optional()
      .transform((s) => (s ? sanitizeLine(s, 200) : null)),
    apply_method: z.enum(["platform", "email", "phone", "link", "whatsapp"]).default("platform"),
    apply_target: z
      .string()
      .optional()
      .transform((s) => (s ? sanitizeLine(s, 500) : null)),
    apply_instructions: z
      .string()
      .optional()
      .transform((s) => (s ? sanitizeText(s, 2000) || null : null)),
  })
  .refine((j) => j.min_exp == null || j.max_exp == null || j.min_exp <= j.max_exp, "Min experience is above max")
  .refine(
    (j) => j.salary_min == null || j.salary_max == null || j.salary_min <= j.salary_max,
    "Min salary is above max",
  );

export type JobFormInput = z.input<typeof JobFormSchema>;
export type JobForm = z.output<typeof JobFormSchema>;

export const OFF_PLATFORM_METHODS = ["link", "email", "phone", "whatsapp"] as const;

/**
 * Jobs from other sources (addendum 4): only a title and ONE way to apply are
 * required. Company and source are optional ("Hiring directly" / "Source: not
 * specified").
 */
export const SourcedJobSchema = JobFormSchema.refine(
  (j) => (OFF_PLATFORM_METHODS as readonly string[]).includes(j.apply_method),
  "Choose how people apply: link, email, phone or WhatsApp",
)
  .refine((j) => !!j.apply_target, "Add the apply link, email or number")
  .refine((j) => j.apply_method !== "link" || !!safeHttpUrl(j.apply_target), "Apply link must be a valid URL")
  .refine(
    (j) => j.apply_method !== "email" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(j.apply_target ?? ""),
    "Enter a valid email address",
  )
  .refine(
    (j) => !["phone", "whatsapp"].includes(j.apply_method) || (j.apply_target ?? "").replace(/\D/g, "").length >= 7,
    "Enter a valid phone number, with country code for WhatsApp",
  );
