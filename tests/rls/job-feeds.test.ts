// B2 (D-029): company career feeds. Plan cap on connected sources, protected
// fields, and the sync: new jobs added as labeled sourced jobs in the workspace
// (summary in our own words, company apply link), kept open while listed,
// closed when they disappear, duplicates of existing listings skipped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";
import { syncFeed, type FeedRow } from "../../src/lib/connectors/sync";
import type { FetchLike } from "../../src/lib/connectors/types";
import { FEED_CONNECTORS } from "../../src/lib/connectors";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb("job_feeds");
});
afterAll(async () => db?.close());

const ghJobs = (ids: number[]) => ({
  jobs: ids.map((id) => ({
    id,
    title: `Growth Marketer ${id}`,
    absolute_url: `https://boards.greenhouse.io/northwind/jobs/${id}`,
    location: { name: "Remote - EMEA" },
    departments: [{ name: "Marketing" }],
    content: "&lt;p&gt;You will run Meta Ads and SEO for our brands. 3+ years experience.&lt;/p&gt;",
  })),
});
let served: unknown = ghJobs([1, 2]);
const fakeFetch: FetchLike = async (url) => {
  expect(url).toMatch(/^https:\/\/boards-api\.greenhouse\.io\/v1\/boards\/northwind\/jobs\?content=true$/);
  return { ok: true, status: 200, json: async () => served };
};
const deps = () => ({ db: { query: (s: string, p?: unknown[]) => db.service(s, p ?? []) } as never, fetch: fakeFetch });

describe("company career feeds", () => {
  let feed: FeedRow;

  it("members add feeds up to the plan's source cap", async () => {
    await expect(
      db.as(IDS.gary)("select add_job_feed($1, 'greenhouse', 'northwind', 'Northwind')", [IDS.acme]),
    ).rejects.toThrow(/not a workspace member/);
    const id = (
      await db.as(IDS.rita)<{ id: string }>("select add_job_feed($1, 'greenhouse', 'northwind', 'Northwind') id", [
        IDS.acme,
      ])
    ).rows[0].id;
    feed = { id, workspace_id: IDS.acme, provider: "greenhouse", board: "northwind", company_name: "Northwind" };
    await db.root("update companies set source_cap = 1 where id = $1", [IDS.acme]);
    await expect(db.as(IDS.rita)("select add_job_feed($1, 'lever', 'other', 'Other')", [IDS.acme])).rejects.toThrow(
      /plan allows 1 connected/,
    );
    expect((await db.as(IDS.gary)("select count(*)::int n from job_feeds")).rows[0].n).toBe(0);
  });

  it("members can pause a feed but not forge its run results or board", async () => {
    await db.as(IDS.rita)("update job_feeds set active = false where id = $1", [feed.id]);
    await db.as(IDS.rita)("update job_feeds set active = true where id = $1", [feed.id]);
    await expect(db.as(IDS.rita)("update job_feeds set board = 'x' where id = $1", [feed.id])).rejects.toThrow(
      /protected feed fields/,
    );
    await expect(
      db.as(IDS.rita)(
        "insert into jobs(source_type, owner_workspace_id, title, apply_method, apply_target, feed_id, external_id) values ('sourced', $1, 'x', 'link', 'https://x.test', $2, '9')",
        [IDS.acme, feed.id],
      ),
    ).rejects.toThrow(/managed by Vouch/);
  });

  it("first sync adds labeled jobs with our own summary and the company's apply link", async () => {
    const r = await syncFeed(deps(), feed);
    expect(r).toMatchObject({ fetched: 2, added: 2, closed: 0 });
    const jobs = await db.as(IDS.rita)("select * from jobs where feed_id = $1 order by external_id", [feed.id]);
    expect(jobs.rows[0]).toMatchObject({
      source_type: "sourced",
      origin: "api_feed",
      visibility: "workspace",
      owner_workspace_id: IDS.acme,
      source_company_name: "Northwind",
      source_name: "Northwind careers page",
      apply_method: "link",
      apply_target: "https://boards.greenhouse.io/northwind/jobs/1",
      work_mode: "remote",
      status: "published",
    });
    expect(jobs.rows[0].description_summary).toMatch(/^Growth Marketer 1 in the Marketing team at Northwind/);
    expect(jobs.rows[0].description_summary).not.toContain("You will run");
    expect(jobs.rows[0].required_skills).toEqual(expect.arrayContaining(["meta ads", "seo"]));
    expect(
      (await db.root("select job_count, last_status from job_feeds where id = $1", [feed.id])).rows[0],
    ).toMatchObject({
      job_count: 2,
      last_status: "ok",
    });
  });

  it("re-sync keeps listed jobs open, closes missing ones, skips duplicates of existing listings", async () => {
    // the same Northwind role was already posted on the public board by hand
    await db.service(
      `insert into jobs(source_type, origin, title, source_company_name, apply_method, apply_target, status, location)
       values ('sourced', 'manual', 'Growth Marketer 3', 'Northwind', 'link', 'https://northwind.test/apply', 'published', 'Remote - EMEA')`,
    );
    served = ghJobs([2, 3]); // 1 disappeared; 3 duplicates the existing listing
    const r = await syncFeed(deps(), feed);
    expect(r).toMatchObject({ updated: 1, added: 0, closed: 1, duplicates: 1 });
    const st = await db.root("select external_id, status from jobs where feed_id = $1 order by external_id", [feed.id]);
    expect(st.rows).toEqual([
      { external_id: "1", status: "closed" },
      { external_id: "2", status: "published" },
    ]);
    // reappearing re-opens it
    served = ghJobs([1, 2]);
    await syncFeed(deps(), feed);
    expect(
      (await db.root("select status from jobs where feed_id = $1 and external_id = '1'", [feed.id])).rows[0].status,
    ).toBe("published");
  });

  it("a failing board records the error without touching jobs", async () => {
    const bad: FetchLike = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const r = await syncFeed({ ...deps(), fetch: bad }, feed);
    expect(r.error).toMatch(/Board not found/);
    expect((await db.root("select last_status from job_feeds where id = $1", [feed.id])).rows[0].last_status).toBe(
      "error",
    );
    expect(
      (await db.root("select count(*)::int n from jobs where feed_id = $1 and status = 'published'", [feed.id])).rows[0]
        .n,
    ).toBe(2);
  });
});

