import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Friendly placeholder for an empty list: icon, short title, one line of help and an optional action. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card/60 flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center",
        className,
      )}
    >
      <span className="bg-primary/10 text-primary mb-1 flex h-11 w-11 items-center justify-center rounded-full">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
      {children && <p className="text-muted-foreground max-w-md text-sm">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
