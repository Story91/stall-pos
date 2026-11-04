import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paypal/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paypal/client")>();
  return { ...actual, paypalFetch: vi.fn() };
});

import { PayPalError, paypalFetch } from "@/lib/paypal/client";
import { createPayout, getPayoutBatch, PayoutDuplicateError } from "@/lib/paypal/payouts";

const mockFetch = vi.mocked(paypalFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("createPayout", () => {
  it("posts one EMAIL item with a 2-decimal USD amount and the batch id as idempotency key", async () => {
    mockFetch.mockResolvedValueOnce({
      batch_header: { payout_batch_id: "PB-REAL-1", batch_status: "PENDING" },
    });
    const result = await createPayout({
      batchId: "st-b-a1b2c3d4e5f60718293a4b5c6",
      receiverEmail: "rosa@example.com",
      cents: 12000,
      note: "Tortilla delivery",
    });
    expect(result).toEqual({
      batchId: "st-b-a1b2c3d4e5f60718293a4b5c6",
      paypalBatchId: "PB-REAL-1",
      status: "PENDING",
    });
    expect(mockFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/payments/payouts",
      requestId: "st-b-a1b2c3d4e5f60718293a4b5c6",
      body: {
        sender_batch_header: {
          sender_batch_id: "st-b-a1b2c3d4e5f60718293a4b5c6",
          email_subject: "You have a payment from Stall",
          email_message: "Tortilla delivery",
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: "rosa@example.com",
            amount: { value: "120.00", currency: "USD" },
            note: "Tortilla delivery",
            sender_item_id: "st-b-a1b2c3d4e5f60718293a4b5c6",
            recipient_wallet: "PAYPAL",
          },
        ],
      },
    });
  });

  it("rethrows a 400 duplicate sender_batch_id as PayoutDuplicateError", async () => {
    mockFetch.mockRejectedValueOnce(
      new PayPalError(
        "PayPal 400",
        400,
        '{"name":"USER_BUSINESS_ERROR","details":[{"issue":"DUPLICATE_BATCH_ID"}]}',
        "dbg",
      ),
    );
    const error = await createPayout({
      batchId: "dup-1",
      receiverEmail: "a@b.test",
      cents: 100,
      note: "n",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(PayoutDuplicateError);
    expect(error.batchId).toBe("dup-1");
  });

  it("does not convert other PayPal errors", async () => {
    const input = { batchId: "x", receiverEmail: "a@b.test", cents: 100, note: "n" };
    const validation = new PayPalError("PayPal 400", 400, '{"name":"VALIDATION_ERROR"}');
    mockFetch.mockRejectedValueOnce(validation);
    await expect(createPayout(input)).rejects.toBe(validation);
    const server = new PayPalError("PayPal 500", 500, "DUPLICATE");
    mockFetch.mockRejectedValueOnce(server);
    await expect(createPayout(input)).rejects.toBe(server);
  });
});

describe("getPayoutBatch", () => {
  it("maps batch status and items", async () => {
    mockFetch.mockResolvedValueOnce({
      batch_header: { batch_status: "SUCCESS" },
      items: [{ payout_item_id: "IT1", transaction_status: "SUCCESS" }],
    });
    expect(await getPayoutBatch("PB-1")).toEqual({
      status: "SUCCESS",
      items: [{ itemId: "IT1", status: "SUCCESS" }],
    });
    expect(mockFetch).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/payments/payouts/PB-1",
    });
  });
});
