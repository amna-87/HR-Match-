// Resend delivery webhooks are signed with Svix (headers svix-id, svix-timestamp, svix-signature).
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySvixSignature(secret: string, headers: { id: string; timestamp: string; signature: string }, body: string, now = Date.now()): boolean {
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false; // 5 min tolerance
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  return headers.signature.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export function deliveryStatusFor(eventType: string): "delivered" | "bounced" | "failed" | null {
  switch (eventType) {
    case "email.delivered":
      return "delivered";
    case "email.bounced":
    case "email.complained":
      return "bounced";
    case "email.failed":
      return "failed";
    default:
      return null;
  }
}
