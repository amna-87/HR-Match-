import Link from "next/link";
import { ArrowRight, BellRing, FileText, Lock, Search, ShieldCheck, Sparkles, ThumbsUp, Users } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";

export const dynamic = "force-dynamic";

const steps = [
  {
    icon: FileText,
    title: "Upload your resume",
    text: "We turn it into a profile you can edit in minutes. Your file stays private.",
  },
  {
    icon: BellRing,
    title: "Get matched",
    text: "When a job fits your skills and experience, we tell you why it's a match.",
  },
  {
    icon: ThumbsUp,
    title: "You decide",
    text: "Approve to apply, or decline. Employers only see people who said yes.",
  },
];

const promises = [
  {
    icon: Lock,
    title: "Private by default",
    text: "Your resume is never public. Employers see you only after you approve.",
  },
  {
    icon: ShieldCheck,
    title: "Fair matching",
    text: "Skills and experience only — never age, gender, religion, ethnicity or photos.",
  },
  { icon: Sparkles, title: "No spam", text: "A few relevant matches, not a flood. You choose how often we email you." },
];

export default async function Home() {
  const { supabase } = await getSession();
  const [{ data, count }, { data: companies }] = supabase
    ? await Promise.all([
        supabase
          .from("jobs")
          .select(PUBLIC_JOB_COLUMNS, { count: "exact" })
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(6),
        supabase.from("jobs").select("company_id, source_company_name").eq("status", "published").limit(1000),
      ])
    : [{ data: [], count: 0 }, { data: [] }];
  const latest = (data ?? []) as PublicJob[];
  const companyCount = new Set((companies ?? []).map((c) => c.company_id ?? c.source_company_name).filter(Boolean))
    .size;

  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="hero-glow border-border bg-card relative grid gap-10 overflow-hidden rounded-3xl border px-6 py-12 shadow-(--shadow-card) sm:px-12 sm:py-16 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div className="max-w-3xl space-y-6">
          <span className="bg-primary-soft text-primary-soft-foreground inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Consent-first hiring
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Find work that fits you — <span className="text-primary">on your terms.</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
            Upload your resume once. We match you to the right jobs automatically, and nothing reaches an employer until
            you approve it.
          </p>
          <form
            action="/jobs"
            method="get"
            role="search"
            className="border-border bg-background flex max-w-xl items-center gap-2 rounded-2xl border p-1.5 shadow-sm"
          >
            <Search className="text-muted-foreground ml-2 h-5 w-5 shrink-0" aria-hidden />
            <label htmlFor="hero-q" className="sr-only">
              Search jobs
            </label>
            <input
              id="hero-q"
              name="q"
              placeholder="Job title, skill or city"
              className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none"
            />
            <button className={buttonClasses("default", "default", "h-11 rounded-xl px-5")}>Search</button>
          </form>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup?role=candidate" className={buttonClasses("default", "lg")}>
              Create my profile <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/signup?role=recruiter" className={buttonClasses("outline", "lg")}>
              I&apos;m hiring
            </Link>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-8 gap-y-2 pt-2 text-sm">
            <p>
              <span className="text-foreground mr-1.5 text-2xl font-semibold">{count ?? 0}</span>open roles
            </p>
            <p>
              <span className="text-foreground mr-1.5 text-2xl font-semibold">{companyCount}</span>companies hiring
            </p>
          </div>
        </div>
        <HeroPreview />
      </section>

      <section aria-labelledby="latest-h" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="latest-h" className="text-2xl font-semibold tracking-tight">
              Latest jobs
            </h2>
            <p className="text-muted-foreground">Fresh roles, updated daily.</p>
          </div>
          <Link href="/jobs" className={buttonClasses("ghost", "default", "text-primary")}>
            See all {count ? `${count} ` : ""}jobs <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <JobList jobs={latest} empty="No open roles yet — check back soon." />
      </section>

      <section aria-labelledby="how-h" className="space-y-6">
        <div className="text-center">
          <h2 id="how-h" className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <p className="text-muted-foreground">Three steps. You stay in control at every one.</p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="border-border bg-card rounded-2xl border p-6 shadow-(--shadow-card)">
              <div className="flex items-center gap-3">
                <span className="bg-primary-soft text-primary-soft-foreground inline-flex h-10 w-10 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-muted-foreground text-sm font-medium">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="promise-h" className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:items-center">
        <div className="space-y-2">
          <h2 id="promise-h" className="text-2xl font-semibold tracking-tight">
            Built on trust
          </h2>
          <p className="text-muted-foreground">
            Your data is yours. We only share what you approve, and you can export or delete everything at any time.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {promises.map(({ icon: Icon, title, text }) => (
            <li key={title} className="space-y-2">
              <Icon className="text-accent h-6 w-6" aria-hidden />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-muted-foreground text-sm">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-teal-600 px-6 py-10 text-white sm:px-12">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl space-y-2">
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Users className="h-6 w-6" aria-hidden /> Hiring? Meet people who want the job.
            </h2>
            <p className="text-indigo-100">
              Post a role in minutes. We rank matching candidates and only introduce the ones who said yes.
            </p>
          </div>
          <Link
            href="/signup?role=recruiter"
            className={buttonClasses("outline", "lg", "border-white/0 bg-white text-indigo-700 hover:bg-indigo-50")}
          >
            Post a job <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Decorative example of a match notification (not real data). */
function HeroPreview() {
  return (
    <div aria-hidden className="relative hidden lg:block">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/15 to-teal-400/15 blur-2xl" />
      <div className="border-border bg-card relative space-y-4 rounded-2xl border p-5 shadow-(--shadow-lift)">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-medium">New match for you</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            92% fit
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 text-sm font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-200">
            BS
          </span>
          <div>
            <p className="font-semibold">Product Designer</p>
            <p className="text-muted-foreground text-sm">Bright Studio · Remote</p>
          </div>
        </div>
        <p className="bg-muted text-muted-foreground rounded-xl p-3 text-sm">
          Matched on Figma, user research and 4 years of product design.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <span className={buttonClasses("default", "default", "pointer-events-none")}>Approve &amp; apply</span>
          <span className={buttonClasses("outline", "default", "pointer-events-none")}>Not for me</span>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Lock className="h-3.5 w-3.5" /> Your profile stays private until you approve.
        </p>
      </div>
    </div>
  );
}
