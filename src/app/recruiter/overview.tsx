import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, Circle, FileUp, Handshake, Rss, Send, Users } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/logo";

type Usage = {
  pool_size: number;
  pool_cap: number;
  messages_today: number;
  daily_send_cap: number;
  sources: number;
  open_jobs: number;
};

/** Recruiter home: quick numbers, a getting-started checklist and shortcuts. */
export function RecruiterOverview({
  name,
  usage,
  pendingIntros,
  sharing,
  processing,
}: {
  name: string;
  usage: Usage | null;
  pendingIntros: number;
  sharing: boolean;
  processing: number;
}) {
  const u = usage ?? { pool_size: 0, pool_cap: 0, messages_today: 0, daily_send_cap: 0, sources: 0, open_jobs: 0 };
  const steps = [
    { done: u.pool_size > 0, label: "Upload resumes to your talent pool", href: "/recruiter/talent", cta: "Upload" },
    {
      done: u.open_jobs > 0,
      label: "Add a job: post one, paste one or import a spreadsheet",
      href: "/recruiter/sources",
      cta: "Add jobs",
    },
    {
      done: u.pool_size > 0 && u.open_jobs > 0,
      label: "Open a job to see the best people from your pool",
      href: "#jobs",
      cta: "See jobs",
    },
    {
      done: sharing,
      label: "Optional: share anonymous cards to get introductions",
      href: "/recruiter/company",
      cta: "Settings",
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  const stats = [
    {
      icon: Users,
      label: "In your talent pool",
      value: `${u.pool_size}`,
      sub: `of ${u.pool_cap}`,
      href: "/recruiter/talent",
      cap: u.pool_cap,
    },
    { icon: Briefcase, label: "Open jobs", value: `${u.open_jobs}`, sub: "", href: "#jobs", cap: 0 },
    {
      icon: Send,
      label: "Messages today",
      value: `${u.messages_today}`,
      sub: `of ${u.daily_send_cap}`,
      href: "/recruiter/company",
      cap: u.daily_send_cap,
    },
    {
      icon: Handshake,
      label: "Introduction requests",
      value: `${pendingIntros}`,
      sub: "waiting",
      href: "/recruiter/talent",
      cap: 0,
    },
  ];
  return (
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 p-6 text-white shadow-(--shadow-lift) sm:p-8">
        <LogoMark className="pointer-events-none absolute -right-10 -bottom-16 -z-10 h-60 w-60 opacity-15 [--logo-accent:#f0abfc] [--logo-ink:#fff] sm:h-72 sm:w-72" />
        <div className="pointer-events-none absolute -top-24 -left-20 -z-10 h-60 w-60 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <p className="text-sm font-medium text-violet-100">Recruiting workspace</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
        <p className="mt-1 max-w-xl text-violet-100">
          {u.open_jobs} open {u.open_jobs === 1 ? "job" : "jobs"} and {u.pool_size}{" "}
          {u.pool_size === 1 ? "person" : "people"} in your talent pool.
          {pendingIntros > 0
            ? ` ${pendingIntros} introduction ${pendingIntros === 1 ? "request is" : "requests are"} waiting for you.`
            : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/recruiter/jobs/new"
            className={buttonClasses(
              "outline",
              "default",
              "border-transparent bg-white text-violet-700 hover:bg-violet-50",
            )}
          >
            <Briefcase className="h-4 w-4" aria-hidden /> Post a job
          </Link>
          <Link
            href="/recruiter/talent"
            className={buttonClasses("outline", "default", "border-white/30 bg-white/10 text-white hover:bg-white/20")}
          >
            <FileUp className="h-4 w-4" aria-hidden /> Upload resumes
          </Link>
          <Link
            href="/recruiter/sources"
            className={buttonClasses("outline", "default", "border-white/30 bg-white/10 text-white hover:bg-white/20")}
          >
            <Rss className="h-4 w-4" aria-hidden /> Import jobs
          </Link>
        </div>
      </section>

      {processing > 0 && (
        <p className="bg-primary-soft text-primary-soft-foreground rounded-xl px-4 py-3 text-sm">
          {processing} resume{processing === 1 ? " is" : "s are"} being read in the background.{" "}
          <Link href="/recruiter/talent" className="underline">
            See progress
          </Link>
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, sub, href, cap }) => (
          <li key={label}>
            <Link
              href={href}
              className="group border-border bg-card hover:border-primary/40 flex h-full flex-col gap-3 rounded-2xl border p-4 shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-lift) sm:p-5"
            >
              <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-xl">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span>
                <span className="block text-3xl font-semibold tracking-tight tabular-nums">
                  {value} <span className="text-muted-foreground text-sm font-normal">{sub}</span>
                </span>
                <span className="text-muted-foreground text-sm">{label}</span>
              </span>
              {cap ? (
                <span className="bg-muted mt-auto block h-1.5 overflow-hidden rounded-full" aria-hidden>
                  <span
                    className="bg-primary block h-full rounded-full"
                    style={{ width: `${Math.min(100, (Number(value) / cap) * 100)}%` }}
                  />
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {left > 0 && (
        <section
          aria-labelledby="start-h"
          className="border-border bg-card rounded-2xl border p-5 shadow-(--shadow-card)"
        >
          <h2 id="start-h" className="font-semibold">
            Getting started{" "}
            <span className="text-muted-foreground font-normal">
              ({steps.length - left} of {steps.length} done)
            </span>
          </h2>
          <ol className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex flex-wrap items-center justify-between gap-2">
                <span className={cn("flex items-center gap-2 text-sm", s.done && "text-muted-foreground line-through")}>
                  {s.done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Done" />
                  ) : (
                    <Circle className="text-muted-foreground h-5 w-5" aria-label="To do" />
                  )}
                  {s.label}
                </span>
                {!s.done && (
                  <Link href={s.href} className="text-primary inline-flex items-center gap-1 text-sm font-medium">
                    {s.cta} <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
