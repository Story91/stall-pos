import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { payouts, sales, webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { emit } from "@/lib/events";
import { applyPayoutStatus } from "./payoutStatus";
import { markPaid } from "@/lib/sales";
import { paypalFetch } from "./client";
import { parseResponse, webhookVerifySchema } from "./schemas";

export type WebhookEvent = {
  id: string;
  event_type: string;
  create_time?: string;
  resource: unknown;
};

export type WebhookResult = "processed" | "duplicate" | "unmatched" | "ignored";

type VerifyDeps = {
  paypalFetch?: typeof paypalFetch;
  webhookId?: string;
};

/**
 * Asks PayPal to verify the transmission signature of a webhook. Must be called
 * with the exact raw body PayPal sent. Returns false when any header is missing.
 */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
  deps: VerifyDeps = {},
): Promise<boolean> {
  const authAlgo = headers.get("paypal-auth-algo");
  const certUrl = headers.get("paypal-cert-url");
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionSig = headers.get("paypal-transmission-sig");
  const transmissionTime = headers.get("paypal-transmission-time");
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  const response = await (deps.paypalFetch ?? paypalFetch)<unknown>({
    method: "POST",
    path: "/v1/notifications/verify-webhook-signature",
    body: {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: deps.webhookId ?? env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody),
    },
  });
  return parseResponse(webhookVerifySchema, response).verification_status === "SUCCESS";
}

type Handler = (db: Db, event: WebhookEvent) => Promise<"processed" | "unmatched" | "ignored">;

type InvoiceResource = {
  id?: string;
  invoice?: {
    id?: string;
    // Real payloads carry payment_date_time (ISO) and payment_date (YYYY-MM-DD); there is no `date`.
    payments?: { transactions?: { payment_date_time?: string; payment_date?: string }[] };
  };
};

/** When the customer paid: payment_date_time, else payment_date, else the event time, else now. */
export function invoicePaidAt(
  event: Pick<WebhookEvent, "resource" | "create_time">,
  now = new Date(),
): Date {
  const transaction = ((event.resource ?? {}) as InvoiceResource).invoice?.payments?.transactions?.[0];
  for (const value of [transaction?.payment_date_time, transaction?.payment_date, event.create_time]) {
    if (!value) continue;
    const when = new Date(value);
    if (!Number.isNaN(when.getTime())) return when;
  }
  return now;
}

async function onInvoicePaid(db: Db, event: WebhookEvent) {
  const resource = (event.resource ?? {}) as InvoiceResource;
  // PayPal nests the invoice under `resource.invoice` for invoicing events.
  const invoiceId = resource.invoice?.id ?? resource.id;
  if (!invoiceId) return "unmatched" as const;

  const [sale] = await db.select().from(sales).where(eq(sales.invoiceId, invoiceId));
  if (!sale) return "unmatched" as const;

  await markPaid(db, sale.id, "paypal", invoicePaidAt(event));
  // Emit even when already paid: the screen may have missed the first signal.
  emit({ type: "sale.paid", saleId: sale.id });
  return "processed" as const;
}

type PayoutItemFields = { payout_batch_id?: string; payout_item_id?: string };
type PayoutItemResource = PayoutItemFields & { payout_item?: PayoutItemFields };

function payoutStatusHandler(status: "SUCCESS" | "FAILED" | "UNCLAIMED"): Handler {
  return async (db, event) => {
    const resource = (event.resource ?? {}) as PayoutItemResource;
    // Some payloads nest the item fields under `resource.payout_item`.
    const batchId = resource.payout_batch_id ?? resource.payout_item?.payout_batch_id;
    const itemId = resource.payout_item_id ?? resource.payout_item?.payout_item_id;
    if (!batchId) return "unmatched" as const;

    // PayPal's batch id first; our sender batch id covers rows without one.
    let [payout] = await db.select().from(payouts).where(eq(payouts.paypalBatchId, batchId));
    if (!payout) {
      [payout] = await db.select().from(payouts).where(eq(payouts.batchId, batchId));
    }
    if (!payout) return "unmatched" as const;
    return applyPayoutStatus(db, payout, status, itemId);
  };
}

const handlers: Record<string, Handler> = {
  "INVOICING.INVOICE.PAID": onInvoicePaid,
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": payoutStatusHandler("SUCCESS"),
  "PAYMENT.PAYOUTS-ITEM.FAILED": payoutStatusHandler("FAILED"),
  "PAYMENT.PAYOUTS-ITEM.BLOCKED": payoutStatusHandler("FAILED"),
  "PAYMENT.PAYOUTS-ITEM.DENIED": payoutStatusHandler("FAILED"),
  "PAYMENT.PAYOUTS-ITEM.REFUNDED": payoutStatusHandler("FAILED"),
  "PAYMENT.PAYOUTS-ITEM.RETURNED": payoutStatusHandler("FAILED"),
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": payoutStatusHandler("UNCLAIMED"),
};

function handlerFor(type: string): Handler | undefined {
  if (handlers[type]) return handlers[type];
  const wildcard = Object.keys(handlers).find(
    (key) => key.endsWith(".*") && type.startsWith(key.slice(0, -1)),
  );
  return wildcard ? handlers[wildcard] : undefined;
}

/**
 * Stores the event (idempotent on its id) and dispatches it. An event whose
 * first delivery was unmatched or failed has no `processed_at`, so a redelivery
 * is processed again instead of being dropped as a duplicate.
 */
export async function handleWebhookEvent(
  db: Db,
  event: WebhookEvent,
): Promise<WebhookResult> {
  const inserted = await db
    .insert(webhookEvents)
    .values({
      id: event.id,
      type: event.event_type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: webhookEvents.id })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    const [existing] = await db
      .select({ processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(eq(webhookEvents.id, event.id));
    if (existing?.processedAt) return "duplicate";
  }

  const handler = handlerFor(event.event_type);
  const outcome = handler ? await handler(db, event) : "ignored";
  if (outcome === "unmatched") return "unmatched";

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, event.id));
  return outcome;
}
