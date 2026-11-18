// Jooble partner API (job aggregator; covers Pakistan). Needs a free partner key
// from jooble.org/api/about in JOOBLE_API_KEY. Jobs link to Jooble's page for
// the job; check the partner terms you receive with the key.
import { BOT_USER_AGENT, guessEmployment, guessWorkMode, htmlToText, parseSearch, type FeedConnector } from "./types";

type JoobleJob = {
  id?: number | string;
  title: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link: string;
  company?: string;
};

export const jooble: FeedConnector = {
  provider: "jooble",
  label: "Jooble (incl. Pakistan)",
  kind: "search",
  sourceName: "Jooble",
  requiresEnv: "JOOBLE_API_KEY",
  boardHint: "Keywords and a city, e.g. accountant · Lahore",
  parseBoard: () => null,
  async fetchJobs(board, fetchImpl) {
    const key = process.env.JOOBLE_API_KEY;
    if (!key) throw new Error("Jooble isn't connected yet (needs a free partner key).");
    const q = parseSearch(board);
    const res = await fetchImpl(`https://jooble.org/api/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "User-Agent": BOT_USER_AGENT, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ keywords: q.keywords, location: q.location, page: "1" }),
    });
    if (res.status === 403 || res.status === 401) throw new Error("Jooble rejected the key. Check JOOBLE_API_KEY.");
    if (!res.ok) throw new Error(`Jooble returned ${res.status}`);
    const body = (await res.json()) as { jobs?: JoobleJob[] };
    return (body.jobs ?? []).slice(0, 100).map((j) => ({
      externalId: String(j.id ?? j.link),
      title: htmlToText(j.title).trim(),
      company: j.company?.trim() || null,
      location: j.location?.trim() || q.location || null,
      department: null,
      employmentType: guessEmployment(j.type ?? ""),
      workMode: guessWorkMode(`${j.location ?? ""} ${j.title}`),
      applyUrl: j.link,
      postingUrl: j.link,
      text: htmlToText(j.snippet ?? ""),
    }));
  },
};
