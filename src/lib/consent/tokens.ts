// Signed, expiring, single-purpose tokens for email links (Section 8).
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload)).
// Single-use is enforced by state: an answered match can't be answered again,
// and respond_to_match is idempotent for repeat clicks.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type TokenPurpose = "match_approve" | "match_decline" | "match_view" | "unsubscribe" | "outreach_opt_out";

export interface TokenPayload {
  p: TokenPurpose; // purpose
  s: string; // subject id (match id, or candidate id for unsubscribe)
  c: string; // candidate id
  e: number; // expiry (unix seconds)
  n: string; // nonce
}

function secret(): Buffer {
  const s = process.env.TOKEN_SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error("TOKEN_SIGNING_SECRET must be set (32+ chars)");
  return Buffer.from(s);
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signToken(purpose: TokenPurpose, subjectId: string, candidateId: string, expiresAt: Date): string {
  const payload: TokenPayload = {
    p: purpose,
    s: subjectId,
    c: candidateId,
    e: Math.floor(expiresAt.getTime() / 1000),
    n: randomBytes(8).toString("base64url"),
  };
  const body = b64(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(`${purpose}.${body}`).digest();
  return `${body}.${b64(sig)}`;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_purpose" };

export function verifyToken(token: string, allowed: TokenPurpose[], now = new Date()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.p !== "string" || typeof payload.s !== "string" || typeof payload.e !== "number") {
    return { ok: false, reason: "malformed" };
  }
  // purpose is bound into the MAC, so a token can't be re-labelled
  const expected = createHmac("sha256", secret()).update(`${payload.p}.${body}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return { ok: false, reason: "bad_signature" };
  if (!allowed.includes(payload.p)) return { ok: false, reason: "wrong_purpose" };
  if (payload.e * 1000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
