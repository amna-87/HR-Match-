import { Badge } from "@/components/ui/badge";

type JobLike = {
  source_type: "verified" | "sourced";
  source_name?: string | null;
  source_url?: string | null;
  source_company_name?: string | null;
  origin?: string | null;
};

/** The on-screen source label (addendum 4): "From X careers page", "Sourced from X" or "Source: not specified". */
export function sourceLabel(job: JobLike): string {
  if (job.source_type !== "sourced") return "Posted by employer";
  if (job.origin === "api_feed" && job.source_company_name) return `From ${job.source_company_name} careers page`;
  return job.source_name ? `Sourced from ${job.source_name}` : "Source: not specified";
}

/** Sourced jobs are ALWAYS labeled. We never present ourselves as the employer. */
export function JobSourceBadge({ job }: { job: JobLike }) {
  return job.source_type === "sourced" ? (
    <Badge tone="sourced">Sourced listing</Badge>
  ) : (
    <Badge tone="success">Posted by employer</Badge>
  );
}

export function SourcedNotice({ job }: { job: JobLike }) {
  if (job.source_type !== "sourced") return null;
  return (
    <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50">
      <strong>{sourceLabel(job)}.</strong>{" "}
      {job.source_url ? "Apply via the original listing." : "Apply directly to the employer using the details shown."}{" "}
      {job.source_url && (
        <a href={job.source_url} rel="noopener noreferrer nofollow" target="_blank" className="underline">
          View original
        </a>
      )}
      <span className="block text-xs opacity-80">
        This employer has not posted on Vouch; the summary is written by us. Vouch never applies on your behalf.
      </span>
    </div>
  );
}

export function workModeLabel(m: string) {
  return { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[m] ?? m;
}

export function employmentLabel(t: string) {
  return t.replace("_", "-").replace(/^\w/, (c) => c.toUpperCase());
}

export { applyHref } from "@/lib/jobs/contact";
