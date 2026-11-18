// Recruitee Careers Site API: "does not require authorization and is available
// under your Careers Site address". https://<company>.recruitee.com/api/offers/
import { BOT_USER_AGENT, guessEmployment, guessWorkMode, htmlToText, type FeedConnector } from "./types";

type Offer = {
  id: number;
  slug?: string;
  title: string;
  status?: string;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  remote?: boolean;
  hybrid?: boolean;
  employment_type_code?: string | null;
  department?: string | null;
  careers_url: string;
  careers_apply_url?: string | null;
  description?: string | null;
  requirements?: string | null;
};

export const recruitee: FeedConnector = {
  provider: "recruitee",
  label: "Recruitee",
  boardHint: "The name in <name>.recruitee.com",
  parseBoard(input) {
    const s = input.trim();
    const m = s.match(/^(?:https?:\/\/)?([A-Za-z0-9-]+)\.recruitee\.com/i);
    const board = m ? m[1] : s;
    return /^[a-z0-9-]{1,63}$/i.test(board) ? board.toLowerCase() : null;
  },
  async fetchJobs(board, fetchImpl) {
    const res = await fetchImpl(`https://${board}.recruitee.com/api/offers/`, {
      headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 404) throw new Error("Careers site not found on Recruitee. Check the name.");
    if (!res.ok) throw new Error(`Recruitee returned ${res.status}`);
    const body = (await res.json()) as { offers?: Offer[] };
    return (body.offers ?? [])
      .filter((o) => !o.status || o.status === "published")
      .slice(0, 500)
      .map((o) => {
        const location = o.location?.trim() || [o.city, o.country].filter(Boolean).join(", ") || null;
        return {
          externalId: String(o.id),
          title: o.title.trim(),
          location,
          department: o.department ?? null,
          employmentType: guessEmployment((o.employment_type_code ?? "").replace(/_/g, " ")),
          workMode: o.remote ? "remote" : o.hybrid ? "hybrid" : guessWorkMode(location ?? ""),
          applyUrl: o.careers_apply_url ?? o.careers_url,
          postingUrl: o.careers_url,
          text: htmlToText(`${o.description ?? ""}\n${o.requirements ?? ""}`),
        };
      });
  },
};
