import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Browse jobs" };
export const dynamic = "force-dynamic";

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
      if (term) query = query.or(`title.ilike.%${term}%,description_summary.ilike.%${term}%,location.ilike.%${term}%`);
    }
    if (mode) query = query.eq("work_mode", mode);
    const { data } = await query;
    jobs = (data ?? []) as PublicJob[];
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Open roles</h1>
      <form method="get" className="flex flex-wrap items-end gap-2" role="search">
        <Field label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={q} placeholder="Title, skill or city" />
        </Field>
        <Field label="Work mode" htmlFor="mode">
          <Select id="mode" name="mode" defaultValue={mode}>
            <option value="">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </Select>
        </Field>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <p className="text-muted-foreground text-sm">
        Listings marked <em>Sourced</em> were found on other sites and summarised by us — apply via the original
        listing.
      </p>
      <JobList jobs={jobs} empty={q || mode ? "No roles match your search." : "No open roles yet."} />
    </div>
  );
}
