import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Plus,
  TrendingUp,
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
import { ActivityChart, Donut, Funnel, Ring, Sparkline } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
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

const ACCENTS = {
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
} as const;

function Kpi({
  href,
  icon: Icon,
  label,
  value,
  note,
  delta,
  trend,
  accent,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  note: React.ReactNode;
  delta?: number;
  trend?: number[];
  accent: keyof typeof ACCENTS;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group border-border bg-card hover:border-primary/40 relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border p-4 shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:shadow-(--shadow-lift) sm:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", ACCENTS[accent])}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {delta != null && delta > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <TrendingUp className="h-3 w-3" aria-hidden />+{delta}
            <span className="sr-only"> this week</span>
          </span>
        ) : (
          <ArrowUpRight
            className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-colors"
            aria-hidden
          />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value.toLocaleString("en-GB")}</p>
        <p className="text-muted-foreground mt-1 truncate text-xs">{note}</p>
      </div>
      {trend && <Sparkline values={trend} className="-mx-1 mt-auto -mb-1" />}
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
          <h2 className="font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const STATUS_TONE = {
  published: "success",
  draft: "muted",
  paused: "warning",
  closed: "muted",
  expired: "muted",
  removed: "danger",
} as const;

export default async function AdminHome() {
  const { supabase, user } = await requireRole("admin");
  const [{ data, error }, { data: recent }] = await Promise.all([
    supabase.rpc("admin_dashboard"),
    supabase
      .from("jobs")
      .select(
        "id, title, status, source_type, source_company_name, created_at, company:companies!jobs_company_id_fkey(name)",
      )
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
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
  const week = (k: "jobs" | "candidates" | "recruiters" | "matches") => d.daily.slice(-7).reduce((t, x) => t + x[k], 0);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const alerts = [
    d.open_takedowns > 0 && {
      href: "/admin/takedowns",
      text: plural(d.open_takedowns, "open takedown request"),
    },
    d.jobs.awaiting_public_review > 0 && {
      href: "/admin/jobs",
      text: `${plural(d.jobs.awaiting_public_review, "job")} waiting for public board review`,
    },
    notPosted > 0 && { href: "/admin/jobs", text: `${plural(notPosted, "job")} not posted yet` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 p-6 text-white shadow-(--shadow-lift) sm:p-8">
        <LogoMark className="pointer-events-none absolute -right-10 -bottom-16 -z-10 h-64 w-64 opacity-15 [--logo-accent:#f0abfc] [--logo-ink:#fff] sm:h-80 sm:w-80" />
        <div className="pointer-events-none absolute -top-24 -left-24 -z-10 h-64 w-64 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-violet-100">
              <CalendarDays className="h-4 w-4" aria-hidden /> {today}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
            </h1>
            <p className="mt-1 max-w-xl text-violet-100">Here&apos;s what is happening on Vouch.</p>
            <div className="mt-4 flex flex-wrap gap-2">
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
                  <Sparkles className="h-4 w-4" aria-hidden /> All clear: nothing needs your attention
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/sourced/new"
              className={buttonClasses(
                "outline",
                "default",
                "border-transparent bg-white text-violet-700 hover:bg-violet-50",
              )}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add a job
            </Link>
            <Link
              href="/admin/jobs"
              className={buttonClasses(
                "outline",
                "default",
                "border-white/30 bg-white/10 text-white hover:bg-white/20",
              )}
            >
              Moderate jobs
            </Link>
            <Link
              href="/admin/users"
              className={buttonClasses(
                "outline",
                "default",
                "border-white/30 bg-white/10 text-white hover:bg-white/20",
              )}
            >
              Users
            </Link>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["New jobs this week", week("jobs")],
            ["New candidates this week", week("candidates")],
            ["New HRs this week", week("recruiters")],
            ["New matches this week", week("matches")],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
              <dd className="text-2xl font-semibold tabular-nums">{(v as number).toLocaleString("en-GB")}</dd>
              <dt className="text-xs text-violet-100">{k}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Kpi
          href="/admin/jobs"
          icon={Briefcase}
          accent="violet"
          label="Jobs posted"
          value={d.jobs.published}
          note={`${d.jobs.public} on the public board`}
          delta={week("jobs")}
          trend={daily("jobs").map((x) => x.value)}
        />
        <Kpi
          href="/admin/jobs"
          icon={FileClock}
          accent="amber"
          label="Not posted yet"
          value={notPosted}
          note={`${d.jobs.draft} drafts · ${d.jobs.paused} paused`}
        />
        <Kpi
          href="/admin/users"
          icon={Sparkles}
          accent="pink"
          label="Candidates matched"
          value={d.candidates.matched}
          note={`of ${plural(d.candidates.accounts, "candidate")}`}
          delta={week("matches")}
          trend={daily("matches").map((x) => x.value)}
        />
        <Kpi
          href="/admin/users"
          icon={UserCheck}
          accent="teal"
          label="Candidates logged in"
          value={d.candidates.logged_in_ever}
          note={`${d.candidates.logged_in_7d} in the last 7 days`}
          delta={d.candidates.new_7d}
        />
        <Kpi
          href="/admin/users"
          icon={LogIn}
          accent="sky"
          label="HRs logged in"
          value={d.recruiters.logged_in_ever}
          note={`${d.recruiters.logged_in_7d} in the last 7 days`}
          delta={d.recruiters.new_7d}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Activity + job status */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <Panel title="Activity" description="New on Vouch each day" className="lg:col-span-2">
          <ActivityChart
            series={[
              { key: "jobs", label: "Jobs", data: daily("jobs") },
              { key: "candidates", label: "Candidates", data: daily("candidates") },
              { key: "recruiters", label: "HRs", data: daily("recruiters") },
              { key: "matches", label: "Matches", data: daily("matches") },
            ]}
          />
        </Panel>
        <Panel
          title="Jobs by status"
          description={`${plural(d.jobs.total, "job")} in total`}
          action={
            <Link href="/admin/jobs" className={buttonClasses("ghost", "sm", "text-primary")}>
              Moderate
            </Link>
          }
        >
          <Donut
            label="jobs"
            parts={[
              { label: "Posted", value: d.jobs.published },
              { label: "Draft", value: d.jobs.draft },
              { label: "Paused", value: d.jobs.paused },
              { label: "Closed", value: d.jobs.closed },
              { label: "Removed", value: d.jobs.removed },
            ]}
          />
          <dl className="border-border mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
            {[
              ["Public board", d.jobs.public],
              ["Workspace only", d.jobs.workspace_only],
              ["By employers", d.jobs.employer],
              ["Other sources", d.jobs.sourced],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-muted-foreground text-xs">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {/* People */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <Panel title="Who logged in" description="Signed in at least once">
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
        <Panel
          title="Candidate journey"
          description="From sign-up to applying; % of all candidate accounts"
          className="lg:col-span-2"
        >
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
      </div>

      {/* Recent jobs + workspaces */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <Panel
          title="Latest jobs"
          description="The newest jobs added to Vouch"
          className="lg:col-span-2"
          action={
            <Link href="/admin/jobs" className={buttonClasses("ghost", "sm", "text-primary")}>
              See all
            </Link>
          }
        >
          <ul className="divide-border -my-2 divide-y">
            {(recent ?? []).map((j) => {
              const company =
                (j.company as unknown as { name: string } | null)?.name ?? j.source_company_name ?? "Hiring directly";
              return (
                <li key={j.id} className="flex items-center gap-3 py-3">
                  <span className="bg-primary-soft text-primary-soft-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold">
                    {company.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/jobs/${j.id}`}
                      prefetch={false}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {j.title}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {company} · {j.source_type === "sourced" ? "other source" : "employer"} ·{" "}
                      {formatDate(j.created_at)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[j.status as keyof typeof STATUS_TONE] ?? "muted"}>{j.status}</Badge>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Most active workspaces" description="Open jobs and talent pool size">
          {d.top_workspaces.length ? (
            <ol className="divide-border -my-2 divide-y">
              {d.top_workspaces.map((w, i) => (
                <li key={w.name + i} className="flex items-center gap-3 py-2.5 text-sm">
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
            introduced
          </p>
        </Panel>
      </div>

      {/* Tools */}
      <section aria-labelledby="tools-h" className="space-y-3">
        <h2 id="tools-h" className="font-semibold tracking-tight">
          Admin tools
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TOOLS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="border-border bg-card hover:border-primary/40 hover:text-primary flex h-full flex-col items-center gap-2 rounded-2xl border p-4 text-center text-sm font-medium shadow-(--shadow-card) transition-colors"
              >
                <span className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
