"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = readonly [href: string, label: string];

function isActive(pathname: string, href: string) {
  if (href === "/candidate" || href === "/recruiter" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop pill nav + a mobile menu that closes itself after navigation. */
export function NavLinks({
  items,
  account,
  pinned,
}: {
  items: NavItem[];
  /** shown in the header on desktop and inside the mobile menu (e.g. Log in / Sign up) */
  account?: React.ReactNode;
  /** always visible on every screen size (e.g. the profile button) */
  pinned?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const link = (href: string, label: string, mobile = false) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(pathname, href) ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive(pathname, href)
          ? "bg-primary-soft text-primary-soft-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        mobile && "block text-base",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
        {items.map(([h, l]) => link(h, l))}
      </nav>
      {account && <div className="hidden items-center gap-2 md:flex">{account}</div>}
      {pinned && <div className="ml-auto md:ml-0">{pinned}</div>}
      <button
        type="button"
        className={cn(
          "hover:bg-muted inline-flex h-10 w-10 items-center justify-center rounded-lg md:hidden",
          !pinned && "ml-auto",
        )}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div id="mobile-menu" className="border-border w-full space-y-1 border-t pt-3 pb-2 md:hidden">
          <nav aria-label="Main (mobile)" className="space-y-1">
            {items.map(([h, l]) => link(h, l, true))}
          </nav>
          {account && <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">{account}</div>}
        </div>
      )}
    </>
  );
}
