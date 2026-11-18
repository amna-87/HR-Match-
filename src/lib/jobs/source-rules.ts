// Source labels and link rules for jobs from other places (pure functions; used by components and tests).

export type JobLike = {
  source_type: "verified" | "sourced";
  source_name?: string | null;
  source_url?: string | null;
  source_company_name?: string | null;
  origin?: string | null;
};

/** The on-screen source label (addendum 4): "From X careers page", "Sourced from X" or "Source: not specified". */
export function sourceLabel(job: JobLike): string {
  if (job.source_type !== "sourced") return "Posted by employer";
  if (job.origin === "api_feed" && job.source_name?.endsWith(" careers page")) return `From ${job.source_name}`;
  return job.source_name ? `Sourced from ${job.source_name}` : "Source: not specified";
}

/**
 * Rules from aggregator APIs' terms (D-039): Remote OK asks for a normal
 * (followed) link back; every other outbound job link is nofollow.
 */
export function outboundRel(sourceName: string | null | undefined) {
  return sourceName === "Remote OK" ? "noopener noreferrer" : "noopener noreferrer nofollow";
}

/**
 * Jobs from aggregator search feeds are not passed on to Google Jobs
 * (Remotive forbids it; we treat all aggregators the same way to be safe).
 */
export function allowsJobStructuredData(job: { origin?: string | null; source_name?: string | null }) {
  return !(job.origin === "api_feed" && !job.source_name?.endsWith(" careers page"));
}
