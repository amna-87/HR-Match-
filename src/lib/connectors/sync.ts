// Feed sync (B2, D-029): fetch a company's public job board, store each job as
// a sourced job in the feed's workspace with a summary in our own words and the
// company's apply link, keep it open while it is listed, close it when it
// disappears, and skip jobs already listed elsewhere (duplicates).
import type { Queryable } from "@/lib/db";
import { basicParseJob } from "@/lib/parsing/basic-job";
import { FEED_CONNECTORS } from "./index";
import type { FeedConnector, FetchLike, NormalizedJob } from "./types";

export interface FeedRow {
  id: string;
  workspace_id: string;
  provider: FeedConnector["provider"];
  board: string;
  company_name: string;
}

export interface Summary {
  summary: string;
  skills: string[];
  minExp: number | null;
}

export interface SyncDeps {
  db: Queryable;
  fetch: FetchLike;
  /** Builds our own summary of a job (AI when available, a template otherwise). */
  summarize?(job: NormalizedJob, company: string): Promise<Summary>;
}

const EMPLOYMENT: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
  freelance: "Freelance",
};

/** Template summary in our own words: structured facts, never the posting's text. */
export async function templateSummary(job: NormalizedJob, company: string): Promise<Summary> {
  const parsed = basicParseJob(`${job.title}\n${job.text}`);
  const skills = parsed.required_skills.slice(0, 10);
  const parts = [
    `${job.title}${job.department ? ` in the ${job.department.replace(/\s+team$/i, "")} team` : ""} at ${company}${job.location ? `, ${job.location}` : ""}.`,
    `${EMPLOYMENT[job.employmentType]}${job.workMode === "remote" ? ", remote" : job.workMode === "hybrid" ? ", hybrid" : ""}.`,
    skills.length ? `Skills mentioned include ${skills.slice(0, 6).join(", ")}.` : "",
    parsed.min_exp ? `Asks for around ${parsed.min_exp}+ years of experience.` : "",
    `The full description and the application form are on ${company}'s careers page.`,
  ];
  return { summary: parts.filter(Boolean).join(" "), skills, minExp: parsed.min_exp };
}

export interface SyncResult {
  fetched: number;
  added: number;
  updated: number;
  closed: number;
  duplicates: number;
  error?: string;
}

export async function syncFeed(deps: SyncDeps, feed: FeedRow): Promise<SyncResult> {
  const res: SyncResult = { fetched: 0, added: 0, updated: 0, closed: 0, duplicates: 0 };
  const connector = FEED_CONNECTORS[feed.provider];
  const summarize = deps.summarize ?? templateSummary;
  try {
    const jobs = await connector.fetchJobs(feed.board, deps.fetch);
    res.fetched = jobs.length;
    const seen: string[] = [];
    for (const j of jobs) {
      if (!j.title || !/^https?:\/\//i.test(j.applyUrl)) continue;
      seen.push(j.externalId);
      const existing = await deps.db.query<{ id: string; status: string; title: string }>(
        "select id, status, title from public.jobs where feed_id = $1 and external_id = $2",
        [feed.id, j.externalId],
      );
      const row = existing.rows[0];
      if (row) {
        await deps.db.query(
          `update public.jobs set title = $2, location = $3, work_mode = $4, employment_type = $5,
             apply_target = $6, source_url = $7, expires_at = now() + interval '30 days', last_confirmed_at = now(),
             status = case when status in ('closed', 'expired') then 'published'::public.job_status else status end
           where id = $1`,
          [row.id, j.title, j.location, j.workMode, j.employmentType, j.applyUrl, j.postingUrl],
        );
        res.updated++;
        continue;
      }
      // Skip jobs already listed (public board or this workspace), unless they came from this feed.
      const dup = await deps.db.query<{ job_id: string }>(
        `select s.job_id from public.find_similar_jobs($1, $2, $3, '', $4) s
         join public.jobs x on x.id = s.job_id where x.feed_id is distinct from $5 limit 1`,
        [j.title, feed.company_name, j.location, feed.workspace_id, feed.id],
      );
      if (dup.rows.length) {
        res.duplicates++;
        continue;
      }
      const s = await summarize(j, feed.company_name);
      await deps.db.query(
        `insert into public.jobs(source_type, origin, owner_workspace_id, visibility, feed_id, external_id,
           source_name, source_url, source_company_name, title, description_summary, required_skills, min_exp,
           location, work_mode, employment_type, apply_method, apply_target, status, expires_at, last_confirmed_at)
         values ('sourced', 'api_feed', $1, 'workspace', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           'link', $14, 'published', now() + interval '30 days', now())`,
        [
          feed.workspace_id,
          feed.id,
          j.externalId,
          `${feed.company_name} careers page`,
          j.postingUrl,
          feed.company_name,
          j.title.slice(0, 200),
          s.summary.slice(0, 1500),
          s.skills,
          s.minExp,
          j.location,
          j.workMode,
          j.employmentType,
          j.applyUrl,
        ],
      );
      res.added++;
    }
    // Jobs no longer on the company's board are closed (takedown removals stay removed).
    const closed = await deps.db.query(
      `update public.jobs set status = 'closed'
       where feed_id = $1 and status in ('published', 'paused', 'draft') and not (external_id = any($2::text[]))`,
      [feed.id, seen],
    );
    res.closed = closed.rowCount ?? 0;
    await deps.db.query(
      `update public.job_feeds set last_run_at = now(), last_status = 'ok', last_error = null,
         job_count = (select count(*) from public.jobs where feed_id = $1 and status = 'published')
       where id = $1`,
      [feed.id],
    );
  } catch (e) {
    res.error = (e as Error).message.slice(0, 300);
    await deps.db.query(
      "update public.job_feeds set last_run_at = now(), last_status = 'error', last_error = $2 where id = $1",
      [feed.id, res.error],
    );
  }
  return res;
}

/** Daily run: every active feed not fetched in the last 20 hours (polite: once a day per board). */
export async function syncDueFeeds(deps: SyncDeps, limit = 50) {
  const feeds = await deps.db.query<FeedRow>(
    `select id, workspace_id, provider, board, company_name from public.job_feeds
     where active and (last_run_at is null or last_run_at < now() - interval '20 hours')
     order by last_run_at nulls first limit $1`,
    [limit],
  );
  const results: Record<string, SyncResult> = {};
  for (const f of feeds.rows) results[f.id] = await syncFeed(deps, f);
  return { feeds: feeds.rowCount ?? 0, results };
}
