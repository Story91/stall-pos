import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/pin/route";
import { ApiError } from "@/lib/apiError";
import { ownerCookieValue, requireOwner } from "@/lib/auth";

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

async function postPin(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
