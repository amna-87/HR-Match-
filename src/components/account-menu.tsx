"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccountLink = { href: string; label: string; icon: React.ReactNode };

/**
 * Profile button with a dropdown (like most websites): avatar + name, links to
 * the account pages, and sign out. Closes on outside click, Escape and navigation.
 */
export function AccountMenu({
  name,
  email,
  roleLabel,
  links,
}: {
  name: string | null;
  email: string;
  roleLabel: string;
  links: AccountLink[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const display = name?.trim() || email;
  const initial = (display.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((o) => !o)}
        className="border-border bg-card hover:bg-muted flex items-center gap-2 rounded-full border py-1 pr-2 pl-1 shadow-sm transition-colors"
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-sm font-semibold text-white"
        >
          {initial}
        </span>
        <span className="sr-only max-w-[10rem] truncate text-sm font-medium lg:not-sr-only">{display}</span>
        <span className="sr-only">, account menu</span>
        <ChevronDown
          aria-hidden
          className={cn("text-muted-foreground h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          id="account-menu"
          role="menu"
          aria-label="Account"
          className="border-border bg-card absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border shadow-(--shadow-lift)"
        >
          <div className="border-border flex items-center gap-3 border-b p-4">
            <span
              aria-hidden
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-base font-semibold text-white"
            >
              {initial}
            </span>
            <div className="min-w-0">
              {name && <p className="truncate font-semibold">{name}</p>}
              <p className="text-muted-foreground truncate text-sm">{email}</p>
              <span className="bg-primary-soft text-primary-soft-foreground mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium">
                {roleLabel}
              </span>
            </div>
          </div>
          <div className="p-1.5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                aria-current={pathname === l.href ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname === l.href ? "bg-primary-soft text-primary-soft-foreground" : "hover:bg-muted",
                )}
              >
                <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{l.icon}</span>
                {l.label}
              </Link>
            ))}
          </div>
          <form action="/auth/signout" method="post" className="border-border border-t p-1.5">
            <button
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
