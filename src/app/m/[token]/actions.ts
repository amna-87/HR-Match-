"use server";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/consent/tokens";
import { getPool } from "@/lib/db";
import { requestMeta } from "@/lib/server/context";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Email-link responses. The token is verified here (signature, expiry, purpose)
 * and the candidate id comes ONLY from the token. The database function then
 * re-checks ownership and state, and writes the consent event.
 */
export async function respondFromEmail(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const back = (q: string) => redirect(`/m/${encodeURIComponent(token)}?${q}`);
  const { ip, ipHash, uaHash } = await requestMeta();
  if (!(await checkRateLimit(getPool(), "emailLink", ip))) back("error=rate_limited");
  const v = verifyToken(token, ["match_approve", "match_decline"]);
  if (!v.ok) back(`error=${v.reason}`);
  const payload = v.ok ? v.payload : null;
  const decision = payload!.p === "match_approve" ? "approve" : "decline";
  try {
    const r = await getPool().query<{ r: { status: string } }>(
      "select public.respond_to_match($1, $2, $3, $4, $5) as r",
      [payload!.s, decision, ipHash, uaHash, payload!.c],
    );
    back(`done=${r.rows[0].r.status}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // let redirect() through
    back(`error=${encodeURIComponent(e instanceof Error ? e.message : "failed")}`);
  }
}
