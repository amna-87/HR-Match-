"use server";
import { getSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requestMeta } from "@/lib/server/context";
import { checkAnswer } from "@/lib/jobs/human-check";

export type RevealResult = { target?: string; instructions?: string | null; error?: string };

/**
 * Reveal a public job's apply contact: to signed-in users, or after the human
 * check. Only jobs on the public board; rate limited per IP.
 */
export async function revealJobContact(jobId: string, token?: string, answer?: string): Promise<RevealResult> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { error: "Job not found." };
  const { user } = await getSession();
  const { ipHash } = await requestMeta();
  if (!(await checkRateLimit(getPool(), "reveal", user?.id ?? ipHash ?? "unknown")))
    return { error: "Too many requests. Please try again later." };
  if (!user && !checkAnswer(jobId, token ?? "", answer ?? "")) return { error: "That answer isn't right. Try again." };
  const r = await getPool().query<{ apply_target: string | null; apply_instructions: string | null }>(
    `select apply_target, apply_instructions from public.jobs
     where id = $1 and status = 'published' and visibility = 'public' and (expires_at is null or expires_at > now())`,
    [jobId],
  );
  if (!r.rows[0]?.apply_target) return { error: "This job is no longer open." };
  return { target: r.rows[0].apply_target, instructions: r.rows[0].apply_instructions };
}
