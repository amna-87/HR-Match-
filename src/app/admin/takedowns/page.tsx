import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { resolveTakedown } from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Flash } from "@/components/flash";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminTakedowns({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { supabase } = await requireRole("admin");
  const { data: reqs } = await supabase
    .from("takedown_requests")
    .select("*, job:jobs(id, title, status, source_name)")
    .order("status")
    .order("created_at", { ascending: false });
  return (
    <div className="space-y-4">
      <Flash searchParams={await searchParams} />
      <h1 className="text-2xl font-semibold">Takedown requests</h1>
      {(reqs ?? []).map((r) => {
        const job = r.job as { id: string; title: string; status: string; source_name: string | null } | null;
        return (
          <Card key={r.id}>
            <CardContent className="space-y-2 pt-5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.status === "open" ? "warning" : "muted"}>{r.status}</Badge>
                <span>{formatDate(r.created_at)}</span>
                {job ? (
                  <Link className="underline" href={`/jobs/${job.id}`}>{job.title} ({job.status})</Link>
                ) : (
                  <span>{r.job_reference ?? "No listing linked"}</span>
                )}
              </div>
              <p><strong>From:</strong> {r.requester_contact}</p>
              <p className="whitespace-pre-line"><strong>Reason:</strong> {r.reason}</p>
              {r.resolution_note && <p><strong>Resolution:</strong> {r.resolution_note}</p>}
              {r.status === "open" && (
                <form action={resolveTakedown} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label htmlFor={`note-${r.id}`} className="sr-only">Note</label>
                  <Input id={`note-${r.id}`} name="note" placeholder="Resolution note" className="max-w-xs" />
                  <Button size="sm" name="decision" value="remove" variant="destructive">{job ? "Remove listing" : "Mark resolved"}</Button>
                  <Button size="sm" name="decision" value="reject" variant="outline">Reject</Button>
                </form>
              )}
            </CardContent>
          </Card>
        );
      })}
      {!reqs?.length && <p className="text-muted-foreground">No requests.</p>}
    </div>
  );
}
