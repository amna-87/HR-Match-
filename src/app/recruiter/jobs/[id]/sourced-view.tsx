import Link from "next/link";
import { CalendarClock, Globe, Lock } from "lucide-react";
import { confirmJobOpen, extractJob, requestPublicBoard, saveWorkspaceJob, setJobStatus } from "../../actions";
import { JobEditor } from "@/components/job-editor";
import { uploadJobImage } from "../image-actions";
import type { JobValues } from "@/lib/job-values";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/flash";
import { sourceLabel } from "@/components/job-source";
import { formatDate } from "@/lib/utils";

type Job = JobValues & {
  id: string;
  status: string;
  visibility: "public" | "workspace";
  public_requested_at: string | null;
  source_type: "sourced";
  origin: string;
  expires_at: string | null;
};

/** Management view for a job from another source that this workspace added (addendum 4). */
export function SourcedJobView({
  job,
  sp,
  children,
  isAdmin = false,
}: {
  job: Job;
  sp: Record<string, string>;
  children?: React.ReactNode;
  isAdmin?: boolean;
}) {
  const values: JobValues = { ...job, location: job.location ?? "", salary_currency: job.salary_currency ?? "" };
  const daysLeft = job.expires_at ? Math.ceil((new Date(job.expires_at).getTime() - Date.now()) / 86400_000) : null;
  return (
    <div className="space-y-8">
      <Flash searchParams={sp} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {job.title} <Badge tone={job.status === "published" ? "success" : "muted"}>{job.status}</Badge>
          </h1>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="sourced">{sourceLabel(job)}</Badge>
            {job.visibility === "public" ? (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-4 w-4" aria-hidden /> On the public job board
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-4 w-4" aria-hidden /> Only your workspace sees this job
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.status !== "removed" &&
            (["published", "paused", "closed"] as const)
              .filter((s) => s !== job.status)
              .map((s) => (
                <form key={s} action={setJobStatus}>
                  <input type="hidden" name="id" value={job.id} />
                  <input type="hidden" name="status" value={s} />
                  <Button size="sm" variant={s === "published" ? "default" : "outline"}>
                    {s === "published" ? "Open" : s === "paused" ? "Pause" : "Close"}
                  </Button>
                </form>
              ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" aria-hidden /> Still open?
            </CardTitle>
            <CardDescription>
              {job.expires_at
                ? daysLeft! > 0
                  ? `Open until ${formatDate(job.expires_at)} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).`
                  : `Expired on ${formatDate(job.expires_at)}.`
                : "No end date."}{" "}
              Jobs from other sources close automatically after 30 days unless someone confirms they are still open.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={confirmJobOpen}>
              <input type="hidden" name="id" value={job.id} />
              <input type="hidden" name="back" value={`/recruiter/jobs/${job.id}`} />
              <Button size="sm" variant="outline">
                Yes, still open (30 more days)
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" aria-hidden /> Public job board
            </CardTitle>
            <CardDescription>
              Jobs from other sources appear publicly only after a Vouch admin reviews them, so they are always labeled
              and can be removed on request.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {job.visibility === "public" ? (
              <Link href={`/jobs/${job.id}`} className="text-primary text-sm underline">
                View the public page
              </Link>
            ) : job.public_requested_at ? (
              <p className="text-sm">Requested on {formatDate(job.public_requested_at)}. Waiting for review.</p>
            ) : (
              <form action={requestPublicBoard}>
                <input type="hidden" name="id" value={job.id} />
                <Button size="sm" variant="outline">
                  Ask for the public board
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {children}

      <section aria-labelledby="edit-h" className="space-y-3">
        <h2 id="edit-h" className="text-xl font-semibold tracking-tight">
          Edit job
        </h2>
        <JobEditor
          initial={values}
          mode="sourced"
          extractAction={extractJob}
          saveAction={saveWorkspaceJob}
          allowPublicBoard={isAdmin && job.visibility !== "public"}
          imageAction={uploadJobImage}
          imageUrl={job.image_path ? `/api/job-image/${job.id}` : null}
        />
      </section>
    </div>
  );
}
