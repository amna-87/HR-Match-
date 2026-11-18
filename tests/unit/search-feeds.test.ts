// D-039: search feeds from free job APIs. Fixtures are real (trimmed) responses
// from Remotive, Remote OK and Arbeitnow; Jooble and Careerjet use their
// documented formats and only run with partner keys.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FEED_CONNECTORS, availableSearchFeeds } from "@/lib/connectors";
import { parseSearch, searchBoard, type FetchLike } from "@/lib/connectors/types";
import { allowsJobStructuredData, outboundRel, sourceLabel } from "@/lib/jobs/source-rules";

const fixture = (n: string) => JSON.parse(readFileSync(`tests/fixtures/feeds/${n}.json`, "utf8"));
const serve =
  (body: unknown, calls: { url: string; init?: unknown }[] = []): FetchLike =>
  async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => body };
  };

afterEach(() => {
  delete process.env.JOOBLE_API_KEY;
  delete process.env.CAREERJET_AFFID;
});

describe("search feeds", () => {
  it("store keywords and location in one field", () => {
    expect(searchBoard(" accountant ", "Lahore")).toBe("accountant|Lahore");
    expect(parseSearch("accountant|Lahore")).toEqual({ keywords: "accountant", location: "Lahore" });
    expect(searchBoard("a|b", "")).toBe("a b|");
    expect(searchBoard("", "")).toBeNull();
  });

  it("Remotive: searches by keyword, remote jobs with company and link back", async () => {
    const calls: { url: string }[] = [];
    const jobs = await FEED_CONNECTORS.remotive.fetchJobs("marketing|", serve(fixture("remotive"), calls));
    expect(calls[0].url).toBe("https://remotive.com/api/remote-jobs?limit=100&search=marketing");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ workMode: "remote", company: "Mitre Media" });
    expect(jobs[0].applyUrl).toMatch(/^https:\/\/remotive\.com\//);
  });

  it("Remote OK: skips the legal notice item and filters by keyword", async () => {
    const all = await FEED_CONNECTORS.remoteok.fetchJobs("|", serve(fixture("remoteok")));
    expect(all.map((j) => j.title)).toEqual(["Global Partnerships BD Lead", "Scaled Account Manager EMEA"]);
    const some = await FEED_CONNECTORS.remoteok.fetchJobs("partnerships|", serve(fixture("remoteok")));
    expect(some).toHaveLength(1);
  });

  it("Arbeitnow: filters by keyword and place", async () => {
    const acc = await FEED_CONNECTORS.arbeitnow.fetchJobs("accountant|", serve(fixture("arbeitnow")));
    expect(acc.map((j) => j.title)).toEqual(expect.arrayContaining([expect.stringMatching(/Accountant/)]));
    const cologne = await FEED_CONNECTORS.arbeitnow.fetchJobs("|Cologne", serve(fixture("arbeitnow")));
    expect(cologne.every((j) => j.location === "Cologne")).toBe(true);
  });

  it("Jooble and Careerjet need partner keys and are hidden until set", async () => {
    expect(availableSearchFeeds().map((c) => c.provider)).toEqual(["remotive", "remoteok", "arbeitnow"]);
    await expect(FEED_CONNECTORS.jooble.fetchJobs("x|", serve({}))).rejects.toThrow(/partner key/);
    process.env.JOOBLE_API_KEY = "k";
    const calls: { url: string; init?: unknown }[] = [];
    const jobs = await FEED_CONNECTORS.jooble.fetchJobs(
      "accountant|Lahore",
      serve(
        {
          jobs: [
            {
              id: 7,
              title: "<b>Accountant</b>",
              company: "ABC",
              location: "Lahore",
              link: "https://jooble.org/desc/7",
              snippet: "IFRS",
            },
          ],
        },
        calls,
      ),
    );
    expect(calls[0].url).toBe("https://jooble.org/api/k");
    expect(JSON.parse((calls[0].init as { body: string }).body)).toMatchObject({
      keywords: "accountant",
      location: "Lahore",
    });
    expect(jobs[0]).toMatchObject({ title: "Accountant", company: "ABC", applyUrl: "https://jooble.org/desc/7" });
    process.env.CAREERJET_AFFID = "aff";
    expect(availableSearchFeeds().map((c) => c.provider)).toContain("careerjet");
    const cj = await FEED_CONNECTORS.careerjet.fetchJobs(
      "sales|Karachi",
      serve({
        type: "JOBS",
        jobs: [{ url: "https://www.careerjet.com.pk/x", title: "Sales Officer", company: "XYZ", locations: "Karachi" }],
      }),
    );
    expect(cj[0]).toMatchObject({ title: "Sales Officer", location: "Karachi" });
  });

  it("labels, link rules and Google Jobs rules from the providers' terms", () => {
    const remotiveJob = { source_type: "sourced" as const, origin: "api_feed", source_name: "Remotive" };
    expect(sourceLabel(remotiveJob)).toBe("Sourced from Remotive");
    expect(allowsJobStructuredData(remotiveJob)).toBe(false);
    const board = { source_type: "sourced" as const, origin: "api_feed", source_name: "GitLab careers page" };
    expect(sourceLabel(board)).toBe("From GitLab careers page");
    expect(allowsJobStructuredData(board)).toBe(true);
    expect(outboundRel("Remote OK")).not.toContain("nofollow");
    expect(outboundRel("Remotive")).toContain("nofollow");
  });
});
