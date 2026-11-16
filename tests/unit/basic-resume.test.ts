import { describe, expect, it } from "vitest";
import { basicParseResume } from "@/lib/parsing/basic-resume";

const TEXT = `Pat Example
Senior Social Media Manager
pat.example@example.test | +44 20 7946 0958 | London
Date of birth: 01/02/1990. Married.

Summary
8+ years of experience running paid social and content strategy for consumer brands.
Skills: Facebook Ads, Google Analytics, copywriting, SEO, Excel, JavaScript-free workflows.`;

describe("basicParseResume (offline fallback)", () => {
  const r = basicParseResume(TEXT);
  it("finds contact details, name and headline", () => {
    expect(r.full_name).toBe("Pat Example");
    expect(r.headline).toBe("Senior Social Media Manager");
    expect(r.email).toBe("pat.example@example.test");
    expect(r.phone).toContain("7946");
  });
  it("maps skills through the alias table", () => {
    expect(r.skills).toEqual(expect.arrayContaining(["meta ads", "google analytics", "copywriting", "seo", "excel"]));
  });
  it("reads explicit years of experience", () => {
    expect(r.experience_years_hint).toBe(8);
  });
  it("keeps contact details out of the summary and strips protected details", () => {
    expect(r.summary).not.toContain("pat.example@example.test");
    expect(r.summary.toLowerCase()).not.toMatch(/married|date of birth/);
  });
});
