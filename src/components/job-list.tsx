import Link from "next/link";
import { ArrowRight, Briefcase, Clock, MapPin, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompanyAvatar } from "@/components/company-avatar";
import { employmentLabel, workModeLabel } from "@/components/job-source";
import { firstParagraph, timeAgo } from "@/lib/utils";

export const PUBLIC_JOB_COLUMNS =
  "id, title, location, work_mode, employment_type, published_at, source_type, source_name, source_company_name, description_summary, company:companies(name)";

export type PublicJob = {
  id: string;
  title: string;
  location: string | null;
  work_mode: string;
  employment_type?: string | null;
  published_at?: string | null;
  source_type: "verified" | "sourced";
  source_name: string | null;
  source_company_name: string | null;
  description_summary: string;
  company: unknown;
};

export function companyName(j: Pick<PublicJob, "company" | "source_company_name">) {
  return (j.company as { name: string } | null)?.name ?? j.source_company_name ?? null;
}

/** Display rule (addendum 4): the company name when known, otherwise "Hiring directly". */
export const HIRING_DIRECTLY = "Hiring directly";

/** Public job cards (anyone can browse published jobs; RLS jobs_select_published). */
export function JobList({ jobs, empty = "No open roles yet." }: { jobs: PublicJob[]; empty?: string }) {
  if (!jobs.length)
    return (
      <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-14 text-center">
        <SearchX className="h-8 w-8" aria-hidden />
        <p>{empty}</p>
      </div>
    );
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {jobs.map((j) => {
        const company = companyName(j);
        return (
          <li
            key={j.id}
            className="group border-border bg-card relative flex flex-col gap-4 rounded-2xl border p-5 shadow-(--shadow-card) transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-(--shadow-lift) dark:hover:border-indigo-900"
          >
            <div className="flex items-start gap-4">
              <CompanyAvatar name={company} />
              <div className="min-w-0 flex-1">
                <h3 className="leading-snug font-semibold tracking-tight">
                  <Link
                    href={`/jobs/${j.id}`}
                    className="group-hover:text-primary after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                  >
                    {j.title}
                  </Link>
                </h3>
                <p className="text-muted-foreground mt-0.5 truncate text-sm">{company ?? HIRING_DIRECTLY}</p>
              </div>
              {j.source_type === "sourced" ? (
                <Badge tone="sourced">Sourced listing</Badge>
              ) : (
                <Badge tone="success">Employer</Badge>
              )}
            </div>
            <p className="text-muted-foreground line-clamp-2 text-sm">{firstParagraph(j.description_summary)}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium">
                <Briefcase className="h-3.5 w-3.5" aria-hidden />
                {workModeLabel(j.work_mode)}
                {j.employment_type ? ` · ${employmentLabel(j.employment_type)}` : ""}
              </span>
              {j.location && (
                <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{j.location}</span>
                </span>
              )}
              {j.published_at && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {timeAgo(j.published_at)}
                </span>
              )}
              <ArrowRight
                className="text-primary ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
