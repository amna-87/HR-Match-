import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { approvePublicJob, moderateJob } from "../actions";
import { sourceLabel } from "@/components/job-source";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobSourceBadge } from "@/components/job-source";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminJobs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin");
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      "id, title, status, source_type, source_name, source_url, source_company_name, published_at, expires_at, company:companies!jobs_company_id_fkey(name)",
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: requests } = await supabase
    .from("jobs")
    .select(
      "id, title, status, source_type, origin, source_name, source_url, source_company_name, apply_method, public_requested_at, owner:companies!jobs_owner_workspace_id_fkey(name)",
    )
    .eq("visibility", "workspace")
    .not("public_requested_at", "is", null)
    .order("public_requested_at");
  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        eyebrow="Admin"
        title="Job moderation"
        description="Publish, pause or remove any job on Vouch, and answer requests to show workspace jobs on the public board."
        actions={
          <Link href="/admin/sourced/new" className={buttonClasses()}>
            Add sourced job
          </Link>
        }
      />
      {(requests ?? []).length > 0 && (
        <section aria-labelledby="req-h" className="space-y-2">
          <h2 id="req-h" className="text-lg font-semibold">
            Requests for the public board ({requests!.length})
          </h2>
          <ul className="divide-border divide-y rounded-lg border border-amber-400 bg-amber-50/50 dark:bg-amber-950/30">
            {requests!.map((j) => (
              <li key={j.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{j.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {j.source_company_name ?? "Hiring directly"} · {sourceLabel(j)} · apply by {j.apply_method} · from
                    workspace {(j.owner as unknown as { name: string } | null)?.name ?? "—"} · requested{" "}
                    {formatDate(j.public_requested_at!)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={approvePublicJob}>
                    <input type="hidden" name="id" value={j.id} />
                    <Button size="sm">Put on public board</Button>
                  </form>
                  <form action={approvePublicJob}>
                    <input type="hidden" name="id" value={j.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Button size="sm" variant="outline">
                      Decline
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="divide-border border-border bg-card divide-y rounded-lg border">
        {(jobs ?? []).map((j) => (
          <li key={j.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                {j.title}
              </Link>{" "}
              <JobSourceBadge job={j} /> <Badge>{j.status}</Badge>
              <p className="text-muted-foreground text-xs">
                {(j.company as unknown as { name: string } | null)?.name ?? j.source_company_name ?? "—"}
                {j.source_type === "sourced" && <> · from {j.source_name}</>} ·{" "}
                {j.status === "draft" ? "not published yet" : `published ${formatDate(j.published_at)}`} · expires{" "}
                {formatDate(j.expires_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              {(j.status === "draft" || j.status === "paused") && (
                <form action={moderateJob}>
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="status" value="published" />
                  <Button size="sm">Publish</Button>
                </form>
              )}
              {j.status !== "removed" ? (
                <form action={moderateJob} className="flex min-w-0 flex-1 gap-2 lg:flex-none">
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="status" value="removed" />
                  <label htmlFor={`reason-${j.id}`} className="sr-only">
                    Reason
                  </label>
                  <input
                    id={`reason-${j.id}`}
                    name="reason"
                    placeholder="Reason"
                    className="border-border bg-background h-8 w-full min-w-0 rounded-md border px-2 text-sm lg:w-44"
                  />
                  <Button size="sm" variant="destructive">
                    Remove
                  </Button>
                </form>
              ) : (
                <form action={moderateJob}>
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="status" value="paused" />
                  <Button size="sm" variant="outline">
                    Restore as paused
                  </Button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
