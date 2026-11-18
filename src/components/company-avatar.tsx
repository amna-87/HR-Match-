import { cn } from "@/lib/utils";

const palettes = [
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
];

/** Initials on a colour picked from the name, so each company keeps the same look. */
export function CompanyAvatar({ name, size = "md" }: { name: string | null; size?: "md" | "lg" }) {
  const label = (name ?? "").replace(/\(.*?\)/g, "").trim();
  const initials =
    label
      .split(/\s+/)
      .filter((w) => /^[\p{L}\p{N}]/u.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold",
        palettes[h % palettes.length],
        size === "lg" ? "h-14 w-14 text-lg" : "h-11 w-11 text-sm",
      )}
    >
      {initials}
    </span>
  );
}
