"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Pref = "light" | "dark" | "system";
const NEXT: Record<Pref, Pref> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Pref, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };

export function applyTheme(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Light / dark / system switch. The choice is remembered in this browser only. */
export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    let saved: Pref = "system";
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark") saved = v;
    } catch {}
    setPref(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let p: Pref = "system";
      try {
        const v = localStorage.getItem("theme");
        if (v === "light" || v === "dark") p = v;
      } catch {}
      if (p === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next = NEXT[pref];
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => {
        setPref(next);
        try {
          if (next === "system") localStorage.removeItem("theme");
          else localStorage.setItem("theme", next);
        } catch {}
        applyTheme(next);
      }}
      title={`${LABEL[pref]} (click for ${LABEL[next].toLowerCase()})`}
      className={cn(
        "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">
        {LABEL[pref]}. Switch to {LABEL[next].toLowerCase()}
      </span>
    </button>
  );
}
