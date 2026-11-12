import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({
  tone = "info",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "info" | "error" | "success" | "warning" }) {
  const t = {
    info: "border-sky-300 bg-sky-50 text-sky-950 dark:bg-sky-950 dark:text-sky-50",
    error: "border-red-300 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-50",
    success: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50",
    warning: "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm", t, className)}
      {...props}
    />
  );
}
