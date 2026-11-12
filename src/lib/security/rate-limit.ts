// Rate limiting backed by Postgres (works across serverless instances).
import type { Queryable } from "@/lib/db";

export const RATE_LIMITS = {
  auth: { limit: 10, windowSeconds: 600 },
  upload: { limit: 10, windowSeconds: 3600 },
  parse: { limit: 20, windowSeconds: 3600 },
  takedown: { limit: 5, windowSeconds: 3600 },
  emailLink: { limit: 30, windowSeconds: 600 },
  export: { limit: 5, windowSeconds: 3600 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export async function checkRateLimit(db: Queryable, name: RateLimitName, subject: string): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  try {
    const r = await db.query<{ ok: boolean }>("select public.check_rate_limit($1, $2, $3) as ok", [
      `${name}:${subject}`,
      limit,
      windowSeconds,
    ]);
    return r.rows[0]?.ok ?? false;
  } catch (e) {
    console.error("[rate-limit] check failed", e);
    return name !== "auth"; // fail closed for auth, open elsewhere
  }
}
