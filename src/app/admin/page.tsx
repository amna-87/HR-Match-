import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  ClipboardList,
  FileClock,
  FileWarning,
  LogIn,
  MessageSquareLock,
  ScrollText,
  Sparkles,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { buttonClasses } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { DailyBars, Funnel, Ring, Sparkline, StackedBar } from "@/components/charts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin dashboard" };

type Dash = {
  jobs: Record<
    | "total"
    | "published"
    | "draft"
    | "paused"
    | "closed"
    | "removed"
    | "public"
    | "workspace_only"
    | "employer"
    | "sourced"
    | "from_feeds"
    | "awaiting_public_review"
    | "new_7d",
    number
  >;
  candidates: Record<
    | "accounts"
    | "with_resume"
    | "matched"
    | "approved"
    | "applied"
    | "logged_in_ever"
    | "logged_in_7d"
    | "logged_in_30d"
    | "new_7d",
    number
  >;
  recruiters: Record<
    "accounts" | "workspaces" | "logged_in_ever" | "logged_in_7d" | "logged_in_30d" | "new_7d",
    number
  >;
  pool: Record<"profiles" | "shared" | "introductions" | "introduced", number>;
  matching: Record<"matches" | "waiting" | "approved" | "declined" | "applications" | "hired", number>;
  open_takedowns: number;
  daily: { day: string; jobs: number; candidates: number; recruiters: number; matches: number }[];
  top_workspaces: { name: string; open_jobs: number; pool: number }[];
};

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

const TOOLS: { href: string; label: string; text: string; icon: LucideIcon }[] = [
  { href: "/admin/jobs", label: "Job moderation", text: "Publish, pause or remove jobs.", icon: ClipboardList },
  { href: "/admin/users", label: "Users", text: "Find accounts and suspend abuse.", icon: Users },
  { href: "/admin/takedowns", label: "Takedowns", text: "Requests to remove a listing.", icon: FileWarning },
  { href: "/admin/audit", label: "Audit log", text: "Consent, access and moderation events.", icon: ScrollText },
  { href: "/admin/feedback", label: "Read feedback", text: "With a logged reason.", icon: MessageSquareLock },
  { href: "/recruiter", label: "Recruiter tools", text: "Post jobs, upload resumes, feeds.", icon: Briefcase },
];

function Kpi({
  href,
  icon: Icon,
  label,
  value,
  note,
  trend,
  className,
}: {
  className?: string;
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  note: React.ReactNode;
  trend?: number[];
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group border-border bg-card hover:border-primary/40 relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border p-4 shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-lift) sm:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-xl">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <ArrowUpRight
          className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-colors"
          aria-hidden
        />
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value.toLocaleString("en-GB")}</p>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{note}</p>
      </div>
      {trend && <Sparkline values={trend} className="-mx-1 mt-auto" />}
    </Link>
  );
}

