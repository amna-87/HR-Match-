import { Badge } from "@/components/ui/badge";

import { outboundRel, sourceLabel, type JobLike } from "@/lib/jobs/source-rules";
export { allowsJobStructuredData, outboundRel, sourceLabel } from "@/lib/jobs/source-rules";

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
        <a href={job.source_url} rel={outboundRel(job.source_name)} target="_blank" className="underline">
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
