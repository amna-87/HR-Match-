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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Post a job for {company.name}</h1>
      <Flash searchParams={await searchParams} />
      <p className="text-muted-foreground text-sm">
        Not your own job?{" "}
        <Link href="/recruiter/jobs/add" className="text-primary underline">
          Add a job from another source
        </Link>{" "}
        (any company, website or WhatsApp group). For spreadsheets and company career feeds, see{" "}
        <Link href="/recruiter/sources" className="text-primary underline">
          Job sources
        </Link>
        .
      </p>
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
