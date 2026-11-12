import { z } from "zod";
import { sanitizeLine, sanitizeList, sanitizeText } from "@/lib/security/sanitize";
import { normalizeDate } from "@/lib/parsing/resume";

const line = (n: number) =>
  z
    .string()
    .max(n * 2)
    .transform((s) => sanitizeLine(s, n));
const date = z
  .string()
  .max(20)
  .transform((s) => normalizeDate(s));

export const ProfileSchema = z.object({
  full_name: line(200),
  headline: line(200),
  summary: z
    .string()
    .max(6000)
    .transform((s) => sanitizeText(s, 3000)),
  location: line(200),
  contact_email: line(320),
  contact_phone: line(50),
  skills: z
    .array(z.string())
    .max(60)
    .transform((a) => sanitizeList(a, 50, 80)),
  languages: z
    .array(z.string())
    .max(20)
    .transform((a) => sanitizeList(a, 15, 60)),
  experiences: z
    .array(
      z.object({
        title: line(200),
        company: line(200),
        start_date: date,
        end_date: date,
        is_current: z.boolean(),
        description: z
          .string()
          .max(8000)
          .transform((s) => sanitizeText(s, 3000)),
      }),
    )
    .max(30),
  education: z
    .array(z.object({ institution: line(200), degree: line(200), field: line(200), start_date: date, end_date: date }))
    .max(15),
  certifications: z.array(z.object({ name: line(200), issuer: line(200) })).max(30),
});
export type ProfileInput = z.input<typeof ProfileSchema>;
export type Profile = z.output<typeof ProfileSchema>;
