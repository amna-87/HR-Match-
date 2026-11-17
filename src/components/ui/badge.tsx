import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "muted" | "success" | "warning" | "danger" | "info" | "sourced" | "vetted";
const tones: Record<Tone, string> = {
  default: "bg-primary-soft text-primary-soft-foreground",
  muted: "bg-muted text-foreground/80",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  danger: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  sourced:
    "border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  vetted: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
};

export function Badge({
  tone = "muted",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
