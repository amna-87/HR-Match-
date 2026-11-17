import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function listFromForm(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", else a date. */
export function timeAgo(d: string | Date | null | undefined, now = new Date()) {
  if (!d) return "";
  const days = Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return formatDate(d);
}

/** First paragraph of a job description, for previews (cards). */
export function firstParagraph(text: string | null | undefined) {
  return (text ?? "").split(/\n\s*\n/)[0]?.trim() ?? "";
}
