import { requireRole } from "@/lib/auth/session";
import { extractSourcedJob, saveSourcedJob } from "../../actions";
import { JobEditor, emptyJob } from "@/components/job-editor";

export const metadata = { title: "Add sourced job" };

export default async function NewSourcedJob() {
  await requireRole("admin");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Add a sourced job</h1>
      <p className="text-sm text-muted-foreground">
        Manual paste only — no automated scraping. Sourced jobs are always labeled, expire automatically (30 days by default), never accept
        in-platform applications, and can be removed on request.
      </p>
      <JobEditor initial={{ ...emptyJob, apply_method: "link" }} mode="sourced" extractAction={extractSourcedJob} saveAction={saveSourcedJob} />
    </div>
  );
}
