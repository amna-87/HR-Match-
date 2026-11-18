import Link from "next/link";
import { cn } from "@/lib/utils";

/** The two-arches ("2 roots") mark. Outer arch uses the ink colour, inner arch the brand violet. */
export const LOGO_OUTER =
  "M12.5 57 C11 31 21 8.5 36.5 8.5 C48.5 8.5 56.5 24 58 45 C53.5 29 46 17.5 35.5 17.5 C26 17.5 20.5 32 21.5 57 Z";
export const LOGO_INNER =
  "M23.5 57 C23 39 29.5 26.5 38.5 26.5 C47.5 26.5 52 38 51.5 57 L44 57 C44.5 42 42 33.5 37.5 33.5 C32.5 33.5 30 43 30 57 Z";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("h-8 w-8 shrink-0", className)}>
      <path d={LOGO_OUTER} fill="var(--logo-ink)" />
      <path d={LOGO_INNER} fill="var(--logo-accent)" />
    </svg>
  );
}

export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
      <LogoMark />
      {name}
    </Link>
  );
}
