import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";
import { CATEGORIES, MIN_LANDING_JOBS, categoryLabel, categoryOf, landingCounts } from "@/lib/jobs/categories";
import { cityOf } from "@/lib/slug";

export async function landingJobs() {
  const { supabase } = await getSession();
  if (!supabase) return [];
  const { data } = await supabase
    .from("jobs")
    .select(`${PUBLIC_JOB_COLUMNS}, domains`)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("published_at", { ascending: false })
    .limit(2000);
  return (data ?? []) as unknown as (PublicJob & { domains: string[] | null })[];
}

export async function landingTitle(first: string, second?: string) {
  const jobs = await landingJobs();
  return resolve(jobs, first, second)?.heading ?? null;
}

function resolve(jobs: (PublicJob & { domains: string[] | null })[], first: string, second?: string) {
  const isCat = CATEGORIES.some((c) => c.slug === first);
  const cat = isCat ? first : null;
  const city = isCat ? (second ?? null) : second ? null : first;
  if (!isCat && second) return null;
  const list = jobs.filter((j) => (!cat || categoryOf(j) === cat) && (!city || cityOf(j.location) === city));
  if (list.length < MIN_LANDING_JOBS) return null;
  const cityLabel = city === "remote" ? "remote" : list[0]?.location?.split(/[,(|/]/)[0].trim();
  const heading = cat
    ? `${categoryLabel(cat)} jobs${city ? (city === "remote" ? " (remote)" : ` in ${cityLabel}`) : ""}`
    : city === "remote"
      ? "Remote jobs"
      : `Jobs in ${cityLabel}`;
  return { list, heading, cat, city };
}

/** Category and location landing pages from real data (7c); only with enough jobs. */
export async function LandingPage({ first, second }: { first: string; second?: string; searchParams?: unknown }) {
  const jobs = await landingJobs();
  const r = resolve(jobs, first, second);
  if (!r) notFound();
  const counts = landingCounts(jobs);
  const related = r.cat
    ? counts.combos.filter((c) => c.path.startsWith(`${r.cat}/`) && c.path !== `${r.cat}/${r.city}`)
    : counts.categories.map((c) => ({ path: c.slug, n: c.n }));
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/jobs" className="text-muted-foreground text-sm underline">
          All jobs
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{r.heading}</h1>
        <p className="text-muted-foreground">
          {r.list.length} open role{r.list.length === 1 ? "" : "s"}, updated daily. No account needed to browse.
        </p>
      </div>
      <JobList jobs={r.list.slice(0, 100)} />
      {related.length > 0 && (
        <nav aria-label="Related job pages" className="space-y-2">
          <h2 className="text-lg font-semibold">More job pages</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {related.slice(0, 20).map((c) => {
              const [cat, city] = c.path.split("/");
              const label = city
                ? `${categoryLabel(cat)} · ${counts.cities.find((x) => x.slug === city)?.label ?? city}`
                : categoryLabel(cat);
              return (
                <li key={c.path}>
                  <Link href={`/jobs/${c.path}`} className="bg-muted hover:bg-primary-soft rounded-full px-3 py-1.5">
                    {label} ({c.n})
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
