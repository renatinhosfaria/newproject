import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "compose.spec.ts",
  timeout: 10 * 60 * 1000,
  workers: 1,
  reporter: "list",
});
