// Rate limiting backed by Postgres (works across serverless instances).
import type { Queryable } from "@/lib/db";

export const RATE_LIMITS = {
  auth: { limit: 10, windowSeconds: 600 }, // per account + IP
  authIp: { limit: 60, windowSeconds: 600 }, // per IP, across accounts
  upload: { limit: 10, windowSeconds: 3600 },
  parse: { limit: 20, windowSeconds: 3600 },
  takedown: { limit: 5, windowSeconds: 3600 },
  emailLink: { limit: 30, windowSeconds: 600 },
  export: { limit: 5, windowSeconds: 3600 },
  invite: { limit: 20, windowSeconds: 3600 },
  talentUpload: { limit: 60, windowSeconds: 3600 }, // resumes a recruiter adds to the talent pool
  poolImport: { limit: 30, windowSeconds: 3600 }, // bulk uploads started (each up to the batch cap)
  reveal: { limit: 40, windowSeconds: 3600 }, // apply contacts revealed per user or IP (7c)
  csvImport: { limit: 20, windowSeconds: 3600 }, // CSV job imports
  feedRun: { limit: 20, windowSeconds: 3600 }, // manual feed connects / fetches
  intro: { limit: 30, windowSeconds: 86400 }, // network introduction requests per recruiter per day
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Local/CI end-to-end runs log in many times from one IP. RATE_LIMIT_SCALE multiplies
 * every limit, but never in production (VERCEL_ENV / APP_ENV = production).
 */
function scale(): number {
  const prod = process.env.VERCEL_ENV === "production" || process.env.APP_ENV === "production";
  const s = Number(process.env.RATE_LIMIT_SCALE);
  return !prod && Number.isFinite(s) && s >= 1 ? Math.min(s, 100) : 1;
}

export async function checkRateLimit(db: Queryable, name: RateLimitName, subject: string): Promise<boolean> {
  const { windowSeconds } = RATE_LIMITS[name];
  const limit = RATE_LIMITS[name].limit * scale();
  try {
    const r = await db.query<{ ok: boolean }>("select public.check_rate_limit($1, $2, $3) as ok", [
      `${name}:${subject}`,
      limit,
      windowSeconds,
    ]);
    return r.rows[0]?.ok ?? false;
  } catch (e) {
    console.error("[rate-limit] check failed", e);
    return name !== "auth" && name !== "authIp"; // fail closed for auth, open elsewhere
  }
}
