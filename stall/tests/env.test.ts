import { describe, expect, it } from "vitest";
import { env, loadEnv } from "@/lib/env";

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

  it("accepts PAYPAL_ENV=live", () => {
    expect(loadEnv({ ...validSample, PAYPAL_ENV: "live" }).PAYPAL_ENV).toBe(
      "live",
    );
  });

  it("lists every required variable when all are missing", () => {
    let message = "";
    try {
      loadEnv({});
    } catch (error) {
      message = (error as Error).message;
    }
    for (const name of Object.keys(validSample)) {
      expect(message).toContain(name);
    }
  });
});

describe("env", () => {
  it("does not validate on import or on promise/symbol probes, only on access", () => {
    const saved = { ...process.env };
    for (const name of Object.keys(validSample)) delete process.env[name];
    try {
      expect(() => String(Object.prototype.toString.call(env))).not.toThrow();
      expect((env as unknown as { then?: unknown }).then).toBeUndefined();
      expect(() => env.PAYPAL_CLIENT_ID).toThrow(/PAYPAL_CLIENT_ID/);
    } finally {
      process.env = saved;
    }
  });
});

describe("OWNER_PIN", () => {
  it("must be 4 to 6 digits, which is what the keypad can type", () => {
    for (const pin of ["1234", "123456"]) expect(loadEnv({ ...validSample, OWNER_PIN: pin }).OWNER_PIN).toBe(pin);
    for (const pin of ["123", "1234567", "12a4", "pass"]) {
      expect(() => loadEnv({ ...validSample, OWNER_PIN: pin })).toThrow(/OWNER_PIN/);
    }
  });
});
