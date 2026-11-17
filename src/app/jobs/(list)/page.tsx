import Link from "next/link";
import { Search } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Browse jobs",
  description: "Search every open job on Vouch by keyword, location, work mode, job type and date. No account needed.",
};
export const dynamic = "force-dynamic";

const PAGE = 30;
const MODES = [
  ["", "All"],
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
] as const;
const TYPES = [
  ["", "Any type"],
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["internship", "Internship"],
  ["temporary", "Temporary"],
  ["freelance", "Freelance"],
] as const;
const DATES = [
  ["", "Any time"],
  ["1", "Last 24 hours"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
] as const;

// strip characters that have meaning in PostgREST filter syntax
const clean = (s: string) =>
  s
    .replace(/[%,()*\\.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

// Public: anyone can search ALL listed jobs, no account and no page limit (7c).
export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const q = clean(sp.q ?? "");
  const loc = clean(sp.location ?? "");
  const mode = MODES.some(([m]) => m && m === sp.mode) ? sp.mode : "";
  const type = TYPES.some(([t]) => t && t === sp.type) ? sp.type : "";
  const days = DATES.some(([d]) => d && d === sp.posted) ? sp.posted : "";
  const page = Math.max(0, Math.min(1000, Number(sp.page) || 0));
  const { supabase } = await getSession();
  let jobs: PublicJob[] = [];
  let total = 0;
  if (supabase) {
    let query = supabase
      .from("jobs")
      .select(PUBLIC_JOB_COLUMNS, { count: "exact" })
      .eq("status", "published")
      .eq("visibility", "public")
      .order("published_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (q)
      query = query.or(
        `title.ilike.%${q}%,description_summary.ilike.%${q}%,location.ilike.%${q}%,source_company_name.ilike.%${q}%`,
      );
    if (loc) query = query.ilike("location", `%${loc}%`);
    if (mode) query = query.eq("work_mode", mode);
    if (type) query = query.eq("employment_type", type);
    if (days) query = query.gte("published_at", new Date(Date.now() - Number(days) * 86400_000).toISOString());
    const { data, count } = await query;
    jobs = (data ?? []) as PublicJob[];
    total = count ?? jobs.length;
  }
  const filtered = Boolean(q || loc || mode || type || days);
  const href = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const all = { q, location: loc, mode, type, posted: days, ...patch };
    for (const [k, v] of Object.entries(all))
      if (v !== "" && v != null && !(k === "page" && String(v) === "0")) p.set(k, String(v));
    const s = p.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };
  const selectCls =
    "border-border bg-background h-11 rounded-xl border px-3 text-sm focus-visible:ring-4 focus-visible:ring-indigo-500/15";

  return (
    <div className="space-y-8">
      <section className="hero-glow border-border bg-card space-y-5 rounded-3xl border px-6 py-8 shadow-(--shadow-card) sm:px-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Open roles</h1>
          <p className="text-muted-foreground">Browse freely — no account needed.</p>
        </div>
        <form method="get" role="search" className="space-y-3">
          {mode && <input type="hidden" name="mode" value={mode} />}
          <div className="flex max-w-3xl flex-wrap gap-2">
            <div className="border-border bg-background flex min-w-0 flex-[2] items-center gap-2 rounded-xl border px-3 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/15">
              <Search className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden />
              <label htmlFor="q" className="sr-only">
                Search
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Title, skill or company"
                className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none"
              />
            </div>
            <label htmlFor="location" className="sr-only">
              Location
            </label>
            <input
              id="location"
              name="location"
              defaultValue={loc}
              placeholder="City or country"
              className="border-border bg-background placeholder:text-muted-foreground h-12 min-w-0 flex-1 rounded-xl border px-3 shadow-sm"
            />
            <button className={buttonClasses("default", "default", "h-12 rounded-xl px-6")}>Search</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="type" className="sr-only">
              Job type
            </label>
            <select id="type" name="type" defaultValue={type} className={selectCls}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <label htmlFor="posted" className="sr-only">
              Date posted
            </label>
            <select id="posted" name="posted" defaultValue={days} className={selectCls}>
              {DATES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </form>
        <nav aria-label="Work mode" className="flex flex-wrap gap-2">
          {MODES.map(([m, label]) => (
            <Link
              key={m}
              href={href({ mode: m, page: 0 })}
              aria-current={mode === m ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                mode === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-slate-300",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          <span className="text-foreground font-semibold">{total}</span> {total === 1 ? "role" : "roles"}
          {q ? (
            <>
              {" "}
              for &ldquo;<span className="text-foreground">{q}</span>&rdquo;
            </>
          ) : null}
          {loc ? <> in {loc}</> : null}
          {filtered ? (
            <>
              {" · "}
              <Link href="/jobs" className="text-primary underline underline-offset-2">
                Clear filters
              </Link>
            </>
          ) : null}
        </p>
        <p className="text-muted-foreground text-xs">
          <em>Sourced</em> roles were found elsewhere and summarised by us — apply directly to the employer.
        </p>
      </div>
      <JobList jobs={jobs} empty={filtered ? "No roles match your search." : "No open roles yet."} />
      {total > PAGE && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-3">
          {page > 0 && (
            <Link href={href({ page: page - 1 })} className={buttonClasses("outline")}>
              Previous
            </Link>
          )}
          <span className="text-muted-foreground text-sm">
            Page {page + 1} of {Math.ceil(total / PAGE)}
          </span>
          {(page + 1) * PAGE < total && (
            <Link href={href({ page: page + 1 })} className={buttonClasses("outline")}>
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
