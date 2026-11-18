// Careerjet partner search API (job aggregator; careerjet.com.pk covers
// Pakistan). Needs a free affiliate ID from careerjet.com in CAREERJET_AFFID.
// Endpoint per Careerjet's public API docs; confirm against the docs you get
// with the affiliate account before relying on it.
import { BOT_USER_AGENT, guessEmployment, guessWorkMode, htmlToText, parseSearch, type FeedConnector } from "./types";

type CjJob = {
  url: string;
  title: string;
  company?: string;
  locations?: string;
  description?: string;
  salary?: string;
  date?: string;
};

export const careerjet: FeedConnector = {
  provider: "careerjet",
  label: "Careerjet (incl. Pakistan)",
  kind: "search",
  sourceName: "Careerjet",
  requiresEnv: "CAREERJET_AFFID",
  boardHint: "Keywords and a city, e.g. accountant · Lahore",
  parseBoard: () => null,
  async fetchJobs(board, fetchImpl) {
    const affid = process.env.CAREERJET_AFFID;
    if (!affid) throw new Error("Careerjet isn't connected yet (needs a free affiliate ID).");
    const q = parseSearch(board);
    const params = new URLSearchParams({
      affid,
      keywords: q.keywords,
      location: q.location,
      locale_code: process.env.CAREERJET_LOCALE ?? "en_PK",
      pagesize: "99",
      sort: "date",
      user_ip: "0.0.0.0",
      user_agent: BOT_USER_AGENT,
      url: (process.env.NEXT_PUBLIC_APP_URL ?? "https://vouch-jobs.vercel.app").replace(/\/$/, "") + "/jobs",
    });
    const res = await fetchImpl(`https://public.api.careerjet.net/search?${params}`, {
      headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Careerjet returned ${res.status}`);
    const body = (await res.json()) as { type?: string; jobs?: CjJob[]; error?: string };
    if (body.type === "ERROR") throw new Error(`Careerjet: ${body.error ?? "error"}`);
    return (body.jobs ?? []).slice(0, 100).map((j) => ({
      externalId: j.url,
      title: htmlToText(j.title).trim(),
      company: j.company?.trim() || null,
      location: j.locations?.trim() || q.location || null,
      department: null,
      employmentType: guessEmployment(`${j.title} ${j.description ?? ""}`),
      workMode: guessWorkMode(`${j.locations ?? ""} ${j.title}`),
      applyUrl: j.url,
      postingUrl: j.url,
      text: htmlToText(j.description ?? ""),
    }));
  },
};
