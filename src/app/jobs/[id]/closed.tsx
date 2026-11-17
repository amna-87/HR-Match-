import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";
import { buttonClasses } from "@/components/ui/button";

/** Up to 6 open public jobs with similar titles. */
export async function SimilarJobs({
  jobId,
  title,
  heading = "Similar jobs",
}: {
  jobId?: string;
  title: string;
  heading?: string;
}) {
  const { supabase } = await getSession();
  if (!supabase) return null;
  const words = title
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !["senior", "junior", "lead", "manager", "executive", "officer"].includes(w))
    .slice(0, 3);
  if (!words.length) return null;
  let q = supabase
    .from("jobs")
    .select(PUBLIC_JOB_COLUMNS)
    .eq("status", "published")
    .eq("visibility", "public")
    .or(words.map((w) => `title.ilike.%${w}%`).join(","))
    .order("published_at", { ascending: false })
    .limit(6);
  if (jobId) q = q.neq("id", jobId);
  const { data } = await q;
  if (!data?.length) return null;
  return (
    <section aria-labelledby="similar-h" className="space-y-4">
      <h2 id="similar-h" className="text-xl font-semibold tracking-tight">
        {heading}
      </h2>
      <JobList jobs={data as unknown as PublicJob[]} />
    </section>
  );
}

/** A job that was on the public board but is no longer open (7c: not a 404). */
export async function ClosedJob({ n }: { n: number }) {
  const r = await getPool().query<{ title: string; location: string | null; company: string | null }>(
    `select j.title, j.location, coalesce(co.name, j.source_company_name) company
     from public.jobs j left join public.companies co on co.id = j.company_id and co.kind = 'company'
     where j.public_number = $1 and j.visibility = 'public' and j.status in ('published', 'closed', 'expired', 'paused')`,
    [n],
  );
  const job = r.rows[0];
  if (!job) notFound();
  return (
    <div className="space-y-8">
      <div className="border-border bg-card space-y-3 rounded-3xl border p-8 text-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">This job is closed</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{job.title}</h1>
        <p className="text-muted-foreground">
          {[job.company ?? "Hiring directly", job.location].filter(Boolean).join(" · ")} is no longer taking
          applications.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link href="/jobs" className={buttonClasses()}>
            Browse open jobs
          </Link>
          <Link href="/signup?role=candidate" className={buttonClasses("outline")}>
            Get matched to jobs like this
          </Link>
        </div>
      </div>
      <SimilarJobs title={job.title} heading="Open jobs like this one" />
    </div>
  );
}
