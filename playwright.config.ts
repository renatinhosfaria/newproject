import { defineConfig, devices } from "@playwright/test";

// Each test starts its own API harness (isolated PostgreSQL schema) behind a
// same-origin proxy; see tests/e2e/fixtures.ts. Only the built Next.js server
// is shared, because it holds no user data.
const webURL = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100";
const port = new URL(webURL).port || "3100";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    {
      name: "desktop-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Direct node process so Playwright can stop it (no package-manager wrapper).
    command: `node apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port ${port}`,
    url: webURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
