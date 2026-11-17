import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 text-white shadow-sm shadow-indigo-500/30",
        className,
      )}
    >
      <Check className="h-4.5 w-4.5" strokeWidth={3} />
    </span>
  );
}

export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <LogoMark />
      {name}
    </Link>
  );
}
