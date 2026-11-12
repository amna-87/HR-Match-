import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "@/lib/consent/tokens";
import { ALL_STATUSES, canTransition } from "@/lib/consent/state-machine";

describe("signed email tokens", () => {
  const future = new Date(Date.now() + 3600_000);

  it("round-trips a valid token", () => {
    const t = signToken("match_approve", "m1", "c1", future);
    const r = verifyToken(t, ["match_approve"]);
    expect(r.ok && r.payload.s).toBe("m1");
  });

  it("rejects expired tokens", () => {
    const t = signToken("match_approve", "m1", "c1", new Date(Date.now() - 1000));
    expect(verifyToken(t, ["match_approve"])).toEqual({ ok: false, reason: "expired" });
  });

  it("is single-purpose: an unsubscribe token can't approve a match", () => {
    const t = signToken("unsubscribe", "c1", "c1", future);
    expect(verifyToken(t, ["match_approve", "match_decline"])).toEqual({ ok: false, reason: "wrong_purpose" });
  });

  it("rejects tampered payloads and signatures", () => {
    const t = signToken("match_decline", "m1", "c1", future);
    const [body, sig] = t.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.p = "match_approve";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    expect(verifyToken(forged, ["match_approve"]).ok).toBe(false);
    expect(verifyToken(`${body}.AAAA`, ["match_decline"]).ok).toBe(false);
    expect(verifyToken("garbage", ["match_decline"]).ok).toBe(false);
  });

  it("each token is unique (nonce)", () => {
    expect(signToken("match_view", "m", "c", future)).not.toBe(signToken("match_view", "m", "c", future));
  });
});

describe("TS state machine matches the spec", () => {
  it("verified flow", () => {
    expect(canTransition("verified", "suggested", "notified")).toBe(true);
    expect(canTransition("verified", "notified", "approved")).toBe(true);
    expect(canTransition("verified", "approved", "applied")).toBe(true);
    expect(canTransition("verified", "notified", "applied")).toBe(false);
    expect(canTransition("verified", "suggested", "approved")).toBe(false);
    for (const s of ALL_STATUSES) if (s !== "declined") expect(canTransition("verified", "declined", s)).toBe(false);
  });
  it("sourced flow", () => {
    expect(canTransition("sourced", "notified", "viewed")).toBe(true);
    expect(canTransition("sourced", "notified", "approved")).toBe(false);
    expect(canTransition("sourced", "approved", "applied")).toBe(false);
  });
});
