import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { extractJob, saveJob } from "../../actions";
import { JobEditor } from "@/components/job-editor";
import { uploadJobImage } from "../image-actions";
import { emptyJob } from "@/lib/job-values";
import { Flash } from "@/components/flash";

export const metadata = { title: "Post a job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { company } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <PageHeader
        title={<>Post a job for {company.name}</>}
        description={
          <>
            Not your own job?{" "}
            <Link href="/recruiter/jobs/add" className="text-primary underline">
              Add a job from another source
            </Link>{" "}
            (any company, website or WhatsApp group). For spreadsheets and company career feeds, see{" "}
            <Link href="/recruiter/sources" className="text-primary underline">
              Job sources
            </Link>
            .
          </>
        }
      />
      <JobEditor
        initial={emptyJob}
        mode="verified"
        extractAction={extractJob}
        saveAction={saveJob}
        imageAction={uploadJobImage}
      />
    </div>
  );
}
