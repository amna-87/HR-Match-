// SmartRecruiters public postings list (no key for companies that publish it).
// https://developers.smartrecruiters.com/docs/posting-api
import { BOT_USER_AGENT, guessEmployment, type FeedConnector } from "./types";

type SrPosting = {
  id: string;
  name: string;
  company?: { identifier?: string; name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean };
  typeOfEmployment?: { label?: string };
  department?: { label?: string };
  function?: { label?: string };
  industry?: { label?: string };
  experienceLevel?: { label?: string };
};

export const smartrecruiters: FeedConnector = {
  provider: "smartrecruiters",
  label: "SmartRecruiters",
  boardHint: "The company ID in jobs.smartrecruiters.com/<CompanyId> (case sensitive)",
  parseBoard(input) {
    const s = input.trim();
    const m = s.match(/smartrecruiters\.com\/([A-Za-z0-9._-]+)/i);
    const board = m ? m[1] : s;
    return /^[A-Za-z0-9._-]{1,100}$/.test(board) ? board : null;
  },
  async fetchJobs(board, fetchImpl) {
    const out: SrPosting[] = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const res = await fetchImpl(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings?limit=100&offset=${offset}`,
        { headers: { "User-Agent": BOT_USER_AGENT, Accept: "application/json" } },
      );
      if (res.status === 404) throw new Error("Company not found on SmartRecruiters. Check the company ID.");
      if (res.status === 401 || res.status === 403)
        throw new Error("This company doesn't publish a public job feed on SmartRecruiters.");
      if (!res.ok) throw new Error(`SmartRecruiters returned ${res.status}`);
      const body = (await res.json()) as { content?: SrPosting[]; totalFound?: number };
      out.push(...(body.content ?? []));
      if (!body.content?.length || out.length >= (body.totalFound ?? 0)) break;
    }
    return out.map((p) => {
      const l = p.location ?? {};
      const location = [l.city, (l.country ?? "").toUpperCase()].filter(Boolean).join(", ") || null;
      const page = `https://jobs.smartrecruiters.com/${encodeURIComponent(p.company?.identifier ?? board)}/${p.id}`;
      // the list has no description: build text from its labelled facts
      const text = [p.function?.label, p.industry?.label, p.experienceLevel?.label, p.department?.label]
        .filter(Boolean)
        .join(". ");
      return {
        externalId: p.id,
        title: p.name.trim(),
        location,
        department: p.department?.label ?? p.function?.label ?? null,
        employmentType: guessEmployment(`${p.typeOfEmployment?.label ?? ""} ${p.experienceLevel?.label ?? ""}`),
        workMode: l.remote ? "remote" : l.hybrid ? "hybrid" : "onsite",
        applyUrl: page,
        postingUrl: page,
        text,
      };
    });
  },
};
