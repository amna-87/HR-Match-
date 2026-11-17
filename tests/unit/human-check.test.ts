import { describe, expect, it } from "vitest";
process.env.TOKEN_SIGNING_SECRET ||= "x".repeat(40);
const { newChallenge, checkAnswer } = await import("@/lib/jobs/human-check");

describe("human check for revealing contacts", () => {
  it("accepts the right sum for the same job only, before it expires", () => {
    const job = "00000000-0000-4000-8000-00000000f001";
    const c = newChallenge(job, 1_000_000_000_000);
    const [a, b] = c.question.match(/\d+/g)!.map(Number);
    expect(checkAnswer(job, c.token, String(a + b), 1_000_000_000_000)).toBe(true);
    expect(checkAnswer(job, c.token, String(a + b + 1), 1_000_000_000_000)).toBe(false);
    expect(checkAnswer("00000000-0000-4000-8000-00000000f002", c.token, String(a + b), 1_000_000_000_000)).toBe(false);
    expect(checkAnswer(job, c.token, String(a + b), 1_000_000_000_000 + 16 * 60_000)).toBe(false);
    expect(checkAnswer(job, "garbage", "5")).toBe(false);
  });
});
