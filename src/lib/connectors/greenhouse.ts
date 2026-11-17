// Greenhouse Job Board API: public, read-only, intended for building career
// sites (GET needs no key). https://developers.greenhouse.io/job-board.html
import { BOT_USER_AGENT, guessEmployment, guessWorkMode, htmlToText, type FeedConnector } from "./types";

type GhJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string } | null;
  content?: string;
  departments?: { name: string }[];
  metadata?: { name: string; value: unknown }[] | null;
};

export const greenhouse: FeedConnector = {
  provider: "greenhouse",
  label: "Greenhouse",
  boardHint: "The name in job-boards.greenhouse.io/<name> or boards.greenhouse.io/<name>",
  parseBoard(input) {
    const s = input.trim();
    const m = s.match(/greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9._-]+)/i);
    const board = m ? m[1] : s;
    return /^[A-Za-z0-9._-]{1,100}$/.test(board) ? board.toLowerCase() : null;
  },
  async fetchJobs(board, fetchImpl) {
    const res = await fetchImpl(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
      {
        headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
      },
    );
    if (res.status === 404) throw new Error("Board not found on Greenhouse. Check the board name.");
    if (!res.ok) throw new Error(`Greenhouse returned ${res.status}`);
    const body = (await res.json()) as { jobs?: GhJob[] };
    return (body.jobs ?? []).slice(0, 500).map((j) => {
      const text = htmlToText(j.content ?? "");
      const meta = (j.metadata ?? []).map((m) => `${m.name} ${String(m.value ?? "")}`).join(" ");
      const loc = j.location?.name?.trim() || null;
      return {
        externalId: String(j.id),
        title: j.title.trim(),
        location: loc,
        department: j.departments?.[0]?.name ?? null,
        employmentType: guessEmployment(`${meta} ${j.title}`),
        workMode: guessWorkMode(`${loc ?? ""} ${meta}`),
        applyUrl: j.absolute_url,
        postingUrl: j.absolute_url,
        text,
      };
    });
  },
};
