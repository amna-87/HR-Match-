import { describe, expect, it } from "vitest";
import { basicParseJob } from "@/lib/parsing/basic-job";

describe("offline job-post reader", () => {
  it("reads a typical WhatsApp post", () => {
    const j = basicParseJob(`📌 We're Hiring: Digital Marketing Executive
Company: Brightside Foods
Location: Lahore
Experience: 2+ years in Meta Ads and SEO
Full time, on-site
Interested candidates can WhatsApp their CV at +92 300 1234567`);
    expect(j.title).toBe("Digital Marketing Executive");
    expect(j.company_name).toBe("Brightside Foods");
    expect(j.location).toBe("Lahore");
    expect(j.apply_method).toBe("whatsapp");
    expect(j.apply_target).toBe("+92 300 1234567");
    expect(j.min_exp).toBe(2);
    expect(j.required_skills).toEqual(expect.arrayContaining(["meta ads", "seo"]));
    expect(j.employment_type).toBe("full_time");
    expect(j.description_summary).not.toContain("1234567");
  });

  it("prefers email, then link; detects remote and internships", () => {
    const j = basicParseJob("Acme is hiring a Remote Content Intern\nSend CV to jobs@acme.com\nhttps://acme.com/apply");
    expect(j.company_name).toBe("Acme");
    expect(j.apply_method).toBe("email");
    expect(j.apply_target).toBe("jobs@acme.com");
    expect(j.work_mode).toBe("remote");
    expect(j.employment_type).toBe("internship");
    const k = basicParseJob("Accountant\nApply here: https://careers.example.com/jobs/12.");
    expect(k).toMatchObject({ apply_method: "link", apply_target: "https://careers.example.com/jobs/12" });
  });
});
