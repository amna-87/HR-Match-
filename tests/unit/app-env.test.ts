import { afterEach, describe, expect, it, vi } from "vitest";
import { appEnv } from "@/lib/app-env";

afterEach(() => vi.unstubAllEnvs());

describe("appEnv", () => {
  it("maps Vercel environments", () => {
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(appEnv()).toBe("staging");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(appEnv()).toBe("production");
  });
  it("APP_ENV overrides", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_ENV", "staging");
    expect(appEnv()).toBe("staging");
  });
});
