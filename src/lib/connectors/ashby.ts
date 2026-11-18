// Ashby public Job Postings API (no key; documented for job boards).
// https://developers.ashbyhq.com/docs/public-job-posting-api
import { BOT_USER_AGENT, guessEmployment, guessWorkMode, htmlToText, type FeedConnector } from "./types";

type AshbyJob = {
  id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location?: string | null;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string | null;
  jobUrl: string;
  applyUrl?: string | null;
  descriptionPlain?: string | null;
  descriptionHtml?: string | null;
};

export const ashby: FeedConnector = {
  provider: "ashby",
  label: "Ashby",
  boardHint: "The name in jobs.ashbyhq.com/<name>",
  parseBoard(input) {
    const s = input.trim();
    const m = s.match(/ashbyhq\.com\/([A-Za-z0-9._-]+)/i);
    const board = m ? m[1] : s;
    return /^[A-Za-z0-9._-]{1,100}$/.test(board) ? board : null;
  },
  async fetchJobs(board, fetchImpl) {
    const res = await fetchImpl(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`, {
      headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 404) throw new Error("Job board not found on Ashby. Check the name.");
    if (!res.ok) throw new Error(`Ashby returned ${res.status}`);
    const body = (await res.json()) as { jobs?: AshbyJob[] };
    return (body.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .slice(0, 500)
      .map((j) => ({
        externalId: j.id,
        title: j.title.trim(),
        location: j.location?.trim() || null,
        department: j.team ?? j.department ?? null,
        employmentType: guessEmployment(j.employmentType ?? ""),
        workMode:
          j.isRemote || /remote/i.test(j.workplaceType ?? "")
            ? "remote"
            : /hybrid/i.test(j.workplaceType ?? "")
              ? "hybrid"
              : guessWorkMode(j.location ?? ""),
        applyUrl: j.applyUrl || j.jobUrl,
        postingUrl: j.jobUrl,
        text: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
      }));
  },
};
