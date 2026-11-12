// TypeScript mirror of the database state machine (public.match_transition_allowed).
// The database is authoritative; this copy drives UI labels and is tested to agree.
export type MatchStatus = "suggested" | "notified" | "approved" | "applied" | "declined" | "expired" | "viewed";
export type SourceType = "verified" | "sourced";

const VERIFIED: Record<MatchStatus, MatchStatus[]> = {
  suggested: ["notified"],
  notified: ["approved", "declined", "expired"],
  approved: ["applied"],
  applied: [],
  declined: [],
  expired: [],
  viewed: [],
};
const SOURCED: Record<MatchStatus, MatchStatus[]> = {
  suggested: ["notified"],
  notified: ["viewed", "expired"],
  approved: [],
  applied: [],
  declined: [],
  expired: [],
  viewed: [],
};

export function canTransition(source: SourceType, from: MatchStatus, to: MatchStatus): boolean {
  if (from === to) return true;
  return (source === "verified" ? VERIFIED : SOURCED)[from].includes(to);
}

export const ALL_STATUSES: MatchStatus[] = ["suggested", "notified", "approved", "applied", "declined", "expired", "viewed"];

export function isAwaitingCandidate(status: MatchStatus) {
  return status === "notified";
}

export type RedistributionStatus = "pending" | "opted_in" | "declined" | "withdrawn";
export function canTransitionRedistribution(from: RedistributionStatus, to: RedistributionStatus) {
  return from === to || (from === "pending" && (to === "opted_in" || to === "declined")) || (from === "opted_in" && to === "withdrawn");
}
