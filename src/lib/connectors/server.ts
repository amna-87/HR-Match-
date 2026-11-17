import "server-only";
import { getPool } from "@/lib/db";
import { parseJobText } from "@/lib/parsing/job";
import { templateSummary, type Summary, type SyncDeps } from "./sync";
import type { FetchLike, NormalizedJob } from "./types";

/** AI summary in our own words when Claude is configured; otherwise the template. */
async function summarize(job: NormalizedJob, company: string): Promise<Summary> {
  if (!process.env.ANTHROPIC_API_KEY) return templateSummary(job, company);
  try {
    const p = await parseJobText(`${job.title} at ${company}\n${job.text}`.slice(0, 20000));
    const fallback = await templateSummary(job, company);
    return {
      summary: p.description_summary || fallback.summary,
      skills: p.required_skills.length ? p.required_skills : fallback.skills,
      minExp: p.min_exp ?? fallback.minExp,
    };
  } catch {
    return templateSummary(job, company);
  }
}

const politeFetch: FetchLike = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(20_000), cache: "no-store" }) as ReturnType<FetchLike>;

export function feedDeps(): SyncDeps {
  return { db: getPool(), fetch: politeFetch, summarize };
}
