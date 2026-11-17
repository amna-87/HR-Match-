/** Instant skeleton while job listings load (read-only pages, no forms here). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Loading jobs…</span>
      <div className="border-border bg-card h-48 rounded-3xl border" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-border bg-card h-40 rounded-2xl border" />
        ))}
      </div>
    </div>
  );
}
