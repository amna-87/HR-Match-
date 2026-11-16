import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { checkRateLimit } from "@/lib/security/rate-limit";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb("ratelimit");
});
afterAll(async () => db?.close());

describe("rate limiting", () => {
  it("allows up to the limit per key, then blocks; keys are independent", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 11; i++) results.push(await checkRateLimit(db.pool, "auth", "1.2.3.4:a@x.test"));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results[10]).toBe(false);
    expect(await checkRateLimit(db.pool, "auth", "1.2.3.4:b@x.test")).toBe(true);
  });

  it("resets after the window", async () => {
    await db.root(
      "update rate_limits set window_start = now() - interval '11 minutes' where key = 'auth:1.2.3.4:a@x.test'",
    );
    expect(await checkRateLimit(db.pool, "auth", "1.2.3.4:a@x.test")).toBe(true);
  });
});
