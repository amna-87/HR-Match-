// Lever Postings API: public, read-only, "designed to help you create a job
// site" (GET needs no key). https://github.com/lever/postings-api
import { BOT_USER_AGENT, guessEmployment, guessWorkMode, type FeedConnector } from "./types";

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  categories?: { location?: string; commitment?: string; team?: string; department?: string };
  workplaceType?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text: string; content: string }[];
};

export const lever: FeedConnector = {
  provider: "lever",
  label: "Lever",
  boardHint: "The name in jobs.lever.co/<name>",
  parseBoard(input) {
    const s = input.trim();
    const m = s.match(/lever\.co\/([A-Za-z0-9._-]+)/i);
    const board = m ? m[1] : s;
    return /^[A-Za-z0-9._-]{1,100}$/.test(board) ? board.toLowerCase() : null;
  },
  async fetchJobs(board, fetchImpl) {
    const res = await fetchImpl(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`, {
      headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 404) throw new Error("Company not found on Lever. Check the name.");
    if (!res.ok) throw new Error(`Lever returned ${res.status}`);
    const body = (await res.json()) as LeverPosting[];
    return (Array.isArray(body) ? body : []).slice(0, 500).map((p) => {
      const c = p.categories ?? {};
      const lists = (p.lists ?? []).map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, " ")}`).join("\n");
      return {
        externalId: p.id,
        title: p.text.trim(),
        location: c.location?.trim() || null,
        department: c.team ?? c.department ?? null,
        employmentType: guessEmployment(c.commitment ?? ""),
        workMode:
          p.workplaceType === "remote"
            ? "remote"
            : p.workplaceType === "hybrid"
              ? "hybrid"
              : guessWorkMode(c.location ?? ""),
        applyUrl: p.applyUrl ?? p.hostedUrl,
        postingUrl: p.hostedUrl,
        text: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n"),
      };
    });
  },
};
