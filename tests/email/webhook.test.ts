import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deliveryStatusFor, verifySvixSignature } from "@/lib/email/webhook";

describe("resend webhook verification", () => {
  const secret = "whsec_" + Buffer.from("super-secret-key-material").toString("base64");
  const sign = (id: string, ts: string, body: string) =>
    "v1," + createHmac("sha256", Buffer.from("super-secret-key-material")).update(`${id}.${ts}.${body}`).digest("base64");

  it("accepts valid signatures and rejects forgeries / replays", () => {
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"email.delivered"}';
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(true);
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body + " ", now)).toBe(false);
    const old = String(Math.floor(now / 1000) - 3600);
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: old, signature: sign("msg_1", old, body) }, body, now)).toBe(false);
  });

  it("maps event types", () => {
    expect(deliveryStatusFor("email.delivered")).toBe("delivered");
    expect(deliveryStatusFor("email.bounced")).toBe("bounced");
    expect(deliveryStatusFor("email.opened")).toBeNull();
  });
});
