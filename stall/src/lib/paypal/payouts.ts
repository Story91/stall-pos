import { PayPalError, paypalFetch, toMoney } from "./client";

/** PayPal rejected the batch because its `sender_batch_id` was already used. */
export class PayoutDuplicateError extends Error {
  constructor(readonly batchId: string) {
    super(`PayPal payout batch ${batchId} already exists`);
    this.name = "PayoutDuplicateError";
  }
}

/**
 * Sends one payout to a PayPal email. `batchId` is both the sender batch id and
 * the request id, so a retried call can never pay twice.
 */
export async function createPayout(input: {
  batchId: string;
  receiverEmail: string;
  cents: number;
  note: string;
}): Promise<{ batchId: string; status: string }> {
  try {
    const body = await paypalFetch<{
      batch_header: { payout_batch_id: string; batch_status: string };
    }>({
      method: "POST",
      path: "/v1/payments/payouts",
      requestId: input.batchId,
      body: {
        sender_batch_header: {
          sender_batch_id: input.batchId,
          email_subject: "You have a payment from Stall",
          email_message: input.note,
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: input.receiverEmail,
            amount: { value: toMoney(input.cents), currency: "USD" },
            note: input.note,
            sender_item_id: input.batchId,
            recipient_wallet: "PAYPAL",
          },
        ],
      },
    });
    return {
      batchId: body.batch_header.payout_batch_id,
      status: body.batch_header.batch_status,
    };
  } catch (error) {
    if (error instanceof PayPalError && error.status === 400 && error.body.includes("DUPLICATE")) {
      throw new PayoutDuplicateError(input.batchId);
    }
    throw error;
  }
}

export async function getPayoutBatch(
  batchId: string,
): Promise<{ status: string; items: { itemId: string; status: string }[] }> {
  const body = await paypalFetch<{
    batch_header: { batch_status: string };
    items?: { payout_item_id: string; transaction_status: string }[];
  }>({ method: "GET", path: `/v1/payments/payouts/${batchId}` });
  return {
    status: body.batch_header.batch_status,
    items: (body.items ?? []).map((i) => ({
      itemId: i.payout_item_id,
      status: i.transaction_status,
    })),
  };
}
