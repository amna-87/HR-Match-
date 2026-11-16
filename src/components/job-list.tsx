import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobSourceBadge, workModeLabel } from "@/components/job-source";

export const PUBLIC_JOB_COLUMNS =
  "id, title, location, work_mode, source_type, source_name, source_company_name, description_summary, company:companies(name)";

export type PublicJob = {
  id: string;
  title: string;
  location: string | null;
  work_mode: string;
  source_type: "verified" | "sourced";
  source_name: string | null;
  source_company_name: string | null;
  description_summary: string;
  company: unknown;
};

/** Public job cards (anyone can browse published jobs; RLS jobs_select_published). */
export function JobList({ jobs, empty = "No open roles yet." }: { jobs: PublicJob[]; empty?: string }) {
  if (!jobs.length) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {jobs.map((j) => {
        const company =
          (j.company as { name: string } | null)?.name ?? j.source_company_name ?? "Company not disclosed";
        return (
          <Card key={j.id} className={j.source_type === "sourced" ? "border-dashed border-amber-400" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>
                  <Link href={`/jobs/${j.id}`} className="hover:underline">
                    {j.title}
                  </Link>
                </CardTitle>
                <JobSourceBadge job={j} />
              </div>
              <p className="text-muted-foreground text-sm">
                {company} · {workModeLabel(j.work_mode)}
                {j.location ? ` · ${j.location}` : ""}
              </p>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-3 text-sm">{j.description_summary}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
