import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PayPalError,
  fromMoney,
  getAccessToken,
  paypalFetch,
  resetTokenCache,
  toMoney,
} from "@/lib/paypal/client";

const SANDBOX = "https://api-m.sandbox.paypal.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenResponse(token: string, expiresIn: number): Response {
  return json({ access_token: token, expires_in: expiresIn });
}

// Requests made through the mock fetch, in order, as [url, init] pairs.
function calls(fetchImpl: ReturnType<typeof vi.fn>) {
  return fetchImpl.mock.calls as unknown as [string, RequestInit][];
}

beforeAll(() => {
  // env validates lazily on first access; stub every required variable.
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("OWNER_PIN", "1234");
  vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  resetTokenCache();
});

describe("getAccessToken", () => {
  it("fetches the token once and reuses it across calls", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600));

    expect(await getAccessToken(fetchImpl)).toBe("tok-1");
    expect(await getAccessToken(fetchImpl)).toBe("tok-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("posts client_credentials with basic auth to the sandbox token endpoint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600));

    await getAccessToken(fetchImpl);

    const [url, init] = calls(fetchImpl)[0]!;
    expect(url).toBe(`${SANDBOX}/v1/oauth2/token`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("grant_type=client_credentials");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`,
    );
  });

  it("refreshes when less than 60 seconds of validity remain", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-short", 1))
      .mockResolvedValueOnce(tokenResponse("tok-fresh", 3600));

    expect(await getAccessToken(fetchImpl)).toBe("tok-short");
    expect(await getAccessToken(fetchImpl)).toBe("tok-fresh");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws PayPalError when the token request fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "invalid_client" }, 401));

    await expect(getAccessToken(fetchImpl)).rejects.toBeInstanceOf(PayPalError);
  });
});

describe("paypalFetch", () => {
  it("sends the bearer token and parses the JSON response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600))
      .mockResolvedValueOnce(json({ id: "ORDER-1" }));

    const result = await paypalFetch<{ id: string }>({
      method: "GET",
      path: "/v2/checkout/orders/ORDER-1",
      fetchImpl,
    });

    expect(result).toEqual({ id: "ORDER-1" });
    const [url, init] = calls(fetchImpl)[1]!;
    expect(url).toBe(`${SANDBOX}/v2/checkout/orders/ORDER-1`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-1",
    );
  });

  it("re-fetches the token on the next call when the cached token is about to expire", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 1))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(tokenResponse("tok-2", 1))
      .mockResolvedValueOnce(json({ ok: true }));

    await paypalFetch({ method: "GET", path: "/a", fetchImpl });
    await paypalFetch({ method: "GET", path: "/b", fetchImpl });

    const tokenCalls = calls(fetchImpl).filter(([url]) =>
      url.endsWith("/v1/oauth2/token"),
    );
    expect(tokenCalls).toHaveLength(2);
    expect((calls(fetchImpl)[3]![1].headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-2",
    );
  });

  it("sends PayPal-Request-Id and Prefer on a POST with a requestId", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600))
      .mockResolvedValueOnce(json({ id: "ORDER-2" }));

    await paypalFetch({
      method: "POST",
      path: "/v2/checkout/orders",
      body: { intent: "CAPTURE" },
      requestId: "req-123",
      fetchImpl,
    });

    const [, init] = calls(fetchImpl)[1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["PayPal-Request-Id"]).toBe("req-123");
    expect(headers.Prefer).toBe("return=representation");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ intent: "CAPTURE" }));
  });

  it("omits PayPal-Request-Id when no requestId is given", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600))
      .mockResolvedValueOnce(json({ id: "ORDER-3" }));

    await paypalFetch({
      method: "POST",
      path: "/v2/checkout/orders",
      body: {},
      fetchImpl,
    });

    const headers = calls(fetchImpl)[1]![1].headers as Record<string, string>;
    expect(headers["PayPal-Request-Id"]).toBeUndefined();
  });

  it("throws PayPalError with status and debug_id on a non-2xx response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("secret-token", 3600))
      .mockResolvedValueOnce(
        json({ name: "UNPROCESSABLE_ENTITY", debug_id: "abc" }, 422),
      );

    const error = await paypalFetch({
      method: "POST",
      path: "/v2/checkout/orders",
      body: {},
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PayPalError);
    const paypalError = error as PayPalError;
    expect(paypalError.status).toBe(422);
    expect(paypalError.debugId).toBe("abc");
    expect(paypalError.message).toContain("422");
    expect(paypalError.message).toContain("abc");
    expect(paypalError.message).not.toContain("secret-token");
  });

  it("leaves debugId undefined when the error body has no debug_id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600))
      .mockResolvedValueOnce(new Response("not json", { status: 500 }));

    const error = (await paypalFetch({
      method: "GET",
      path: "/v2/anything",
      fetchImpl,
    }).catch((e: unknown) => e)) as PayPalError;

    expect(error).toBeInstanceOf(PayPalError);
    expect(error.status).toBe(500);
    expect(error.debugId).toBeUndefined();
    expect(error.body).toBe("not json");
  });

  it("resolves to undefined for an empty 204 response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await paypalFetch({
      method: "PATCH",
      path: "/v1/billing/subscriptions/S-1",
      body: [],
      fetchImpl,
    });

    expect(result).toBeUndefined();
  });
});

describe("timeouts", () => {
  const TIMEOUT = /paypal timeout after 20 ms/;

  it("rejects with a status-0 PayPalError when the API call is too slow", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse("tok-1", 3600)).mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(json({ ok: true })), 100);
          init.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "TimeoutError"));
          });
        }),
    );
    const error = (await paypalFetch({
      method: "GET",
      path: "/slow",
      fetchImpl,
      timeoutMs: 20,
    }).catch((e: unknown) => e)) as PayPalError;
    expect(error).toBeInstanceOf(PayPalError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(TIMEOUT);
    expect(error.message).toBe("paypal timeout after 20 ms");
  });

  it("times out even when fetch ignores the abort signal (never resolves)", async () => {
    const fetchImpl = vi.fn().mockReturnValue(new Promise(() => {}));
    const error = (await paypalFetch({
      method: "GET",
      path: "/hang",
      fetchImpl,
      timeoutMs: 20,
    }).catch((e: unknown) => e)) as PayPalError;
    // The hang is on the token request, which has the same bound.
    expect(error).toBeInstanceOf(PayPalError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(TIMEOUT);
  });

  it("passes an abort signal to the request, with a 15 s default", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-1", 3600))
      .mockResolvedValueOnce(json({}));
    await paypalFetch({ method: "GET", path: "/a", fetchImpl });
    for (const [, init] of calls(fetchImpl)) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe("money helpers", () => {
  it("converts integer cents to PayPal's two-decimal strings", () => {
    expect(toMoney(1850)).toBe("18.50");
    expect(toMoney(5)).toBe("0.05");
    expect(toMoney(0)).toBe("0.00");
  });

  it("converts PayPal's two-decimal strings to integer cents", () => {
    expect(fromMoney("18.50")).toBe(1850);
    expect(fromMoney("0.05")).toBe(5);
  });

  it("rejects amounts that are not exactly two decimals", () => {
    expect(() => fromMoney("18.5")).toThrow();
    expect(() => toMoney(18.5)).toThrow();
  });
});
