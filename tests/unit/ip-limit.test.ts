import { describe, expect, it } from "vitest";
import { ipAllowed, rateLimitClass } from "@/lib/security/ip-limit";
import { jobPath, parseJobParam, slugify } from "@/lib/slug";
import { categoryOf, landingCounts } from "@/lib/jobs/categories";

describe("public pages", () => {
  it("rate limits per IP per minute", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(ipAllowed("page:1.2.3.4", 3, t)).toBe(true);
    expect(ipAllowed("page:1.2.3.4", 3, t)).toBe(false);
    expect(ipAllowed("page:5.6.7.8", 3, t)).toBe(true);
    expect(ipAllowed("page:1.2.3.4", 3, t + 61_000)).toBe(true);
    expect(rateLimitClass("/jobs/sales-lahore-1001")).toBe("page");
    expect(rateLimitClass("/api/pool/process")).toBe("api");
    expect(rateLimitClass("/recruiter")).toBeNull();
  });

  it("builds readable job URLs and parses them back", () => {
    expect(slugify("Social Media Marketer (Meta Ads)!")).toBe("social-media-marketer-meta-ads");
    const path = jobPath({ title: "Social Media Marketer", location: "Lahore, Pakistan", public_number: 4821 });
    expect(path).toBe("/jobs/social-media-marketer-lahore-4821");
    expect(parseJobParam("social-media-marketer-lahore-4821")).toEqual({ kind: "number", n: 4821 });
    expect(parseJobParam("00000000-0000-4000-8000-00000000f001").kind).toBe("uuid");
    expect(parseJobParam("marketing")).toEqual({ kind: "slug", slug: "marketing" });
    expect(jobPath({ title: "Remote Dev", location: "Remote", public_number: 1002 })).toBe(
      "/jobs/remote-dev-remote-1002",
    );
  });

  it("only makes landing pages with enough jobs", () => {
    expect(categoryOf({ title: "Digital Marketing Executive" })).toBe("marketing");
    expect(categoryOf({ title: "Accounts Officer" })).toBe("finance");
    const jobs = [
      ...Array.from({ length: 3 }, () => ({ title: "SEO Specialist", domains: [], location: "Karachi, Pakistan" })),
      { title: "Accountant", domains: [], location: "Lahore" },
    ];
    const c = landingCounts(jobs);
    expect(c.categories.map((x) => x.slug)).toEqual(["marketing"]);
    expect(c.cities.map((x) => x.slug)).toEqual(["karachi"]);
    expect(c.combos.map((x) => x.path)).toEqual(["marketing/karachi"]);
  });
});