function Panel({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={cn("border-border bg-card min-w-0 rounded-2xl border p-5 shadow-(--shadow-card) sm:p-6", className)}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function AdminHome() {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        Could not load the dashboard: {error?.message ?? "no data"}
      </p>
    );
  }
  const d = data as Dash;
  const notPosted = d.jobs.draft + d.jobs.paused;
  const daily = (k: "jobs" | "candidates" | "recruiters" | "matches") =>
    d.daily.map((x) => ({ day: x.day, value: x[k] }));
  const alerts = [
    d.open_takedowns > 0 && {
      href: "/admin/takedowns",
      text: `${d.open_takedowns} open takedown request${d.open_takedowns === 1 ? "" : "s"}`,
    },
    d.jobs.awaiting_public_review > 0 && {
      href: "/admin/jobs",
      text: `${d.jobs.awaiting_public_review} job${d.jobs.awaiting_public_review === 1 ? "" : "s"} waiting for public board review`,
    },
    notPosted > 0 && { href: "/admin/jobs", text: `${notPosted} job${notPosted === 1 ? "" : "s"} not posted yet` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 p-6 text-white shadow-(--shadow-lift) sm:p-8">
        <LogoMark className="pointer-events-none absolute -right-10 -bottom-16 -z-10 h-64 w-64 opacity-15 [--logo-accent:#f0abfc] [--logo-ink:#fff] sm:h-80 sm:w-80" />
        <div className="pointer-events-none absolute -top-24 -left-24 -z-10 h-64 w-64 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <p className="text-sm font-medium text-violet-100">Admin dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back 👋</h1>
        <p className="mt-1 max-w-xl text-violet-100">
          {d.jobs.published} jobs live, {d.candidates.accounts} candidates and {d.recruiters.accounts} HR accounts on
          Vouch. {d.jobs.new_7d} new jobs and {d.candidates.new_7d + d.recruiters.new_7d} new sign-ups this week.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {alerts.length ? (
            alerts.map((a) => (
              <Link
                key={a.text}
                href={a.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur transition-colors hover:bg-white/25"
              >
                <AlertTriangle className="h-4 w-4 text-amber-200" aria-hidden /> {a.text}
              </Link>
            ))
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4" aria-hidden /> Nothing needs your attention
            </span>
          )}
        </div>
      </section>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Kpi
          href="/admin/jobs"
          icon={Briefcase}
          label="Jobs posted"
          value={d.jobs.published}
          note={`${d.jobs.public} on the public board`}
          trend={daily("jobs").map((x) => x.value)}
        />
        <Kpi
          href="/admin/jobs"
          icon={FileClock}
          label="Not posted yet"
          value={notPosted}
          note={`${d.jobs.draft} drafts · ${d.jobs.paused} paused`}
        />
        <Kpi
          href="/admin/users"
          icon={Sparkles}
          label="Candidates matched"
          value={d.candidates.matched}
          note={`of ${d.candidates.accounts} candidates`}
          trend={daily("matches").map((x) => x.value)}
        />
        <Kpi
          href="/admin/users"
          icon={UserCheck}
          label="Candidates logged in"
          value={d.candidates.logged_in_ever}
          note={`${d.candidates.logged_in_7d} in the last 7 days`}
        />
        <Kpi
          href="/admin/users"
          icon={LogIn}
          label="HRs logged in"
          className="col-span-2 lg:col-span-1"
          value={d.recruiters.logged_in_ever}
          note={`${d.recruiters.logged_in_7d} in the last 7 days`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <Panel
          title="Jobs"
          description={`${d.jobs.total} jobs in total, by status`}
          className="lg:col-span-2"
          action={
            <Link href="/admin/jobs" className={buttonClasses("outline", "sm")}>
              Moderate
            </Link>
          }
        >
          <StackedBar
            parts={[
              { label: "Posted", value: d.jobs.published },
              { label: "Draft", value: d.jobs.draft },
              { label: "Paused", value: d.jobs.paused },
              { label: "Closed", value: d.jobs.closed },
              { label: "Removed", value: d.jobs.removed },
            ]}
          />
          <dl className="border-border mt-6 grid grid-cols-2 gap-4 border-t pt-5 text-sm sm:grid-cols-4">
            {[
              ["Public board", d.jobs.public],
              ["Workspace only", d.jobs.workspace_only],
              ["Posted by employers", d.jobs.employer],
              ["From other sources", d.jobs.sourced],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-muted-foreground text-xs">{k}</dt>
                <dd className="text-xl font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Who logged in" description="People who have signed in at least once">
          <div className="space-y-5">
            <Ring
              value={d.candidates.logged_in_ever}
              of={d.candidates.accounts}
              label="Candidates"
              sub={`${d.candidates.logged_in_30d} in 30 days · ${d.candidates.logged_in_7d} in 7 days`}
            />
            <Ring
              value={d.recruiters.logged_in_ever}
              of={d.recruiters.accounts}
              label="HRs / recruiters"
              sub={`${d.recruiters.logged_in_30d} in 30 days · ${d.recruiters.logged_in_7d} in 7 days`}
            />
            <p className="text-muted-foreground border-border border-t pt-4 text-xs">
              {plural(d.recruiters.workspaces, "workspace")} · {plural(d.pool.profiles, "resume")} in talent pools
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel title="Candidate journey" description="From sign-up to applying; % of all candidate accounts">
          <Funnel
            steps={[
              { label: "Candidate accounts", value: d.candidates.accounts },
              { label: "Uploaded a resume", value: d.candidates.with_resume },
              { label: "Matched to a job", value: d.candidates.matched },
              { label: "Said yes to a match", value: d.candidates.approved },
              { label: "Applied", value: d.candidates.applied },
            ]}
          />
          <p className="text-muted-foreground mt-5 text-xs">
            {plural(d.matching.matches, "match", "matches")} made · {d.matching.waiting} waiting for an answer ·{" "}
            {d.matching.declined} declined · {d.matching.hired} hired
          </p>
        </Panel>

        <Panel title="Most active workspaces" description="By open jobs and talent pool size">
          {d.top_workspaces.length ? (
            <ol className="divide-border divide-y">
              {d.top_workspaces.map((w, i) => (
                <li key={w.name + i} className="flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    <span className="text-foreground font-semibold">{w.open_jobs}</span>{" "}
                    {w.open_jobs === 1 ? "job" : "jobs"} ·{" "}
                    <span className="text-foreground font-semibold">{w.pool}</span>{" "}
                    {w.pool === 1 ? "resume" : "resumes"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">No workspaces yet.</p>
          )}
          <p className="text-muted-foreground border-border mt-5 border-t pt-4 text-xs">
            {plural(d.pool.introductions, "introduction request")} · {plural(d.pool.introduced, "person", "people")}{" "}
            introduced · {plural(d.pool.shared, "profile")} shared anonymously
          </p>
        </Panel>
      </div>

      <section aria-labelledby="trend-h" className="space-y-3">
        <h2 id="trend-h" className="text-lg font-semibold tracking-tight">
          Last 30 days
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <DailyBars label="New jobs" data={daily("jobs")} />
          <DailyBars label="New candidates" data={daily("candidates")} />
          <DailyBars label="New HR accounts" data={daily("recruiters")} />
          <DailyBars label="New matches" data={daily("matches")} />
        </div>
      </section>

      <section aria-labelledby="tools-h" className="space-y-3">
        <h2 id="tools-h" className="text-lg font-semibold tracking-tight">
          Admin tools
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(({ href, label, text, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="border-border bg-card hover:border-primary/40 group flex h-full items-center gap-3 rounded-2xl border p-4 transition-colors"
              >
                <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="group-hover:text-primary block font-medium">{label}</span>
                  <span className="text-muted-foreground block text-sm">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
