import { createHash } from "node:crypto";

/** One-way hash for IPs / user agents stored with consent events (no raw values kept). */
export function privacyHash(value: string | null | undefined): string | null {
  if (!value) return null;
  const salt = process.env.CONSENT_HASH_SALT ?? process.env.TOKEN_SIGNING_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}
