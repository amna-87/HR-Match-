import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-[0_1px_1px_rgb(15_23_42/0.03)] transition-colors placeholder:text-muted-foreground hover:border-slate-300 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-50 dark:hover:border-slate-600";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-11 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm leading-none font-medium", className)} {...props} />;
}

/** Label + control + optional hint, wired up with ids for accessibility. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
      <input type="checkbox" className="border-border accent-primary mt-0.5 h-4 w-4 shrink-0 rounded" {...props} />
      {label}
    </label>
  );
}
