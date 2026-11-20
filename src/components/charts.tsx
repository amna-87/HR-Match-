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

type Series = { key: string; label: string; data: { day: string; value: number }[] };

/** One large area chart with a series switcher, crosshair tooltip and a screen-reader table. */
export function ActivityChart({ series }: { series: Series[] }) {
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const s = series[active];
  const data = s.data;
  const W = 640;
  const H = 220;
  const max = Math.max(4, ...data.map((d) => d.value));
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * W : W / 2);
  const y = (v: number) => H - (v / nice) * (H - 12);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const total = data.reduce((t, d) => t + d.value, 0);
  const week = data.slice(-7).reduce((t, d) => t + d.value, 0);
  const h = hover != null ? data[hover] : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{total}</p>
          <p className="text-muted-foreground text-sm">
            {s.label.toLowerCase()} in the last 30 days · <span className="text-foreground font-medium">{week}</span>{" "}
            this week
          </p>
        </div>
        <div role="group" aria-label="Choose a measure" className="bg-muted flex flex-wrap gap-1 rounded-xl p-1">
          {series.map((item, i) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                i === active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <div className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between pb-6 text-[11px] tabular-nums">
          {[nice, (nice * 3) / 4, nice / 2, nice / 4, 0].map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
        <div className="ml-8">
          <div
            className="relative h-56 lg:h-80"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1));
              setHover(Math.max(0, Math.min(data.length - 1, i)));
            }}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
              aria-hidden
            >
              <defs>
                <linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--primary)" stopOpacity="0.25" />
                  <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <line
                  key={f}
                  x1="0"
                  x2={W}
                  y1={y(nice * f)}
                  y2={y(nice * f)}
                  stroke="var(--border)"
                  strokeDasharray={f ? "3 4" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#activity-fill)" />
              <path
                d={line}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {hover != null && (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1="0"
                  y2={H}
                  stroke="var(--muted-foreground)"
                  strokeOpacity="0.5"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {h && (
              <>
                <span
                  className="border-card bg-primary pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                  style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(h.value) / H) * 100}%` }}
                />
                <div
                  className="border-border bg-card pointer-events-none absolute top-0 z-10 rounded-lg border px-3 py-2 text-xs whitespace-nowrap shadow-(--shadow-lift)"
                  style={{
                    left: `${(x(hover!) / W) * 100}%`,
                    transform: `translateX(${hover! > data.length / 2 ? "calc(-100% - 10px)" : "10px"})`,
                  }}
                >
                  <p className="text-muted-foreground">{fmtDay(h.day)}</p>
                  <p className="font-semibold tabular-nums">
                    {h.value} {s.label.toLowerCase()}
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="text-muted-foreground mt-2 flex justify-between text-[11px]">
            {[0, 7, 14, 21, data.length - 1].map((i) => (
              <span key={i}>{data[i] ? (i === data.length - 1 ? "Today" : fmtDay(data[i].day)) : ""}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="sr-only">
        <table>
          <caption>{s.label} per day, last 30 days</caption>
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
    </div>
  );
}

/** Donut of parts (validated categorical colours, 2px gaps), total in the centre, legend with values. */
export function Donut({ parts, label }: { parts: { label: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((t, p) => t + p.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = parts.filter((p) => p.value).length > 1 ? 3 : 0;
  let offset = 0;
  const shown = hover != null ? parts[hover] : null;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col">
      <div className="relative h-40 w-40 shrink-0">
        <svg
          viewBox="0 0 128 128"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}
        >
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--muted)" strokeWidth="14" />
          {total > 0 &&
            parts.map((p, i) => {
              if (!p.value) return null;
              const len = (p.value / total) * c;
              const seg = (
                <circle
                  key={p.label}
                  cx="64"
                  cy="64"
                  r={r}
                  fill="none"
                  stroke={`var(--series-${i + 1})`}
                  strokeWidth={hover === i ? 17 : 14}
                  strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                  className="cursor-default transition-all"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              );
              offset += len;
              return seg;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-semibold tabular-nums">{shown ? shown.value : total}</span>
          <span className="text-muted-foreground text-xs">{shown ? shown.label : label}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {parts.map((p, i) => (
          <li
            key={p.label}
            className={cn("flex items-center gap-2 rounded-lg px-2 py-1 transition-colors", hover === i && "bg-muted")}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: `var(--series-${i + 1})` }}
              aria-hidden
            />
            <span className="text-muted-foreground flex-1">{p.label}</span>
            <span className="font-semibold tabular-nums">{p.value}</span>
            <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
              {total ? Math.round((p.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
