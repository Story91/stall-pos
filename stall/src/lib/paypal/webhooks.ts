import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sales, webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { emit } from "@/lib/events";
import { markPaid } from "@/lib/sales";
import { paypalFetch } from "./client";

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

  const result = await (deps.paypalFetch ?? paypalFetch)<{
    verification_status?: string;
  }>({
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
  return result?.verification_status === "SUCCESS";
}

type Handler = (db: Db, event: WebhookEvent) => Promise<"processed" | "unmatched" | "ignored">;

type InvoiceResource = {
  id?: string;
  invoice?: {
    id?: string;
    payments?: { transactions?: { date?: string }[] };
  };
};

async function onInvoicePaid(db: Db, event: WebhookEvent) {
  const resource = (event.resource ?? {}) as InvoiceResource;
  // PayPal nests the invoice under `resource.invoice` for invoicing events.
  const invoiceId = resource.invoice?.id ?? resource.id;
  if (!invoiceId) return "unmatched" as const;

  const [sale] = await db.select().from(sales).where(eq(sales.invoiceId, invoiceId));
  if (!sale) return "unmatched" as const;

  const when = new Date(
    resource.invoice?.payments?.transactions?.[0]?.date ?? event.create_time ?? Date.now(),
  );
  await markPaid(db, sale.id, "paypal", Number.isNaN(when.getTime()) ? new Date() : when);
  // Emit even when already paid: the screen may have missed the first signal.
  emit({ type: "sale.paid", saleId: sale.id });
  return "processed" as const;
}

// Task 13 adds payout entries here.
const handlers: Record<string, Handler> = {
  "INVOICING.INVOICE.PAID": onInvoicePaid,
  "PAYMENT.PAYOUTS-ITEM.*": async () => "ignored",
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