describe("board names", () => {
  it("accepts names or careers URLs", () => {
    expect(FEED_CONNECTORS.greenhouse.parseBoard("https://job-boards.greenhouse.io/Northwind/jobs/1")).toBe(
      "northwind",
    );
    expect(FEED_CONNECTORS.lever.parseBoard("https://jobs.lever.co/acme-co")).toBe("acme-co");
    expect(FEED_CONNECTORS.lever.parseBoard("acme")).toBe("acme");
    expect(FEED_CONNECTORS.lever.parseBoard("bad name!")).toBeNull();
  });
});

describe("admin feeds can publish publicly", () => {
  it("only admins can switch a feed to the public board; admin feeds start public", async () => {
    const f = (await db.root("select id from job_feeds limit 1")).rows[0].id;
    await expect(db.as(IDS.rita)("update job_feeds set publish_public = true where id = $1", [f])).rejects.toThrow(
      /only Vouch admins/,
    );
    await db.root("update companies set source_cap = 5 where id = $1", [IDS.acme]);
    await db.root(
      "insert into company_members(company_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing",
      [IDS.acme, IDS.admin],
    );
    const id = (
      await db.as(IDS.admin)<{ id: string }>("select add_job_feed($1, 'lever', 'adminco', 'AdminCo') id", [IDS.acme])
    ).rows[0].id;
    expect((await db.root("select publish_public from job_feeds where id = $1", [id])).rows[0].publish_public).toBe(
      true,
    );
  });
});

describe("search feeds (D-039)", () => {
  it("store a keyword search, label jobs with the source and never close jobs missing from a day's results", async () => {
    await db.root("update companies set source_cap = 10 where id = $1", [IDS.acme]);
    const id = (
      await db.as(IDS.rita)<{ id: string }>("select add_job_feed($1, 'remotive', 'marketing|', 'Remotive') id", [
        IDS.acme,
      ])
    ).rows[0].id;
    await expect(
      db.as(IDS.rita)("select add_job_feed($1, 'greenhouse', 'bad board|x', 'X')", [IDS.acme]),
    ).rejects.toThrow(/job_feeds_board_check/);
    const job = (n: number) => ({
      id: n,
      url: `https://remotive.com/remote-jobs/marketing/job-${n}`,
      title: `Zyxw Marketing Role ${n}`,
      company_name: `Company ${n}`,
      job_type: "full_time",
      candidate_required_location: "Worldwide",
      description: "<p>SEO and Meta Ads.</p>",
    });
    let served = { jobs: [job(1), job(2)] };
    const fetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => served });
    const feedRow = {
      id,
      workspace_id: IDS.acme,
      provider: "remotive" as const,
      board: "marketing|",
      company_name: "Remotive",
    };
    expect(await syncFeed({ ...deps(), fetch }, feedRow)).toMatchObject({ added: 2 });
    const rows = await db.root(
      "select source_name, source_company_name, status from jobs where feed_id = $1 order by external_id",
      [id],
    );
    expect(rows.rows[0]).toMatchObject({
      source_name: "Remotive",
      source_company_name: "Company 1",
      status: "published",
    });
    served = { jobs: [job(2)] };
    expect(await syncFeed({ ...deps(), fetch }, feedRow)).toMatchObject({ closed: 0 });
    expect(
      (await db.root("select count(*)::int n from jobs where feed_id = $1 and status = 'published'", [id])).rows[0].n,
    ).toBe(2);
  });
});
