// Per-IP rate limit for public pages, search and API (7c abuse protection).
// In-memory fixed window per server instance: no database round trip on every
// request. Database-backed limits still guard sensitive actions (reveal, auth).
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export const IP_LIMITS = { page: 240, api: 120 } as const; // per minute

export function ipAllowed(key: string, limit: number, now = Date.now()): boolean {
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
    lastSweep = now;
  }
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function rateLimitClass(pathname: string): keyof typeof IP_LIMITS | null {
  if (pathname.startsWith("/api/")) return "api";
  if (
    pathname === "/jobs" ||
    pathname.startsWith("/jobs/") ||
    pathname.startsWith("/companies/") ||
    pathname === "/sitemap.xml"
  )
    return "page";
  return null;
}
