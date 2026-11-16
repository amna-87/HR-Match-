import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { moderateJob } from "../actions";
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
      "id, title, status, source_type, source_name, source_url, source_company_name, published_at, expires_at, company:companies(name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    <div className="space-y-4">
      <Flash searchParams={sp} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Job moderation</h1>
        <Link href="/admin/sourced/new" className={buttonClasses()}>
          Add sourced job
        </Link>
      </div>
      <ul className="divide-border border-border bg-card divide-y rounded-lg border">
        {(jobs ?? []).map((j) => (
          <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
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
            <div className="flex gap-2">
              {(j.status === "draft" || j.status === "paused") && (
                <form action={moderateJob}>
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="status" value="published" />
                  <Button size="sm">Publish</Button>
                </form>
              )}
              {j.status !== "removed" ? (
                <form action={moderateJob} className="flex gap-2">
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="status" value="removed" />
                  <label htmlFor={`reason-${j.id}`} className="sr-only">
                    Reason
                  </label>
                  <input
                    id={`reason-${j.id}`}
                    name="reason"
                    placeholder="Reason"
                    className="border-border bg-background h-8 rounded-md border px-2 text-sm"
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
