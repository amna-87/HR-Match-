import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, Circle, FileUp, Handshake, Rss, Send, Users } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    },
    { icon: Briefcase, label: "Open jobs", value: `${u.open_jobs}`, sub: "", href: "#jobs" },
    {
      icon: Send,
      label: "Messages today",
      value: `${u.messages_today}`,
      sub: `of ${u.daily_send_cap}`,
      href: "/recruiter/company",
    },
    {
      icon: Handshake,
      label: "Introduction requests",
      value: `${pendingIntros}`,
      sub: "waiting for you",
      href: "/recruiter/talent",
    },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-semibold">Recruiting</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/recruiter/talent" className={buttonClasses("outline")}>
            <FileUp className="h-4 w-4" aria-hidden /> Upload resumes
          </Link>
          <Link href="/recruiter/sources" className={buttonClasses("outline")}>
            <Rss className="h-4 w-4" aria-hidden /> Import jobs
          </Link>
          <Link href="/recruiter/jobs/new" className={buttonClasses()}>
            Post a job
          </Link>
        </div>
      </div>

      {processing > 0 && (
        <p className="bg-primary-soft text-primary-soft-foreground rounded-xl px-4 py-3 text-sm">
          {processing} resume{processing === 1 ? " is" : "s are"} being read in the background.{" "}
          <Link href="/recruiter/talent" className="underline">
            See progress
          </Link>
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, sub, href }) => (
          <li key={label}>
            <Link
              href={href}
              className="border-border bg-card hover:border-primary/40 flex h-full flex-col gap-2 rounded-2xl border p-4 shadow-(--shadow-card) transition-colors"
            >
              <Icon className="text-primary h-5 w-5" aria-hidden />
              <span className="text-2xl font-semibold">
                {value} <span className="text-muted-foreground text-sm font-normal">{sub}</span>
              </span>
              <span className="text-muted-foreground text-sm">{label}</span>
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
