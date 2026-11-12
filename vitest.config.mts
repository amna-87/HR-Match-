import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      LOCAL_PG_ADMIN_URL: process.env.LOCAL_PG_ADMIN_URL ?? "postgresql://postgres@localhost:54322/postgres",
      TOKEN_SIGNING_SECRET: "test-secret-test-secret-test-secret-123",
      EMBEDDINGS_PROVIDER: "local",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
});
