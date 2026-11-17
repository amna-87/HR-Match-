export const POOL_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  not_interested: "Not interested",
  hired: "Hired",
} as const;
export type PoolStatus = keyof typeof POOL_STATUS_LABELS;
