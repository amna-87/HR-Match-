import { HIRING_DIRECTLY } from "@/components/job-list";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Clock,
  GraduationCap,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ExternalLink,
} from "lucide-react";
import { getPool } from "@/lib/db";
import { APPLY_LABEL, isPrivateContact, maskContact, maskContactsInText } from "@/lib/jobs/contact";
import { newChallenge } from "@/lib/jobs/human-check";
import { RevealContact } from "@/components/reveal-contact";
import { getSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/company-avatar";
import { JobDescription } from "@/components/job-description";
import { JobSourceBadge, SourcedNotice, applyHref, employmentLabel, workModeLabel } from "@/components/job-source";

const JOB_PAGE_COLUMNS =
  "id, company_id, source_type, origin, visibility, source_name, source_url, source_company_name, title, description_summary, required_skills, nice_skills, required_certifications, domains, min_exp, max_exp, location, work_mode, employment_type, salary_min, salary_max, salary_currency, apply_method, status, expires_at, published_at, public_number, company:companies!jobs_company_id_fkey(name, website)";
import { firstParagraph, formatDate, timeAgo } from "@/lib/utils";
import { jobPath, parseJobParam, siteUrl, slugify } from "@/lib/slug";
import { jobPostingJsonLd, jsonLdString } from "@/lib/jobs/jsonld";
import { ShareButtons } from "@/components/share-buttons";
import { Flash } from "@/components/flash";
import { applyToJob, toggleSaveJob } from "../_actions/job";
import { ClosedJob, SimilarJobs } from "./closed";
import { LandingPage, landingTitle } from "./landing";

export const dynamic = "force-dynamic";

type JobRow = Record<string, unknown> & {
  id: string;
  title: string;
  location: string | null;
  public_number: number;
  description_summary: string;
  source_company_name: string | null;
  source_type: "verified" | "sourced";
  company: unknown;
};

/** Live public job by its readable number (RLS: published, public, not expired). */
async function loadLiveJob(n: number) {
  const { supabase } = await getSession();
  if (!supabase) return null;
  const { data } = await supabase
    .from("jobs")
    .select(JOB_PAGE_COLUMNS)
    .eq("public_number", n)
    .eq("visibility", "public")
    .maybeSingle();
  return data as unknown as JobRow | null;
}

const companyOf = (j: JobRow) => (j.company as { name: string } | null)?.name ?? j.source_company_name ?? null;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = parseJobParam((await params).id);
  if (p.kind === "slug") {
    const t = await landingTitle(p.slug);
    return t
      ? {
          title: t,
          description: `${t} on Vouch. Browse and apply without an account.`,
          alternates: { canonical: `${siteUrl()}/jobs/${p.slug}` },
        }
      : {};
  }
  if (p.kind !== "number") return {};
  const j = await loadLiveJob(p.n);
  if (!j) return { title: "Job closed", robots: { index: false } };
  const company = companyOf(j) ?? "Hiring directly";
  const title = `${j.title} · ${company}${j.location ? ` · ${j.location}` : ""}`;
  const description = firstParagraph(j.description_summary).slice(0, 155);
  const url = `${siteUrl()}${jobPath(j)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "Vouch" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const p = parseJobParam(id);
  // one segment that isn't a job: a category or city landing page
  if (p.kind === "slug") return <LandingPage first={p.slug} searchParams={sp} />;
  const { supabase, profile, user } = await getSession();
  if (!supabase) notFound();
  if (p.kind === "uuid") {
    // old links: redirect to the readable URL
    const r = await getPool().query<{ title: string; location: string | null; public_number: number }>(
      "select title, location, public_number from public.jobs where id = $1 and visibility = 'public'",
      [p.id],
    );
    if (!r.rows[0]) notFound();
    permanentRedirect(jobPath(r.rows[0]));
  }
  const job = (await loadLiveJob(p.n)) as (JobRow & Record<string, any>) | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!job) return <ClosedJob n={p.n} />;
  if (id !== jobPath(job).slice("/jobs/".length)) permanentRedirect(jobPath(job));
  const url = `${siteUrl()}${jobPath(job)}`;
  const saved = user
    ? !!(await supabase.from("saved_jobs").select("job_id").eq("job_id", job.id).eq("user_id", user.id).maybeSingle())
        .data
    : false;
  const applied =
    profile?.role === "candidate"
      ? (
          await getPool().query(
            "select 1 from public.applications a join public.candidates c on c.id = a.candidate_id where a.job_id = $1 and c.user_id = $2",
            [job.id, user!.id],
          )
        ).rowCount! > 0
      : false;
  // The apply contact and notes, read by the server for this visible job; private
  // contacts are masked for anonymous visitors and revealed after a check.
  const priv = (
    await getPool().query<{ apply_target: string | null; apply_instructions: string | null }>(
      "select apply_target, apply_instructions from public.jobs where id = $1",
      [job.id],
    )
  ).rows[0] ?? { apply_target: null, apply_instructions: null };
  const signedIn = !!profile;
  const privateContact = isPrivateContact(job.apply_method, priv.apply_target);
  const showContact = signedIn || !privateContact;
  const instructions = priv.apply_instructions
    ? signedIn
      ? priv.apply_instructions
      : maskContactsInText(priv.apply_instructions)
    : null;
  const companyName =
    (job.company as unknown as { name: string; website: string | null } | null)?.name ??
    job.source_company_name ??
    null;
  const company = companyName ?? HIRING_DIRECTLY;
  const href = showContact ? applyHref(job.apply_method, priv.apply_target, job.title) : null;
  const sourced = job.source_type === "sourced";
  const salary = job.salary_min
    ? `${job.salary_currency ?? ""} ${job.salary_min.toLocaleString()}–${(job.salary_max ?? job.salary_min).toLocaleString()}`
    : null;
  const ApplyIcon =
    job.apply_method === "email"
      ? Mail
      : job.apply_method === "phone"
        ? Phone
        : job.apply_method === "whatsapp"
          ? MessageCircle
          : ExternalLink;

  const details: [React.ComponentType<{ className?: string }>, string, string | null][] = [
    [MapPin, "Location", job.location],
    [Briefcase, "Work type", `${workModeLabel(job.work_mode)} · ${employmentLabel(job.employment_type)}`],
    [GraduationCap, "Experience", job.min_exp != null ? `${job.min_exp}+ years` : null],
    [Clock, "Posted", job.published_at ? timeAgo(job.published_at) : null],
    [CalendarClock, "Open until", job.expires_at ? formatDate(job.expires_at) : null],
  ];

  return (
    <article className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            jobPostingJsonLd({
              ...(job as unknown as Parameters<typeof jobPostingJsonLd>[0]),
              company: companyName,
              companyUrl: (job.company as { website?: string | null } | null)?.website ?? null,
            }),
          ),
        }}
      />
      <Flash searchParams={sp} />
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
            {companyName ? (
              <Link
                href={`/companies/${slugify(companyName)}`}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {company}
              </Link>
            ) : (
              company
            )}
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
              showContact ? (
                <>
                  {href && (
                    <a
                      href={href}
                      rel="noopener noreferrer nofollow"
                      target={job.apply_method === "link" || job.apply_method === "whatsapp" ? "_blank" : undefined}
                      className={buttonClasses("default", "lg", "w-full text-center whitespace-normal")}
                    >
                      <ApplyIcon className="h-4 w-4 shrink-0" aria-hidden />
                      {job.apply_method === "link"
                        ? job.source_url
                          ? "Apply via the original listing"
                          : "Apply on the employer's site"
                        : APPLY_LABEL[job.apply_method]}
                    </a>
                  )}
                  {job.apply_method !== "link" && priv.apply_target && (
                    <p className="text-center text-sm font-medium break-all">{priv.apply_target}</p>
                  )}
                  {instructions && (
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">How to apply</p>
                      <p className="text-muted-foreground break-words whitespace-pre-line">{instructions}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <RevealContact
                    jobId={job.id}
                    title={job.title}
                    method={job.apply_method}
                    masked={maskContact(job.apply_method, priv.apply_target ?? "")}
                    signedIn={false}
                    challenge={newChallenge(job.id)}
                  />
                  {instructions && (
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">How to apply</p>
                      <p className="text-muted-foreground break-words whitespace-pre-line">{instructions}</p>
                    </div>
                  )}
                </>
              )
            ) : (
              <>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">How applying works</p>
                  <p className="text-muted-foreground">
                    How to apply: when your profile matches this role we&apos;ll ask whether you want to apply, and your
                    profile is only sent to the employer if you approve.
                  </p>
                </div>
                {applied ? (
                  <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    You applied. Track it on your dashboard.
                  </p>
                ) : profile?.role === "candidate" ? (
                  <form action={applyToJob}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="path" value={jobPath(job)} />
                    <button className={buttonClasses("default", "lg", "w-full")}>Apply with my Vouch profile</button>
                  </form>
                ) : !profile ? (
                  <Link
                    href={`/signup?role=candidate&next=${encodeURIComponent(jobPath(job))}`}
                    className={buttonClasses("default", "lg", "w-full")}
                  >
                    Sign up free to apply
                  </Link>
                ) : null}
                {instructions && (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">What happens after you apply</p>
                    <p className="text-muted-foreground whitespace-pre-line">{instructions}</p>
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
          <div className="border-border bg-card space-y-3 rounded-2xl border p-5">
            <p className="text-sm font-semibold">Share this job</p>
            <ShareButtons url={url} title={job.title} />
            <form action={toggleSaveJob}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="path" value={jobPath(job)} />
              <input type="hidden" name="saved" value={String(saved)} />
              <button className={buttonClasses("ghost", "sm", "px-0")}>{saved ? "★ Saved" : "☆ Save this job"}</button>
            </form>
          </div>
          {!profile && (
            <div className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-900 dark:bg-indigo-950/40">
              <p className="font-semibold">Get matched to jobs like this</p>
              <p className="text-muted-foreground text-sm">
                Upload your resume once. We&apos;ll tell you when a job fits, with the reason, and nothing is sent
                without your OK.
              </p>
              <Link href="/signup?role=candidate" className={buttonClasses("default", "sm")}>
                Create my free profile
              </Link>
            </div>
          )}
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
      <SimilarJobs jobId={job.id} title={job.title} />
    </article>
  );
}
