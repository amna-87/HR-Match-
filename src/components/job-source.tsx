import { Badge } from "@/components/ui/badge";

type JobLike = {
  source_type: "verified" | "sourced";
  source_name?: string | null;
  source_url?: string | null;
};

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
      Sourced from <strong>{job.source_name}</strong>. Apply via the original listing.{" "}
      {job.source_url && (
        <a href={job.source_url} rel="noopener noreferrer nofollow" target="_blank" className="underline">
          View original
        </a>
      )}
      <span className="block text-xs opacity-80">
        This employer has not posted on our platform; the summary is written by us.
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

export function applyHref(method: string, target: string | null) {
  if (!target) return null;
  if (method === "email") return `mailto:${target}`;
  if (method === "phone") return `tel:${target.replace(/[^\d+]/g, "")}`;
  if (method === "link") return target;
  return null;
}
