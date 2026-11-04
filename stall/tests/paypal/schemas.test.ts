import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paypal/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paypal/client")>();
  return { ...actual, paypalFetch: vi.fn() };
});

import { getAccessToken, PayPalError, paypalFetch, resetTokenCache } from "@/lib/paypal/client";
import { createAndSendInvoice, getInvoiceStatus, PartialInvoiceError } from "@/lib/paypal/invoices";
import { createPayout, getPayoutBatch } from "@/lib/paypal/payouts";
import { parseResponse, payoutCreateSchema } from "@/lib/paypal/schemas";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";

const mockFetch = vi.mocked(paypalFetch);
const SECRET_LOOKING = "do-not-echo-this-value";

beforeAll(() => {
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  vi.stubEnv("OWNER_PIN", "1234");
  vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key");
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  mockFetch.mockReset();
  resetTokenCache();
});

/** Asserts a status-0 PayPalError naming the bad path and carrying none of the body. */
function expectShapeError(error: unknown, path: string) {
  expect(error).toBeInstanceOf(PayPalError);
  const e = error as PayPalError;
  expect(e.status).toBe(0);
  expect(e.message).toBe(`invalid response shape: ${path}`);
  expect(e.body).toBe("");
  expect(e.message).not.toContain(SECRET_LOOKING);
}

describe("parseResponse", () => {
  it("returns the parsed value for a good shape", () => {
    expect(
      parseResponse(payoutCreateSchema, { batch_header: { payout_batch_id: "PB-1", batch_status: "PENDING" } }),
    ).toEqual({ batch_header: { payout_batch_id: "PB-1", batch_status: "PENDING" } });
  });
});

describe("malformed PayPal responses become PayPalError", () => {
  it("OAuth token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 42, scope: SECRET_LOOKING }), { status: 200 }));
    expectShapeError(await getAccessToken(fetchImpl).catch((e: unknown) => e), "access_token");
  });

  it("invoice create without id or href", async () => {
    mockFetch.mockResolvedValueOnce({ rel: "self", note: SECRET_LOOKING });
    expectShapeError(await createAndSendInvoice({} as never, "d").catch((e: unknown) => e), "id");
  });

  it("invoice get without an amount (inside the read step)", async () => {
    mockFetch
      .mockResolvedValueOnce({ id: "INV2-X" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: "INV2-X",
        status: "SENT",
        detail: { metadata: { recipient_view_url: "https://paypal.test/x" } },
        note: SECRET_LOOKING,
      });
    const error = await createAndSendInvoice({} as never, "d").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PartialInvoiceError);
    expectShapeError((error as PartialInvoiceError).cause, "amount");
  });

  it("invoice get for status without a status", async () => {
    mockFetch.mockResolvedValueOnce({ id: "INV2-X", note: SECRET_LOOKING });
    expectShapeError(await getInvoiceStatus("INV2-X").catch((e: unknown) => e), "status");
  });

  it("payout create without a batch id", async () => {
    mockFetch.mockResolvedValueOnce({ batch_header: { batch_status: "PENDING" }, note: SECRET_LOOKING });
    const error = await createPayout({ batchId: "b", receiverEmail: "a@b.test", cents: 100, note: "n" }).catch(
      (e: unknown) => e,
    );
    expectShapeError(error, "batch_header.payout_batch_id");
  });

  it("payout get with an item missing its status", async () => {
    mockFetch.mockResolvedValueOnce({
      batch_header: { batch_status: "SUCCESS" },
      items: [{ payout_item_id: "IT1" }],
    });
    expectShapeError(await getPayoutBatch("PB-1").catch((e: unknown) => e), "items.0.transaction_status");
  });

  it("webhook verification without a verification_status", async () => {
    const headers = new Headers({
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      "paypal-transmission-id": "tx-1",
      "paypal-transmission-sig": "sig-1",
      "paypal-transmission-time": "2026-11-07T18:00:05Z",
    });
    const fake = vi.fn().mockResolvedValue({ status: SECRET_LOOKING });
    const error = await verifyWebhookSignature(headers, JSON.stringify({ id: "WH-1" }), {
      paypalFetch: fake,
      webhookId: "W",
    }).catch((e: unknown) => e);
    expectShapeError(error, "verification_status");
  });
});
