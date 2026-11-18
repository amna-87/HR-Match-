// Arbeitnow free job board API (mostly Germany / Europe). Terms in the response:
// "free public API, please do not abuse; linking back appreciated".
// https://www.arbeitnow.com/api/job-board-api
import { BOT_USER_AGENT, guessEmployment, htmlToText, matchesSearch, parseSearch, type FeedConnector } from "./types";

type ArbeitnowJob = {
  slug: string;
  company_name?: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
};

export const arbeitnow: FeedConnector = {
  provider: "arbeitnow",
  label: "Arbeitnow (Europe)",
  kind: "search",
  sourceName: "Arbeitnow",
  boardHint: "Keywords, e.g. marketing",
  parseBoard: () => null,
  async fetchJobs(board, fetchImpl) {
    const q = parseSearch(board);
    const out: ArbeitnowJob[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetchImpl(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, {
        headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Arbeitnow returned ${res.status}`);
      const body = (await res.json()) as { data?: ArbeitnowJob[]; links?: { next?: string | null } };
      out.push(...(body.data ?? []));
      if (!body.links?.next) break;
    }
    return out
      .filter((j) => matchesSearch(`${j.title} ${(j.tags ?? []).join(" ")}`, j.location ?? "", q))
      .slice(0, 100)
      .map((j) => ({
        externalId: j.slug,
        title: j.title.trim(),
        company: j.company_name?.trim() || null,
        location: j.location?.trim() || null,
        department: (j.tags ?? [])[0] ?? null,
        employmentType: guessEmployment((j.job_types ?? []).join(" ")),
        workMode: j.remote ? ("remote" as const) : ("onsite" as const),
        applyUrl: j.url,
        postingUrl: j.url,
        text: htmlToText(j.description ?? ""),
      }));
  },
};
