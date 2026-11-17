import { HIRING_DIRECTLY } from "@/components/job-list";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Clock,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  ExternalLink,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/company-avatar";
import { JobDescription } from "@/components/job-description";
import { JobSourceBadge, SourcedNotice, applyHref, employmentLabel, workModeLabel } from "@/components/job-source";
import { formatDate, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getSession();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) return {};
  const { data } = await supabase.from("jobs").select("title").eq("id", id).maybeSingle();
  return data ? { title: data.title } : {};
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await getSession();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: job } = await supabase
    .from("jobs")
    .select("*, company:companies(name, website)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  const companyName =
    (job.company as { name: string; website: string | null } | null)?.name ?? job.source_company_name ?? null;
  const company = companyName ?? HIRING_DIRECTLY;
  const href = applyHref(job.apply_method, job.apply_target);
  const sourced = job.source_type === "sourced";
  const salary = job.salary_min
    ? `${job.salary_currency ?? ""} ${job.salary_min.toLocaleString()}–${(job.salary_max ?? job.salary_min).toLocaleString()}`
    : null;
  const ApplyIcon = job.apply_method === "email" ? Mail : job.apply_method === "phone" ? Phone : ExternalLink;

  const details: [React.ComponentType<{ className?: string }>, string, string | null][] = [
    [MapPin, "Location", job.location],
    [Briefcase, "Work type", `${workModeLabel(job.work_mode)} · ${employmentLabel(job.employment_type)}`],
    [GraduationCap, "Experience", job.min_exp != null ? `${job.min_exp}+ years` : null],
    [Clock, "Posted", job.published_at ? timeAgo(job.published_at) : null],
    [CalendarClock, "Open until", job.expires_at ? formatDate(job.expires_at) : null],
  ];

  return (
    <article className="space-y-6">
      <Link
        href="/jobs"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All jobs
      </Link>

      <header className="hero-glow border-border bg-card flex flex-wrap items-start gap-5 rounded-3xl border p-6 shadow-(--shadow-card) sm:p-8">
        <CompanyAvatar name={companyName} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <JobSourceBadge job={job} />
            <Badge>{workModeLabel(job.work_mode)}</Badge>
            <Badge>{employmentLabel(job.employment_type)}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{job.title}</h1>
          <p className="text-muted-foreground">
            {company}
            {job.location ? ` · ${job.location}` : ""}
            {salary ? ` · ${salary}` : ""}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <SourcedNotice job={job} />
          <section className="border-border bg-card rounded-2xl border p-6 shadow-(--shadow-card) sm:p-8">
            <h2 className="mb-4 text-lg font-semibold tracking-tight">About the role</h2>
            <JobDescription text={job.description_summary} />
          </section>
          {(job.required_skills.length > 0 || job.nice_skills.length > 0) && (
            <section className="border-border bg-card space-y-4 rounded-2xl border p-6 shadow-(--shadow-card) sm:p-8">
              <h2 className="text-lg font-semibold tracking-tight">Skills</h2>
              {job.required_skills.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Required</p>
                  <ul className="flex flex-wrap gap-2">
                    {job.required_skills.map((s: string) => (
                      <li
                        key={s}
                        className="bg-primary-soft text-primary-soft-foreground rounded-full px-3 py-1 text-sm font-medium"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {job.nice_skills.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Nice to have</p>
                  <ul className="flex flex-wrap gap-2">
                    {job.nice_skills.map((s: string) => (
                      <li key={s} className="bg-muted rounded-full px-3 py-1 text-sm">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="border-border bg-card space-y-4 rounded-2xl border p-6 shadow-(--shadow-card)">
            {sourced ? (
              <>
                {href && (
                  <a
                    href={href}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className={buttonClasses("default", "lg", "w-full text-center whitespace-normal")}
                  >
                    <ApplyIcon className="h-4 w-4 shrink-0" aria-hidden />
                    {job.apply_method === "email"
                      ? `Apply by email: ${job.apply_target}`
                      : job.apply_method === "phone"
                        ? `Call / WhatsApp: ${job.apply_target}`
                        : job.source_url
                          ? "Apply via the original listing"
                          : "Apply on the employer's form"}
                  </a>
                )}
                {job.apply_instructions && (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">How to apply</p>
                    <p className="text-muted-foreground break-words whitespace-pre-line">{job.apply_instructions}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">How applying works</p>
                  <p className="text-muted-foreground">
                    How to apply: when your profile matches this role we&apos;ll ask whether you want to apply, and your
                    profile is only sent to the employer if you approve.
                  </p>
                </div>
                {!profile && (
                  <Link href="/signup?role=candidate" className={buttonClasses("default", "lg", "w-full")}>
                    Create a candidate profile
                  </Link>
                )}
                {job.apply_instructions && (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">What happens after you apply</p>
                    <p className="text-muted-foreground whitespace-pre-line">{job.apply_instructions}</p>
                  </div>
                )}
              </>
            )}
            <ul className="border-border space-y-3 border-t pt-4 text-sm">
              {details
                .filter(([, , v]) => v)
                .map(([Icon, label, value]) => (
                  <li key={label} className="flex items-start gap-3">
                    <Icon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <span className="text-muted-foreground block text-xs">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
          {sourced && (
            <p className="text-muted-foreground px-1 text-xs">
              Is this your listing and you want it removed?{" "}
              <Link className="underline" href={`/takedown?job=${job.id}`}>
                Request removal
              </Link>
              .
            </p>
          )}
        </aside>
      </div>
    </article>
  );
}
