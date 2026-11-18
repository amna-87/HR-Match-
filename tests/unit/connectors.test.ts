// Feed connectors parse each provider's public job-board response into
// normalized jobs (fixtures: real Ashby and SmartRecruiters responses, trimmed;
// Workable and Recruitee in their documented formats).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FEED_CONNECTORS } from "@/lib/connectors";
import type { FetchLike } from "@/lib/connectors/types";

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/feeds/${name}.json`, "utf8"));
const serve =
  (body: unknown, calls: string[] = []): FetchLike =>
  async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => body };
  };

describe("feed connectors", () => {
  it("Ashby", async () => {
    const calls: string[] = [];
    const jobs = await FEED_CONNECTORS.ashby.fetchJobs("Ashby", serve(fixture("ashby"), calls));
    expect(calls[0]).toBe("https://api.ashbyhq.com/posting-api/job-board/Ashby");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: "Engineering Manager - EU",
      workMode: "remote",
      employmentType: "full_time",
    });
    expect(jobs[0].applyUrl).toMatch(/^https:\/\/jobs\.ashbyhq\.com\//);
    expect(FEED_CONNECTORS.ashby.parseBoard("https://jobs.ashbyhq.com/Ashby")).toBe("Ashby");
  });

  it("SmartRecruiters (paged; no description in the list)", async () => {
    const calls: string[] = [];
    const jobs = await FEED_CONNECTORS.smartrecruiters.fetchJobs(
      "BoschGroup",
      serve(fixture("smartrecruiters"), calls),
    );
    expect(calls[0]).toMatch(/companies\/BoschGroup\/postings\?limit=100&offset=0$/);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].postingUrl).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\/BoschGroup\/\d+$/);
    expect(jobs[0].location).toMatch(/, DE$/);
    expect(FEED_CONNECTORS.smartrecruiters.parseBoard("https://jobs.smartrecruiters.com/BoschGroup")).toBe(
      "BoschGroup",
    );
  });

  it("Workable", async () => {
    const jobs = await FEED_CONNECTORS.workable.fetchJobs("example", serve(fixture("workable")));
    expect(jobs[0]).toMatchObject({
      externalId: "A1B2C3D4E5",
      title: "Customer Success Manager",
      location: "Lahore, Pakistan",
      workMode: "onsite",
      applyUrl: "https://apply.workable.com/j/A1B2C3D4E5/apply",
    });
    expect(jobs[1]).toMatchObject({ workMode: "remote", employmentType: "contract" });
    expect(FEED_CONNECTORS.workable.parseBoard("https://example.workable.com/")).toBe("example");
    expect(FEED_CONNECTORS.workable.parseBoard("apply.workable.com/acme-co")).toBe("acme-co");
  });

  it("Recruitee (published offers only)", async () => {
    const calls: string[] = [];
    const jobs = await FEED_CONNECTORS.recruitee.fetchJobs("example", serve(fixture("recruitee"), calls));
    expect(calls[0]).toBe("https://example.recruitee.com/api/offers/");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: "Sales Executive", workMode: "hybrid", location: "Islamabad, Pakistan" });
    expect(jobs[0].text).toContain("Lead generation");
    expect(FEED_CONNECTORS.recruitee.parseBoard("https://example.recruitee.com/o/x")).toBe("example");
  });

  it("clear errors for missing boards and rate limits", async () => {
    const status =
      (n: number): FetchLike =>
      async () => ({ ok: false, status: n, json: async () => ({}) });
    await expect(FEED_CONNECTORS.ashby.fetchJobs("x", status(404))).rejects.toThrow(/not found on Ashby/);
    await expect(FEED_CONNECTORS.workable.fetchJobs("x", status(429))).rejects.toThrow(/slow down/);
    await expect(FEED_CONNECTORS.smartrecruiters.fetchJobs("x", status(403))).rejects.toThrow(/doesn't publish/);
  });
});
