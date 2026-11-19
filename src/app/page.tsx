import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Briefcase,
  CheckCircle2,
  FileText,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { getSession } from "@/lib/auth/session";
import { JobList, PUBLIC_JOB_COLUMNS, type PublicJob } from "@/components/job-list";

export const dynamic = "force-dynamic";

const audiences = [
  {
    id: "seekers",
    icon: Search,
    tag: "For job seekers",
    title: "Find the job that suits you best",
    points: [
      "Upload your resume once and we match you to the right jobs",
      "See why each job fits your skills and experience",
      "Apply with one click, only when you say yes",
    ],
    cta: { href: "/signup?role=candidate", label: "Create my free profile" },
    alt: { href: "/jobs", label: "Browse jobs" },
    tone: "bg-primary-soft text-primary-soft-foreground",
  },
  {
    id: "recruiters",
    icon: Briefcase,
    tag: "For recruiters & employers",
    title: "Find the best candidates for your role",
    points: [
      "Post your job here, free, and reach people who fit",
      "Have lots of resumes? Upload them and build your private talent pool",
      "Get candidates ranked by fit, and meet the ones who want the job",
    ],
    cta: { href: "/signup?role=recruiter", label: "Post a job" },
    alt: { href: "/signup?role=recruiter", label: "Upload resumes" },
    tone: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  },
];

const seekerSteps = [
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

const recruiterSteps = [
  {
    icon: Briefcase,
    title: "Post your job",
    text: "Describe the role and the skills you need. It goes live on Vouch for everyone to see.",
  },
  {
    icon: Upload,
    title: "Upload your resumes",
    text: "Add the resumes you already have. Only your company sees them in full.",
  },
  {
    icon: Users,
    title: "Meet the best fits",
    text: "We rank candidates for your job and introduce the ones who want it.",
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
          .eq("visibility", "public")
          .order("published_at", { ascending: false })
          .limit(6),
        supabase
          .from("jobs")
          .select("company_id, source_company_name")
          .eq("status", "published")
          .eq("visibility", "public")
          .limit(1000),
      ])
    : [{ data: [], count: 0 }, { data: [] }];
  const latest = (data ?? []) as PublicJob[];
  const companyCount = new Set((companies ?? []).map((c) => c.company_id ?? c.source_company_name).filter(Boolean))
    .size;

  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="hero-glow border-border bg-card relative isolate space-y-10 overflow-hidden rounded-3xl border px-5 py-10 shadow-(--shadow-card) sm:px-12 sm:py-16">
        <LogoMark className="pointer-events-none absolute -top-12 -right-20 -z-10 hidden h-80 w-80 opacity-[0.07] md:block" />
        <LogoMark className="pointer-events-none absolute top-40 -left-24 -z-10 hidden h-64 w-64 -scale-x-100 opacity-[0.05] lg:block" />
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <span className="bg-primary-soft text-primary-soft-foreground inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Consent-first hiring
          </span>
          <h1 className="text-[2.1rem] leading-tight font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            The right job for you. <span className="text-primary">The right people for your team.</span>
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg text-pretty">
            Vouch connects job seekers and recruiters. Find a job that fits you, or post a job and find the best
            candidates, with nothing shared until people agree.
          </p>
          <form
            action="/jobs"
            method="get"
            role="search"
            className="border-border bg-background mx-auto flex max-w-xl items-center gap-2 rounded-2xl border p-1.5 shadow-sm"
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
          <div className="text-muted-foreground flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <p>
              <span className="text-foreground mr-1.5 text-2xl font-semibold">{count ?? 0}</span>open roles
            </p>
            <p>
              <span className="text-foreground mr-1.5 text-2xl font-semibold">{companyCount}</span>companies hiring
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {audiences.map(({ id, icon: Icon, tag, title, points, cta, alt, tone }) => (
            <article
              key={id}
              aria-labelledby={`${id}-h`}
              className="border-border bg-background flex flex-col gap-5 rounded-2xl border p-6 text-left shadow-sm sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">{tag}</span>
              </div>
              <h2 id={`${id}-h`} className="text-2xl font-semibold tracking-tight">
                {title}
              </h2>
              <ul className="space-y-3">
                {points.map((p) => (
                  <li key={p} className="flex gap-3">
                    <CheckCircle2 className="text-accent mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-3 pt-2">
                <Link href={cta.href} className={buttonClasses("default", "lg")}>
                  {cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={alt.href} className={buttonClasses("outline", "lg")}>
                  {alt.label}
                </Link>
              </div>
            </article>
          ))}
        </div>
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
          <p className="text-muted-foreground">Simple for both sides. Everyone stays in control.</p>
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <Steps heading="If you're looking for a job" steps={seekerSteps} />
          <Steps heading="If you're hiring" steps={recruiterSteps} />
        </div>
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

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 px-6 py-10 text-white sm:px-12">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl space-y-2">
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Users className="h-6 w-6" aria-hidden /> Hiring? Post your job or upload your resumes.
            </h2>
            <p className="text-violet-100">
              Post a role in minutes, or add the resumes you already have. We rank the best candidates for you.
            </p>
          </div>
          <Link
            href="/signup?role=recruiter"
            className={buttonClasses("outline", "lg", "border-white/0 bg-white text-violet-700 hover:bg-violet-50")}
          >
            Post a job <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Steps({ heading, steps }: { heading: string; steps: { icon: LucideIcon; title: string; text: string }[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{heading}</h3>
      <ol className="space-y-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="border-border bg-card flex gap-4 rounded-2xl border p-5 shadow-(--shadow-card)">
            <span className="bg-primary-soft text-primary-soft-foreground inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">
                <span className="text-muted-foreground mr-1.5 text-sm font-medium">Step {i + 1}</span>
                {title}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
