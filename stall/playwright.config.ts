import { defineConfig, devices } from "@playwright/test";

// Smoke test against `npm run dev` with in-memory Postgres and offline doubles
// for PayPal and the parser, so it needs no network, keys or database.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  // First requests compile routes and boot PGlite in dev, so allow for it.
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/pin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "pglite://memory",
      PAYPAL_MOCK: "1",
      PARSE_MOCK: "1",
      PAYPAL_WEBHOOK_SKIP_VERIFY: "1",
      OWNER_PIN: "1234",
      CLOSE_TRIGGER_KEY: "test-key",
      ANTHROPIC_API_KEY: "test",
      PAYPAL_CLIENT_ID: "x",
      PAYPAL_CLIENT_SECRET: "x",
      PAYPAL_WEBHOOK_ID: "x",
    },
  },
});
