import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/pin/route";
import { ApiError } from "@/lib/apiError";
import { ownerCookieValue, requireOwner } from "@/lib/auth";
import { resetPinLimiter } from "@/lib/pinLimiter";

const PIN = "4821";

beforeAll(() => {
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("OWNER_PIN", PIN);
  vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key-for-tests");
});

beforeEach(() => resetPinLimiter());
afterEach(() => {
  vi.useRealTimers();
});

async function postPin(body: unknown, ip?: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/** "stall_owner=abc; Path=/; ..." -> "abc" */
function cookieValue(setCookie: string): string {
  return setCookie.split(";")[0]!.split("=").slice(1).join("=");
}

describe("POST /api/pin", () => {
  it("rejects a wrong PIN with 401, after a delay, and sets no cookie", async () => {
    const started = Date.now();
    const response = await postPin({ pin: "0000" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "wrong_pin" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });

  it("sets an owner cookie that requireOwner accepts for the right PIN", async () => {
    const response = await postPin({ pin: PIN });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^stall_owner=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=2592000/);
    expect(setCookie).not.toMatch(/Secure/i); // APP_URL is http in tests

    const value = cookieValue(setCookie);
    expect(value).toBe(ownerCookieValue());
    const next = new Request("http://localhost/api/day/2026-11-04", {
      headers: { Cookie: `stall_owner=${value}` },
    });
    expect(() => requireOwner(next)).not.toThrow();
  });

  it("does not accept the PIN itself as the cookie", async () => {
    const forged = new Request("http://localhost/api/sales", {
      headers: { Cookie: `stall_owner=${PIN}` },
    });
    expect(() => requireOwner(forged)).toThrow(ApiError);
  });

  it("answers 400 for a body without a PIN", async () => {
    const response = await postPin("not json");
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("PIN lockout", () => {
  it("locks after 5 wrong PINs: the 6th attempt is 429 with Retry-After", async () => {
    for (let i = 0; i < 5; i++) expect((await postPin({ pin: "0000" })).status).toBe(401);

    const locked = await postPin({ pin: "0000" });
    expect(locked.status).toBe(429);
    const body = (await locked.json()) as { error: string; retryAfterSeconds: number };
    expect(body.error).toBe("locked");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(locked.headers.get("retry-after")).toBe(String(body.retryAfterSeconds));

    // Even the right PIN waits out the lock, or guessing could continue.
    expect((await postPin({ pin: PIN })).status).toBe(429);
  }, 20_000);

  it("queues concurrent wrong attempts, so a burst cannot outrun the lock", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => postPin({ pin: "0000" })));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(3);
  }, 20_000);

  it("accepts the right PIN after the lock expires and resets the counter", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    for (let i = 0; i < 5; i++) await postPin({ pin: "0000" });
    expect((await postPin({ pin: PIN })).status).toBe(429);

    vi.setSystemTime(new Date("2026-11-04T12:00:31Z"));
    expect((await postPin({ pin: PIN })).status).toBe(200);

    // Reset: four more wrong attempts do not lock.
    for (let i = 0; i < 4; i++) expect((await postPin({ pin: "0000" })).status).toBe(401);
    expect((await postPin({ pin: PIN })).status).toBe(200);
  }, 20_000);

  it("doubles the lock each time it is hit again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    for (let i = 0; i < 5; i++) await postPin({ pin: "0000" });
    vi.setSystemTime(new Date("2026-11-04T12:00:31Z"));
    for (let i = 0; i < 5; i++) expect((await postPin({ pin: "0000" })).status).toBe(401);
    const second = (await (await postPin({ pin: "0000" })).json()) as { retryAfterSeconds: number };
    expect(second.retryAfterSeconds).toBeGreaterThan(30);
    expect(second.retryAfterSeconds).toBeLessThanOrEqual(60);
  }, 20_000);

  it("counts per IP as well as globally", async () => {
    const { pinLock } = await import("@/lib/pinLimiter");
    for (let i = 0; i < 5; i++) await postPin({ pin: "0000" }, "203.0.113.7, 10.0.0.1");
    expect(pinLock(["ip:203.0.113.7"], Date.now())).not.toBeNull();
  }, 20_000);
});

describe("GET /api/pin", () => {
  it("tells the keypad how many digits to expect, not the PIN", async () => {
    const response = GET();
    expect(await response.json()).toEqual({ length: 4 });
  });
});
