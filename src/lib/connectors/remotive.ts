// Remotive public API (remote jobs). Terms in every response: link back to the
// Remotive URL and name Remotive as the source; fetch at most a few times a day;
// do NOT pass Remotive jobs on to Google Jobs (so no JobPosting data for them);
// don't make people sign up to see a listing. https://remotive.com/api/remote-jobs
import { BOT_USER_AGENT, guessEmployment, htmlToText, parseSearch, type FeedConnector } from "./types";

type RemotiveJob = {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  job_type?: string;
  candidate_required_location?: string;
  description?: string;
  tags?: string[];
};

export const remotive: FeedConnector = {
  provider: "remotive",
  label: "Remotive (remote jobs)",
  kind: "search",
  sourceName: "Remotive",
  boardHint: "Keywords, e.g. marketing",
  parseBoard: () => null,
  async fetchJobs(board, fetchImpl) {
    const q = parseSearch(board);
    const url = `https://remotive.com/api/remote-jobs?limit=100${q.keywords ? `&search=${encodeURIComponent(q.keywords)}` : ""}`;
    const res = await fetchImpl(url, { headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" } });
    if (!res.ok) throw new Error(`Remotive returned ${res.status}`);
    const body = (await res.json()) as { jobs?: RemotiveJob[] };
    return (body.jobs ?? [])
      .filter(
        (j) =>
          !q.location ||
          (j.candidate_required_location ?? "").toLowerCase().includes(q.location.toLowerCase()) ||
          /worldwide|anywhere/i.test(j.candidate_required_location ?? ""),
      )
      .slice(0, 100)
      .map((j) => ({
        externalId: String(j.id),
        title: j.title.trim(),
        company: j.company_name?.trim() || null,
        location: j.candidate_required_location ? `Remote (${j.candidate_required_location})`.slice(0, 200) : "Remote",
        department: j.category ?? null,
        employmentType: guessEmployment((j.job_type ?? "").replace(/_/g, " ")),
        workMode: "remote" as const,
        applyUrl: j.url,
        postingUrl: j.url,
        text: `${(j.tags ?? []).join(", ")}\n${htmlToText(j.description ?? "")}`,
      }));
  },
};
