import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth/session";
import { extractSourcedJob, saveSourcedJob } from "../../actions";
import { JobEditor } from "@/components/job-editor";
import { emptyJob } from "@/lib/job-values";

export const metadata = { title: "Add sourced job" };

export default async function NewSourcedJob() {
  await requireRole("admin");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Add a sourced job"
        description="Manual paste only, no automated scraping. Sourced jobs are always labeled, expire automatically (30 days by default), never accept in-platform applications and can be removed on request."
      />
      <JobEditor
        initial={{ ...emptyJob, apply_method: "link" }}
        mode="sourced"
        extractAction={extractSourcedJob}
        saveAction={saveSourcedJob}
      />
    </div>
  );
}
