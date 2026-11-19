"use client";
// Styled file picker: a real <input type="file"> (keyboard + screen reader friendly)
// visually hidden behind a dropzone-like button that shows the chosen file name(s).
import * as React from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileInput({
  id,
  label = "Choose a file",
  hint,
  className,
  onChange,
  multiple,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string; label?: string; hint?: string }) {
  const [names, setNames] = React.useState<string[]>([]);
  return (
    <div className={cn("w-full min-w-0", className)}>
      <input
        id={id}
        type="file"
        multiple={multiple}
        className="peer sr-only"
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          setNames(Array.from(e.target.files ?? []).map((f) => f.name));
          onChange?.(e);
        }}
        {...props}
      />
      <label
        htmlFor={id}
        className="border-border bg-background hover:border-primary/60 hover:bg-primary/5 peer-focus-visible:border-primary peer-focus-visible:ring-primary/15 flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors peer-focus-visible:ring-4"
      >
        <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Upload className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {names.length === 0
              ? multiple
                ? "No files chosen"
                : "No file chosen"
              : names.length === 1
                ? names[0]
                : `${names.length} files chosen`}
          </span>
        </span>
        <span className="text-primary shrink-0 text-xs font-semibold">Browse</span>
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground mt-1.5 text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}
