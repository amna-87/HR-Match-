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
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface FeedConnector {
  provider: "greenhouse" | "lever";
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
