import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { extractJob, saveWorkspaceJob } from "../../actions";
import { JobEditor } from "@/components/job-editor";
import { uploadJobImage } from "../image-actions";
import { emptyJob } from "@/lib/job-values";
import { Flash } from "@/components/flash";

export const metadata = { title: "Add a job from another source" };

export default async function AddSourcedJobPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { company, profile } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add a job from another source"
        description="A job from any company, website, WhatsApp group or person. Paste the post and check the details; only a title and one way to apply are needed. It stays in your workspace so you can match it against your talent pool, and you can ask Vouch to put it on the public job board."
      />
      <Flash searchParams={await searchParams} />
      <JobEditor
        initial={{ ...emptyJob, apply_method: "link" }}
        mode="sourced"
        extractAction={extractJob}
        saveAction={saveWorkspaceJob}
        allowPublicBoard={profile.role === "admin"}
        imageAction={uploadJobImage}
      />
    </div>
  );
}
