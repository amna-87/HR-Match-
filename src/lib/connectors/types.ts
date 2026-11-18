// Job-source connectors (addendum 4, D-029). Each feed connector turns one
// company's public job board into normalized jobs. Adding a provider means one
// new file implementing FeedConnector and one line in the registry.

export interface NormalizedJob {
  externalId: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: "full_time" | "part_time" | "contract" | "internship" | "temporary" | "freelance";
  workMode: "remote" | "hybrid" | "onsite";
  /** The company's own page for the job / its apply form (Vouch never applies for anyone). */
  applyUrl: string;
  postingUrl: string;
  /** Plain-text description: used only to build our own summary and skills, never stored verbatim. */
  text: string;
  /** Search feeds: the hiring company (board feeds use the feed's company name). */
  company?: string | null;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface FeedConnector {
  provider:
    | "greenhouse"
    | "lever"
    | "ashby"
    | "workable"
    | "smartrecruiters"
    | "recruitee"
    | "remotive"
    | "arbeitnow"
    | "remoteok"
    | "jooble"
    | "careerjet";
  /** board: one company's job board; search: an aggregator searched by keywords + location. */
  kind?: "board" | "search";
  /** Search feeds: the source name shown on jobs ("Sourced from Remotive"). */
  sourceName?: string;
  /** Server env var the connector needs (search feeds that require a partner key). */
  requiresEnv?: string;
  label: string;
  /** How a recruiter finds the board name, shown in the UI. */
  boardHint: string;
  /** Accepts a board name or a careers URL and returns the board name, or null. */
  parseBoard(input: string): string | null;
  fetchJobs(board: string, fetchImpl: FetchLike): Promise<NormalizedJob[]>;
}

export const BOT_USER_AGENT = `VouchJobsBot/1.0 (+${(process.env.NEXT_PUBLIC_APP_URL ?? "https://vouch-jobs.vercel.app").replace(/\/$/, "")}/for-recruiters#feeds)`;

export function htmlToText(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<(br|\/p|\/li|\/h\d|\/div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function guessEmployment(s: string): NormalizedJob["employmentType"] {
  const t = s.toLowerCase();
  if (/intern/.test(t)) return "internship";
  if (/part[- ]?time/.test(t)) return "part_time";
  if (/contract|contractor/.test(t)) return "contract";
  if (/temp/.test(t)) return "temporary";
  if (/freelance/.test(t)) return "freelance";
  return "full_time";
}

export function guessWorkMode(s: string): NormalizedJob["workMode"] {
  const t = s.toLowerCase();
  if (/remote/.test(t)) return "remote";
  if (/hybrid/.test(t)) return "hybrid";
  return "onsite";
}

/** Search feeds store "keywords|location" in job_feeds.board. */
export function parseSearch(board: string): { keywords: string; location: string } {
  const [keywords = "", location = ""] = board.split("|");
  return { keywords: keywords.trim(), location: location.trim() };
}

export function searchBoard(keywords: string, location: string): string | null {
  const clean = (s: string) =>
    s
      .replace(/[|\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  const k = clean(keywords);
  const l = clean(location);
  return k || l ? `${k}|${l}` : null;
}

/** Simple relevance filter for feeds without server-side search. */
export function matchesSearch(text: string, location: string | null, q: { keywords: string; location: string }) {
  const t = text.toLowerCase();
  const words = q.keywords
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 1);
  const kwOk = !words.length || words.some((w) => t.includes(w));
  const locOk = !q.location || (location ?? "").toLowerCase().includes(q.location.toLowerCase());
  return kwOk && locOk;
}
