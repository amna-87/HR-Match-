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

describe("basic reader: work history and location", () => {
  it("reads dated job lines and a City, Country contact segment", () => {
    const r = basicParseResume(
      [
        "Ayesha Khan",
        "Digital Marketing Lead",
        "ayesha@example.test | +92 300 1234567 | Lahore, Pakistan",
        "Experience",
        "Digital Marketing Lead at Brightside (Jan 2021 - Present)",
        "Social Media Executive | Foodco | 2017 – 2020",
        "Skills: Meta Ads, SEO",
      ].join("\n"),
    );
    expect(r.location).toBe("Lahore, Pakistan");
    expect(r.experiences).toHaveLength(2);
    expect(r.experiences[0]).toMatchObject({
      title: "Digital Marketing Lead",
      company: "Brightside",
      is_current: true,
    });
    expect(r.experiences[0].start_date).toBe("2021-01-01");
    expect(r.experiences[1]).toMatchObject({ title: "Social Media Executive", company: "Foodco", is_current: false });
    expect(r.experience_years_hint).toBeGreaterThan(5);
  });
});

it("never reads digits inside an email address as a phone number", () => {
  const r = basicParseResume(
    "Omar Butt\nAccountant\nomar1794952386814@example.test | Karachi, Pakistan\nSkills: payroll",
  );
  expect(r.phone).toBe("");
});
