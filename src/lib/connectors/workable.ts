// Workable careers-page widget API (no key; the same public endpoint careers
// pages use). https://apply.workable.com/api/v1/widget/accounts/<account>
import { BOT_USER_AGENT, guessEmployment, guessWorkMode, htmlToText, type FeedConnector } from "./types";

type WorkableJob = {
  shortcode?: string;
  code?: string;
  title: string;
  employment_type?: string | null;
  telecommuting?: boolean;
  department?: string | null;
  url?: string;
  shortlink?: string;
  application_url?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  locations?: { city?: string; region?: string; country?: string; hidden?: boolean }[];
  description?: string | null;
  workplace?: string | null;
};

export const workable: FeedConnector = {
  provider: "workable",
  label: "Workable",
  boardHint: "The name in apply.workable.com/<name> or <name>.workable.com",
  parseBoard(input) {
    const s = input.trim();
    const m =
      s.match(/apply\.workable\.com\/([A-Za-z0-9._-]+)/i) ??
      s.match(/^(?:https?:\/\/)?([A-Za-z0-9-]+)\.workable\.com/i);
    const board = m ? m[1] : s;
    return /^[A-Za-z0-9._-]{1,100}$/.test(board) && board.toLowerCase() !== "apply" ? board.toLowerCase() : null;
  },
  async fetchJobs(board, fetchImpl) {
    const res = await fetchImpl(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board)}?details=true`,
      {
        headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" },
      },
    );
    if (res.status === 404) throw new Error("Account not found on Workable. Check the name.");
    if (res.status === 429) throw new Error("Workable asked us to slow down; we'll try again on the next daily run.");
    if (!res.ok) throw new Error(`Workable returned ${res.status}`);
    const body = (await res.json()) as { jobs?: WorkableJob[] };
    return (body.jobs ?? []).slice(0, 500).map((j) => {
      const loc = j.locations?.find((l) => !l.hidden) ?? {
        city: j.city ?? undefined,
        region: j.state ?? undefined,
        country: j.country ?? undefined,
      };
      const location = [loc.city, loc.country].filter(Boolean).join(", ") || null;
      const id = j.shortcode ?? j.code ?? j.url ?? j.title;
      const page = j.url ?? j.shortlink ?? `https://apply.workable.com/${board}/j/${j.shortcode}/`;
      return {
        externalId: String(id),
        title: j.title.trim(),
        location,
        department: j.department ?? null,
        employmentType: guessEmployment(j.employment_type ?? ""),
        workMode:
          j.telecommuting || /remote/i.test(j.workplace ?? "")
            ? "remote"
            : /hybrid/i.test(j.workplace ?? "")
              ? "hybrid"
              : guessWorkMode(location ?? ""),
        applyUrl: j.application_url ?? page,
        postingUrl: page,
        text: htmlToText(j.description ?? ""),
      };
    });
  },
};
