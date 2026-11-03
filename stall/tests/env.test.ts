import { describe, expect, it } from "vitest";
import { loadEnv } from "@/lib/env";

const validSample = {
  PAYPAL_CLIENT_ID: "client-id",
  PAYPAL_CLIENT_SECRET: "client-secret",
  PAYPAL_WEBHOOK_ID: "webhook-id",
  DATABASE_URL: "postgres://user:pass@localhost:5432/stall",
  ANTHROPIC_API_KEY: "sk-ant-test",
  OWNER_PIN: "1234",
  CLOSE_TRIGGER_KEY: "close-key",
};

describe("loadEnv", () => {
  it("throws listing the missing variables", () => {
    expect(() => loadEnv({})).toThrow(/PAYPAL_CLIENT_ID/);
  });

  it("defaults PAYPAL_ENV to sandbox and applies the other defaults", () => {
    const env = loadEnv(validSample);
    expect(env.PAYPAL_ENV).toBe("sandbox");
    expect(env.AI_MODEL).toBe("claude-sonnet-5-5");
    expect(env.BUSINESS_TZ).toBe("America/Chicago");
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("rejects an invalid PAYPAL_ENV", () => {
    expect(() => loadEnv({ ...validSample, PAYPAL_ENV: "prod" })).toThrow(
      /PAYPAL_ENV/,
    );
  });
});
