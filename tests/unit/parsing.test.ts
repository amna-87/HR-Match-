import { describe, expect, it } from "vitest";
import { extractResumeText, validateResumeFile } from "@/lib/parsing/extract-text";
import { cleanParsedResume, computeExperienceYears, normalizeDate } from "@/lib/parsing/resume";
import { cleanParsedJob } from "@/lib/parsing/job";
import { sanitizeText, safeHttpUrl, sanitizeList } from "@/lib/security/sanitize";
import { ParsedResumeSchema } from "@/lib/parsing/schemas";
import { minimalPdf } from "../fixtures/minimal-pdf";

describe("upload validation", () => {
  it("accepts real PDFs and rejects disguised files", () => {
    const pdf = minimalPdf(["hello"]);
    expect(validateResumeFile("cv.pdf", pdf)).toMatchObject({ ok: true, kind: "pdf" });
    expect(validateResumeFile("cv.pdf", new TextEncoder().encode("<script>alert(1)</script>")).ok).toBe(false);
    expect(validateResumeFile("cv.exe", pdf).ok).toBe(false);
    expect(validateResumeFile("cv.docx", pdf).ok).toBe(false);
    expect(validateResumeFile("cv.pdf", new Uint8Array()).ok).toBe(false);
  });

  it("rejects files over 5 MB", () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set([0x25, 0x50, 0x44, 0x46]);
    expect(validateResumeFile("cv.pdf", big)).toEqual({ ok: false, error: "The file is larger than 5 MB." });
  });

  it("extracts text from a PDF without executing anything", async () => {
    const text = await extractResumeText("pdf", minimalPdf(["Maya Chen", "Social Media Marketing Manager"]));
    expect(text).toContain("Social Media Marketing Manager");
  });
});

describe("parsed resume cleanup", () => {
  it("has no fields for protected characteristics", () => {
    const keys = Object.keys(ParsedResumeSchema.shape);
    for (const banned of ["age", "gender", "marital_status", "religion", "nationality", "photo", "date_of_birth"]) {
      expect(keys).not.toContain(banned);
    }
  });

  it("strips protected details that slip into free text", () => {
    const r = cleanParsedResume({
      full_name: "Maya Chen",
      email: "maya@example.test",
      phone: "",
      headline: "Marketer",
      summary: "Married mother of two, aged 34. Social media marketer.",
      location: "London, UK",
      skills: ["Meta Ads", "meta ads", " SEO "],
      experiences: [{ title: "Lead", company: "Acme", start_date: "2019-3", end_date: "", is_current: true, description: "Gender: female\nRan campaigns." }],
      education: [],
      certifications: [],
      languages: [],
    });
    expect(r.summary).not.toMatch(/married|34/i);
    expect(r.experiences[0].description).not.toMatch(/female/i);
    expect(r.experiences[0].start_date).toBe("2019-03-01");
    expect(r.skills).toEqual(["meta ads", "seo"]);
  });

  it("computes experience years merging overlaps", () => {
    const now = new Date("2026-01-01");
    expect(
      computeExperienceYears(
        [
          { start_date: "2020-01-01", end_date: "2022-01-01" },
          { start_date: "2021-01-01", end_date: "2023-01-01" },
          { start_date: "2024-01-01", is_current: true },
        ],
        now,
      ),
    ).toBeCloseTo(5, 0);
    expect(computeExperienceYears([], now)).toBe(0);
  });

  it("normalizes dates", () => {
    expect(normalizeDate("2021")).toBe("2021-01-01");
    expect(normalizeDate("present")).toBe("");
    expect(normalizeDate("1800-01")).toBe("");
  });
});

describe("pasted job cleanup", () => {
  it("sanitizes pasted text and model output", () => {
    const j = cleanParsedJob({
      title: "<b>Social Media Manager</b>",
      company_name: "Acme",
      description_summary: "Run campaigns.<script>alert(1)</script>",
      required_skills: ["Meta Ads"],
      nice_skills: [],
      required_certifications: [],
      domains: ["Marketing"],
      min_exp: -3,
      max_exp: null,
      location: "London",
      work_mode: "remote",
      employment_type: "full_time",
      salary_min: null,
      salary_max: null,
      salary_currency: "pounds",
      apply_method: "link",
      apply_target: "javascript:alert(1)",
    });
    expect(j.title).toBe("Social Media Manager");
    expect(j.description_summary).not.toContain("script");
    expect(j.min_exp).toBeNull();
    expect(j.salary_currency).toBe("");
    expect(j.apply_target).toBe("");
    expect(j.domains).toEqual(["marketing"]);
  });

  it("sanitize helpers", () => {
    expect(sanitizeText("a\u0000b<img src=x onerror=alert(1)>c")).toBe("ab c");
    expect(safeHttpUrl("ftp://x")).toBeNull();
    expect(safeHttpUrl("https://jobs.example.test/a")).toBe("https://jobs.example.test/a");
    expect(sanitizeList("a, b, A")).toEqual(["a", "b"]);
  });
});
