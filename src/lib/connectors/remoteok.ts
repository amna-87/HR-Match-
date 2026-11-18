// Remote OK public API. Terms (first item of the response): link back to the
// Remote OK URL with a normal (followed) link and name "Remote OK" as the
// source; don't use their logo. https://remoteok.com/api
import { BOT_USER_AGENT, htmlToText, matchesSearch, parseSearch, type FeedConnector } from "./types";

type RemoteOkJob = {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  tags?: string[];
  description?: string;
  url?: string;
  apply_url?: string;
};

export const remoteok: FeedConnector = {
  provider: "remoteok",
  label: "Remote OK (remote jobs)",
  kind: "search",
  sourceName: "Remote OK",
  boardHint: "Keywords, e.g. marketing",
  parseBoard: () => null,
  async fetchJobs(board, fetchImpl) {
    const q = parseSearch(board);
    const tag = q.keywords.toLowerCase().split(/[\s,]+/)[0] ?? "";
    const res = await fetchImpl(`https://remoteok.com/api${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`, {
      headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Remote OK returned ${res.status}`);
    const body = (await res.json()) as RemoteOkJob[];
    return (Array.isArray(body) ? body : [])
      .filter((j) => j.id && j.position && j.url) // the first item is the legal notice
      .filter((j) =>
        matchesSearch(`${j.position} ${(j.tags ?? []).join(" ")}`, j.location ?? "", {
          keywords: q.keywords,
          location: q.location,
        }),
      )
      .slice(0, 100)
      .map((j) => ({
        externalId: String(j.id),
        title: j.position!.trim(),
        company: j.company?.trim() || null,
        location: j.location ? `Remote (${j.location})`.slice(0, 200) : "Remote",
        department: null,
        employmentType: "full_time" as const,
        workMode: "remote" as const,
        applyUrl: j.url!,
        postingUrl: j.url!,
        text: `${(j.tags ?? []).join(", ")}\n${htmlToText(j.description ?? "")}`,
      }));
  },
};
