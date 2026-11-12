import { redirect } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { extractJob, saveJob } from "../../actions";
import { JobEditor } from "@/components/job-editor";
import { emptyJob } from "@/lib/job-values";
import { Flash } from "@/components/flash";

export const metadata = { title: "Post a job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { company } = await requireRecruiter();
  if (!company) redirect("/recruiter");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Post a job for {company.name}</h1>
      <Flash searchParams={await searchParams} />
      <JobEditor initial={emptyJob} mode="verified" extractAction={extractJob} saveAction={saveJob} />
    </div>
  );
}
