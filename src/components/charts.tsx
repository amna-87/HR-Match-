"use client";
// Small, dependency-free charts for dashboards. Single-series charts use the brand
// violet; categorical parts use the validated --series-N palette in fixed order.
// Every chart has a hover/focus tooltip and an accessible text alternative.
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Thin trend line with a soft fill, for KPI tiles. Decorative; the tile states the number. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId().replace(/:/g, "");
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className={cn("h-9 w-full", className)}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#g${id})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Daily bars (one series) with a hover tooltip and a hidden table for screen readers. */
export function DailyBars({ label, data }: { label: string; data: { day: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const h = hover != null ? data[hover] : null;
  return (
    <figure className="border-border bg-card flex min-w-0 flex-col gap-3 rounded-2xl border p-3 shadow-(--shadow-card) sm:p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">
          <span className="text-foreground text-lg font-semibold tabular-nums">{total}</span> in 30 days
        </span>
      </figcaption>
      <div className="relative">
        <div
          className="border-border flex h-20 items-end gap-px border-b sm:h-28 sm:gap-[2px]"
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${label}: ${total} in the last 30 days`}
        >
          {data.map((d, i) => (
            <div key={d.day} className="flex h-full flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)}>
              <div
                className={cn(
                  "w-full rounded-t-[4px] transition-opacity",
                  d.value ? "bg-primary" : "bg-border",
                  hover != null && hover !== i && "opacity-40",
                )}
                style={{ height: d.value ? `${Math.max(6, (d.value / max) * 100)}%` : "2px" }}
              />
            </div>
          ))}
        </div>
        {h && (
          <div
            className="border-border bg-card pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-(--shadow-lift)"
            style={{ left: `${((hover! + 0.5) / data.length) * 100}%` }}
          >
            <span className="text-muted-foreground">{fmtDay(h.day)}</span>{" "}
            <span className="font-semibold tabular-nums">{h.value}</span>
          </div>
        )}
      </div>
      <div className="text-muted-foreground flex justify-between text-[11px]">
        <span>{data[0] ? fmtDay(data[0].day) : ""}</span>
        <span>Today</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>{label} per day</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** One horizontal 100% bar split into parts, with a legend that carries the values. */
export function StackedBar({ parts }: { parts: { label: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="space-y-4">
      <div
        className="bg-muted flex h-4 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
        onMouseLeave={() => setHover(null)}
      >
        {parts.map((p, i) =>
          p.value ? (
            <div
              key={p.label}
              onMouseEnter={() => setHover(i)}
              title={`${p.label}: ${p.value}`}
              className={cn(
                "h-full transition-opacity first:rounded-l-full last:rounded-r-full",
                hover != null && hover !== i && "opacity-40",
              )}
              style={{ width: `${(p.value / total) * 100}%`, background: `var(--series-${i + 1})` }}
            />
          ) : null,
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {parts.map((p, i) => (
          <li
            key={p.label}
            className="flex items-center gap-2"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: `var(--series-${i + 1})` }}
              aria-hidden
            />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="ml-auto font-semibold tabular-nums sm:ml-0">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Progress ring for "x of y" (single value, brand colour). */
export function Ring({ value, of, label, sub }: { value: number; of: number; label: string; sub?: string }) {
  const pct = of ? Math.min(1, value / of) : 0;
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 72 72" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
        />
      </svg>
      <div className="min-w-0">
        <p className="text-xl font-semibold tabular-nums">
          {value}
          <span className="text-muted-foreground text-sm font-normal"> / {of}</span>
        </p>
        <p className="text-sm leading-tight">{label}</p>
        {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
      </div>
    </div>
  );
}

/** Funnel: each step as a bar relative to the first step, with the count and % of the first. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / first) * 100);
        return (
          <li
            key={s.label}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_auto]"
          >
            <span className="text-muted-foreground truncate">{s.label}</span>
            <span className="bg-muted h-3 overflow-hidden rounded-full">
              <span
                className="bg-primary block h-full rounded-full"
                style={{ width: `${Math.max(s.value ? 3 : 0, (s.value / first) * 100)}%`, opacity: 1 - i * 0.12 }}
              />
            </span>
            <span className="w-20 text-right tabular-nums">
              <span className="font-semibold">{s.value}</span>
              {i > 0 && <span className="text-muted-foreground text-xs"> · {pct}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
