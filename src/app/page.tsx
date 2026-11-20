import { redirect } from "next/navigation";
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
import { cn } from "@/lib/utils";
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

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { supabase, profile } = await getSession();
  // Admins land on their dashboard; "?site=1" still shows the public home page.
  if (profile?.role === "admin" && profile.status === "active" && (await searchParams).site !== "1") redirect("/admin");
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
          .select("company_id, source_company_name, company:companies!jobs_company_id_fkey(name)")
          .eq("status", "published")
          .eq("visibility", "public")
          .limit(1000),
      ])
    : [{ data: [], count: 0 }, { data: [] }];
  const latest = (data ?? []) as PublicJob[];
  const companyCount = new Set((companies ?? []).map((c) => c.company_id ?? c.source_company_name).filter(Boolean))
    .size;

  const companyNames = Array.from(
    new Set(
      (companies ?? [])
        .map((c) => (c.company as unknown as { name: string } | null)?.name ?? c.source_company_name)
        .filter((n): n is string => !!n && n.length < 40),
    ),
  ).slice(0, 24);

  return (
    <div className="space-y-20 sm:space-y-28">
      {/* ---------- Hero ---------- */}
      <section className="hero-glow border-border bg-card relative isolate overflow-hidden rounded-[2rem] border px-5 py-10 shadow-(--shadow-card) sm:px-10 sm:py-14 lg:px-14">
        <div className="bg-arches pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(70%_70%_at_70%_40%,black,transparent)]" />
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6 text-center lg:text-left">
            <span className="bg-primary-soft text-primary-soft-foreground inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-pulse-ring bg-primary absolute inline-flex h-full w-full rounded-full" />
                <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
              </span>
              {count ?? 0} open roles right now
            </span>
            <h1 className="text-[2.2rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.6rem]">
              The right job for you.{" "}
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-500 bg-clip-text text-transparent dark:from-violet-300 dark:via-fuchsia-300 dark:to-violet-300">
                The right people for your team.
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto max-w-xl text-lg text-pretty lg:mx-0">
              Vouch matches job seekers and recruiters by skills and experience, and nothing is shared until the person
              says yes.
            </p>
            <form
              action="/jobs"
              method="get"
              role="search"
              className="border-border bg-background focus-within:border-primary/50 focus-within:ring-primary/15 mx-auto flex max-w-xl items-center gap-2 rounded-2xl border p-1.5 shadow-(--shadow-card) transition-shadow focus-within:ring-4 lg:mx-0"
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
              <button className={buttonClasses("default", "default", "rounded-xl px-5")}>Search</button>
            </form>
            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/signup?role=candidate" className={buttonClasses("outline", "default", "rounded-full")}>
                <Search className="h-4 w-4" aria-hidden /> I&apos;m looking for a job
              </Link>
              <Link href="/signup?role=recruiter" className={buttonClasses("outline", "default", "rounded-full")}>
                <Briefcase className="h-4 w-4" aria-hidden /> I&apos;m hiring
              </Link>
            </div>
          </div>
          <MatchPreview />
        </div>
      </section>

      {/* ---------- Companies marquee ---------- */}
      {companyNames.length >= 3 && (
        <section aria-labelledby="cos-h" className="-mt-8 space-y-4 sm:-mt-14">
          <h2 id="cos-h" className="text-muted-foreground text-center text-sm font-medium">
            {companyCount} companies hiring on Vouch
          </h2>
          <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <ul className="animate-marquee flex w-max gap-3">
              {[...companyNames, ...companyNames].map((n, i) => (
                <li
                  key={i}
                  aria-hidden={i >= companyNames.length || undefined}
                  className="border-border bg-card text-muted-foreground flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap"
                >
                  <span className="bg-primary-soft text-primary-soft-foreground flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold">
                    {n.slice(0, 1).toUpperCase()}
                  </span>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- Two audiences ---------- */}
      <section aria-label="Who Vouch is for" className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {audiences.map(({ id, icon: Icon, tag, title, points, cta, alt, tone }, idx) => (
          <article
            key={id}
            aria-labelledby={`${id}-h`}
            className={cn(
              "group relative flex flex-col gap-5 overflow-hidden rounded-3xl border p-6 sm:p-8",
              idx === 0
                ? "border-border bg-card shadow-(--shadow-card)"
                : "border-transparent bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 text-white shadow-(--shadow-lift)",
            )}
          >
            <LogoMark
              className={cn(
                "pointer-events-none absolute -right-10 -bottom-12 h-48 w-48 transition-transform duration-500 group-hover:-translate-y-2",
                idx === 0 ? "opacity-[0.06]" : "opacity-15 [--logo-accent:#f0abfc] [--logo-ink:#fff]",
              )}
            />
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-xl",
                  idx === 0 ? tone : "bg-white/15 text-white",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span
                className={cn(
                  "text-sm font-semibold tracking-wide uppercase",
                  idx === 0 ? "text-muted-foreground" : "text-violet-100",
                )}
              >
                {tag}
              </span>
            </div>
            <h2 id={`${id}-h`} className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h2>
            <ul className="space-y-3">
              {points.map((p) => (
                <li key={p} className="flex gap-3">
                  <CheckCircle2
                    className={cn("mt-0.5 h-5 w-5 shrink-0", idx === 0 ? "text-accent" : "text-teal-200")}
                    aria-hidden
                  />
                  <span className={idx === 0 ? "" : "text-violet-50"}>{p}</span>
                </li>
              ))}
            </ul>
            <div className="relative mt-auto flex flex-wrap gap-3 pt-2">
              <Link
                href={cta.href}
                className={
                  idx === 0
                    ? buttonClasses("default", "lg")
                    : buttonClasses("outline", "lg", "border-transparent bg-white text-violet-700 hover:bg-violet-50")
                }
              >
                {cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={alt.href}
                className={
                  idx === 0
                    ? buttonClasses("outline", "lg")
                    : buttonClasses("ghost", "lg", "text-white hover:bg-white/10 hover:text-white")
                }
              >
                {alt.label}
              </Link>
            </div>
          </article>
        ))}
      </section>

      {/* ---------- Latest jobs ---------- */}
      <section aria-labelledby="latest-h" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-primary text-sm font-semibold">Fresh today</p>
            <h2 id="latest-h" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Latest jobs
            </h2>
          </div>
          <Link href="/jobs" className={buttonClasses("ghost", "default", "text-primary")}>
            See all {count ? `${count} ` : ""}jobs <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <JobList jobs={latest} empty="No open roles yet — check back soon." />
      </section>

      {/* ---------- How it works: two timelines ---------- */}
      <section aria-labelledby="how-h" className="space-y-10">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <p className="text-primary text-sm font-semibold">How it works</p>
          <h2 id="how-h" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Simple for both sides. Everyone stays in control.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Steps heading="If you're looking for a job" icon={Search} steps={seekerSteps} />
          <Steps heading="If you're hiring" icon={Briefcase} steps={recruiterSteps} />
        </div>
      </section>

      {/* ---------- Trust bento ---------- */}
      <section aria-labelledby="promise-h" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="bg-foreground text-background relative overflow-hidden rounded-3xl p-7 md:row-span-2 md:p-8">
          <LogoMark className="pointer-events-none absolute -right-8 -bottom-10 h-52 w-52 opacity-20 [--logo-ink:var(--background)]" />
          <ShieldCheck className="h-8 w-8 text-violet-300 dark:text-violet-700" aria-hidden />
          <h2 id="promise-h" className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
            Built on trust.
          </h2>
          <p className="mt-3 max-w-sm opacity-80">
            Your data is yours. We only share what you approve, and you can export or delete everything at any time.
          </p>
          <Link
            href="/how-matching-works"
            className="mt-6 inline-flex items-center gap-1.5 font-medium text-violet-300 hover:underline dark:text-violet-700"
          >
            How matching works <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {promises.map(({ icon: Icon, title, text }, i) => (
          <div
            key={title}
            className={cn(
              "border-border bg-card rounded-3xl border p-6 shadow-(--shadow-card)",
              i === 2 && "md:col-span-2",
            )}
          >
            <span className="bg-primary-soft text-primary-soft-foreground inline-flex h-11 w-11 items-center justify-center rounded-xl">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{text}</p>
          </div>
        ))}
      </section>

      {/* ---------- CTA ---------- */}
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
        <LogoMark className="pointer-events-none absolute -top-10 -left-10 -z-10 h-56 w-56 opacity-15 [--logo-accent:#f0abfc] [--logo-ink:#fff]" />
        <LogoMark className="pointer-events-none absolute -right-14 -bottom-20 -z-10 h-72 w-72 -scale-x-100 opacity-10 [--logo-accent:#f0abfc] [--logo-ink:#fff]" />
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Ready when you are.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-violet-100">
          Create your free profile in minutes, or post a job and upload the resumes you already have.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup?role=candidate"
            className={buttonClasses("outline", "lg", "border-transparent bg-white text-violet-700 hover:bg-violet-50")}
          >
            Create my profile <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/signup?role=recruiter"
            className={buttonClasses("outline", "lg", "border-white/40 bg-transparent text-white hover:bg-white/10")}
          >
            Post a job
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Decorative product preview: what a match looks like for each side. */
function MatchPreview() {
  return (
    <div aria-hidden className="relative mx-auto h-[360px] w-full max-w-md select-none sm:h-[400px]">
      <div className="from-primary/25 absolute inset-6 -z-10 rounded-full bg-gradient-to-br to-fuchsia-400/20 blur-3xl" />
      {/* recruiter card (back) */}
      <div className="animate-float-slow border-border bg-card absolute top-0 right-0 w-[90%] rounded-2xl border p-4 shadow-(--shadow-lift) sm:w-[78%]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Best fits for your job</p>
          <span className="text-muted-foreground text-xs">Content Marketer</span>
        </div>
        <ul className="mt-3 space-y-2.5">
          {[
            ["A", 92, "said yes"],
            ["S", 86, "said yes"],
            ["M", 78, "asked"],
          ].map(([a, n, st]) => (
            <li key={a as string} className="flex items-center gap-2.5 text-xs">
              <span className="bg-primary-soft text-primary-soft-foreground flex h-7 w-7 items-center justify-center rounded-full font-semibold">
                {a}
              </span>
              <span className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <span className="bg-primary block h-full rounded-full" style={{ width: `${n}%` }} />
              </span>
              <span className="w-8 text-right font-semibold tabular-nums">{n}%</span>
              <span
                className={cn(
                  "w-14 rounded-full px-1.5 py-0.5 text-center text-[10px] font-medium",
                  st === "said yes"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {st}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* candidate card (front) */}
      <div className="animate-float border-border bg-card absolute bottom-6 left-0 w-[94%] rounded-2xl border p-5 shadow-(--shadow-lift) sm:w-[82%]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-sm font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-200">
            NT
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Content Marketer</p>
            <p className="text-muted-foreground text-xs">Northwind · Remote</p>
          </div>
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
            92% fit
          </span>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          <span className="text-foreground font-medium">Why:</span> Meta Ads, SEO · 5 years (3+ required)
        </p>
        <div className="mt-4 flex gap-2">
          <span className="bg-primary text-primary-foreground flex-1 rounded-lg py-2 text-center text-xs font-semibold">
            Yes, apply
          </span>
          <span className="border-border flex-1 rounded-lg border py-2 text-center text-xs font-medium">
            Not for me
          </span>
        </div>
      </div>
      {/* floating chips */}
      <span className="border-border bg-card absolute top-[46%] right-0 hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-(--shadow-card) sm:-right-4 sm:flex">
        <Lock className="text-primary h-3.5 w-3.5" /> Shared only after a yes
      </span>
      <span className="border-border bg-card absolute bottom-0 left-[30%] flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-(--shadow-card)">
        <BellRing className="text-accent h-3.5 w-3.5" /> New match
      </span>
    </div>
  );
}

function Steps({
  heading,
  icon: HeadIcon,
  steps,
}: {
  heading: string;
  icon: LucideIcon;
  steps: { icon: LucideIcon; title: string; text: string }[];
}) {
  return (
    <div className="border-border bg-card rounded-3xl border p-6 shadow-(--shadow-card) sm:p-8">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <HeadIcon className="text-primary h-5 w-5" aria-hidden /> {heading}
      </h3>
      <ol className="relative mt-6 space-y-6 before:absolute before:top-2 before:bottom-2 before:left-5 before:w-px before:bg-gradient-to-b before:from-violet-400 before:to-transparent">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative flex gap-4">
            <span className="bg-card ring-primary/20 text-primary relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="pt-1">
              <p className="font-semibold">
                <span className="text-primary mr-2 text-xs font-bold tracking-wider uppercase">0{i + 1}</span>
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
