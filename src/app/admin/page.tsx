import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Globe,
  Handshake,
  MessageSquareLock,
  ScrollText,
  Send,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

const STATS: { key: string; label: string; icon: LucideIcon; href?: string }[] = [
  { key: "users", label: "Users", icon: Users, href: "/admin/users" },
  { key: "candidates", label: "Candidates", icon: UserCheck, href: "/admin/users" },
  { key: "recruiters", label: "Recruiters", icon: Handshake, href: "/admin/users" },
  { key: "jobs_published", label: "Published jobs", icon: Briefcase, href: "/admin/jobs" },
  { key: "jobs_sourced", label: "Published sourced jobs", icon: Globe, href: "/admin/jobs" },
  { key: "matches", label: "Matches", icon: Sparkles },
  { key: "approvals", label: "Approvals", icon: CheckCircle2 },
  { key: "applications", label: "Applications", icon: Send },
  { key: "open_takedowns", label: "Open takedown requests", icon: ShieldAlert, href: "/admin/takedowns" },
];

const TOOLS: { href: string; label: string; text: string; icon: LucideIcon }[] = [
  {
    href: "/admin/jobs",
    label: "Job moderation",
    text: "Publish, pause or remove jobs; answer public board requests.",
    icon: ClipboardList,
  },
  { href: "/admin/users", label: "Users", text: "Find accounts, change roles and suspend abuse.", icon: Users },
  { href: "/admin/takedowns", label: "Takedowns", text: "Requests to remove a listing.", icon: FileWarning },
  { href: "/admin/audit", label: "Audit log", text: "Every consent, access and moderation event.", icon: ScrollText },
  {
    href: "/admin/feedback",
    label: "Read feedback",
    text: "Read internal feedback, with a logged reason.",
    icon: MessageSquareLock,
  },
];

export default async function AdminHome() {
  const { supabase } = await requireRole("admin");
  const { data } = await supabase.rpc("admin_counts");
  const counts = (data ?? {}) as Record<string, number>;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Platform overview"
        description="Everything happening on Vouch at a glance. As an admin you can also use every recruiter tool."
        actions={
          <>
            <Link href="/recruiter" className={buttonClasses("outline")}>
              Recruiter tools
            </Link>
            <Link href="/admin/sourced/new" className={buttonClasses()}>
              Add sourced job
            </Link>
          </>
        }
      />
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {STATS.map(({ key, label, icon: Icon, href }) => {
          const n = counts[key] ?? 0;
          const warn = key === "open_takedowns" && n > 0;
          const inner = (
            <>
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  warn
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-semibold tabular-nums sm:text-3xl">
                  {n.toLocaleString("en-GB")}
                </span>
                <span className="text-muted-foreground block text-xs sm:text-sm">{label}</span>
              </span>
            </>
          );
          const cls =
            "border-border bg-card flex h-full items-center gap-3 rounded-2xl border p-4 shadow-(--shadow-card) sm:gap-4 sm:p-5";
          return (
            <li key={key}>
              {href ? (
                <Link href={href} className={cn(cls, "hover:border-primary/40 transition-colors")}>
                  {inner}
                </Link>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="tools-h" className="space-y-3">
        <h2 id="tools-h" className="text-xl font-semibold tracking-tight">
          Admin tools
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(({ href, label, text, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="border-border bg-card hover:border-primary/40 group flex h-full items-start gap-3 rounded-2xl border p-4 transition-colors"
              >
                <Icon className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
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
