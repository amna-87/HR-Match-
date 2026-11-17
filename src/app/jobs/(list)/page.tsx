import Link from "next/link";
import { Search } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Browse jobs" };
export const dynamic = "force-dynamic";

const MODES = [
  ["", "All"],
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
] as const;

// Public: anyone can browse published jobs, no account needed.
export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const mode = ["remote", "hybrid", "onsite"].includes(sp.mode ?? "") ? sp.mode : "";
  const { supabase } = await getSession();
  let jobs: PublicJob[] = [];
  if (supabase) {
    let query = supabase
      .from("jobs")
      .select(PUBLIC_JOB_COLUMNS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(100);
    if (q) {
      // strip characters that have meaning in PostgREST filter syntax
      const term = q.replace(/[%,()*\\]/g, " ").trim();
      if (term)
        query = query.or(
          `title.ilike.%${term}%,description_summary.ilike.%${term}%,location.ilike.%${term}%,source_company_name.ilike.%${term}%`,
        );
    }
    if (mode) query = query.eq("work_mode", mode);
    const { data } = await query;
    jobs = (data ?? []) as PublicJob[];
  }
  const href = (m: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (m) p.set("mode", m);
    const s = p.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };
  return (
    <div className="space-y-8">
      <section className="hero-glow border-border bg-card space-y-5 rounded-3xl border px-6 py-8 shadow-(--shadow-card) sm:px-10">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Open roles</h1>
          <p className="text-muted-foreground">Browse freely — no account needed.</p>
        </div>
        <form method="get" role="search" className="flex max-w-2xl flex-wrap gap-2">
          {mode && <input type="hidden" name="mode" value={mode} />}
          <div className="border-border bg-background flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/15">
            <Search className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden />
            <label htmlFor="q" className="sr-only">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Title, skill, company or city"
              className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none"
            />
          </div>
          <button className={buttonClasses("default", "default", "h-12 rounded-xl px-6")}>Search</button>
        </form>
        <nav aria-label="Work mode" className="flex flex-wrap gap-2">
          {MODES.map(([m, label]) => (
            <Link
              key={m}
              href={href(m)}
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
          <span className="text-foreground font-semibold">{jobs.length}</span> {jobs.length === 1 ? "role" : "roles"}
          {q ? (
            <>
              {" "}
              for &ldquo;<span className="text-foreground">{q}</span>&rdquo;
            </>
          ) : null}
          {q || mode ? (
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
      <JobList jobs={jobs} empty={q || mode ? "No roles match your search." : "No open roles yet."} />
    </div>
  );
}
