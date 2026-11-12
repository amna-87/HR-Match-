import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { JobSourceBadge, SourcedNotice, applyHref, employmentLabel, workModeLabel } from "@/components/job-source";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await getSession();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: job } = await supabase.from("jobs").select("*, company:companies(name, website)").eq("id", id).maybeSingle();
  if (!job) notFound();
  const company = (job.company as { name: string; website: string | null } | null)?.name ?? job.source_company_name ?? "Employer";
  const href = applyHref(job.apply_method, job.apply_target);
  return (
    <article className="max-w-3xl space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <JobSourceBadge job={job} />
          <Badge>{workModeLabel(job.work_mode)}</Badge>
          <Badge>{employmentLabel(job.employment_type)}</Badge>
        </div>
        <h1 className="text-3xl font-semibold">{job.title}</h1>
        <p className="text-muted-foreground">
          {company}
          {job.location ? ` · ${job.location}` : ""}
          {job.salary_min ? ` · ${job.salary_currency ?? ""} ${job.salary_min.toLocaleString()}–${(job.salary_max ?? job.salary_min).toLocaleString()}` : ""}
        </p>
      </div>
      <SourcedNotice job={job} />
      <p className="whitespace-pre-line">{job.description_summary}</p>
      <div className="space-y-1 text-sm">
        {job.required_skills.length > 0 && <p><strong>Required:</strong> {job.required_skills.join(", ")}</p>}
        {job.nice_skills.length > 0 && <p><strong>Nice to have:</strong> {job.nice_skills.join(", ")}</p>}
        {job.min_exp != null && <p><strong>Experience:</strong> {job.min_exp}+ years</p>}
      </div>
      {job.source_type === "sourced" ? (
        <div className="space-y-2">
          {href && (
            <a href={href} rel="noopener noreferrer nofollow" target="_blank" className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground">
              Apply via the original listing
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            Is this your listing and you want it removed? <Link className="underline" href={`/takedown?job=${job.id}`}>Request removal</Link>.
          </p>
        </div>
      ) : (
        <p className="rounded-md bg-muted p-4 text-sm">
          You can&apos;t apply blindly here: when your profile matches this role we&apos;ll ask whether you want to apply.{" "}
          {!profile && (
            <Link href="/signup?role=candidate" className="underline">
              Create a candidate profile
            </Link>
          )}
        </p>
      )}
    </article>
  );
}
