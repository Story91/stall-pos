import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import { payouts, sales, webhookEvents } from "@/db/schema";
import { chargeSale, getBusiness, getSale } from "@/lib/sales";
import { subscribe, type StallEvent } from "@/lib/events";
import fixture from "./fixtures/webhook-invoice-paid.json";
import payoutFixture from "./fixtures/webhook-payout-item-succeeded.json";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

const verify = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/paypal/webhooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paypal/webhooks")>()),
  verifyWebhookSignature: vi.fn(async () => verify.ok),
}));

import { POST } from "@/app/api/paypal/webhook/route";

function hook(body: unknown): Request {
  return new Request("http://localhost/api/paypal/webhook", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function event(id: string, invoiceId: string) {
  return {
    ...fixture,
    id,
    resource: { invoice: { ...fixture.resource.invoice, id: invoiceId } },
  };
}

const PAID_AT = "2026-11-07T18:00:00.000Z";

describe("PayPal webhook route", () => {
  let close: () => Promise<void>;
  let saleId: string;
  const invoiceId = "INV2-WEBHOOK";
  const emitted: StallEvent[] = [];
  let off: () => void;

  beforeAll(async () => {
    const test = await createTestDb();
    holder.db = test.db;
    close = test.close;
    await seed(test.db);
    const business = await getBusiness(test.db);
    const charge = await chargeSale(
      test.db,
      {
        invoices: {
          createAndSendInvoice: async () => ({ invoiceId, payLink: "https://paypal.test/p" }),
          generateQr: async () => "QR",
        },
      },
      {
        businessId: business.id,
        draftId: "webhook-draft",
        lines: [{ name: "Tacos", qty: 2, unitCents: 450, taxable: true }],
        tipPct: 0,
        language: "en",
        transcript: "two tacos",
      },
    );
    saleId = charge.saleId;
    off = subscribe((e) => emitted.push(e));
  }, 60_000);

  afterAll(async () => {
    off();
    await close();
  });

  const db = () => holder.db as Parameters<typeof getSale>[0];

  it("marks the sale paid once, stores the event, and ignores a redelivery", async () => {
    verify.ok = true;
    const first = await POST(hook(event("WH-TEST-1", invoiceId)));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ result: "processed" });

    const sale = await getSale(db(), saleId);
    expect(sale?.status).toBe("paid");
    expect(sale?.paidAt?.toISOString()).toBe(PAID_AT);
    const [row] = await db().select().from(webhookEvents).where(eq(webhookEvents.id, "WH-TEST-1"));
    expect(row?.processedAt).toBeInstanceOf(Date);
    expect(row?.type).toBe("INVOICING.INVOICE.PAID");
    expect(emitted).toEqual([{ type: "sale.paid", saleId }]);

    const again = await POST(hook(event("WH-TEST-1", invoiceId)));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ result: "duplicate" });
    expect(emitted).toHaveLength(1);
    expect((await getSale(db(), saleId))?.paidAt?.toISOString()).toBe(PAID_AT);
  });

  it("a new event for an already paid invoice does not re-mark but still emits", async () => {
    const later = event("WH-TEST-2", invoiceId);
    later.resource.invoice.payments.transactions[0]!.date = "2026-11-08T09:00:00Z";
    const res = await POST(hook(later));
    expect(await res.json()).toEqual({ result: "processed" });
    expect(emitted).toHaveLength(2);
    const [s] = await db().select().from(sales).where(eq(sales.id, saleId));
    expect(s?.paidAt?.toISOString()).toBe(PAID_AT);
  });

  it("stores an event for an unknown invoice as unmatched and answers 200", async () => {
    const res = await POST(hook(event("WH-UNKNOWN", "INV2-NOPE")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "unmatched" });
    const [row] = await db().select().from(webhookEvents).where(eq(webhookEvents.id, "WH-UNKNOWN"));
    expect(row).toBeDefined();
    expect(row?.processedAt).toBeNull();
  });

  it("ignores unknown event types but marks them processed", async () => {
    const res = await POST(
      hook({ id: "WH-OTHER", event_type: "CUSTOMER.DISPUTE.CREATED", resource: {} }),
    );
    expect(await res.json()).toEqual({ result: "ignored" });
    const [row] = await db().select().from(webhookEvents).where(eq(webhookEvents.id, "WH-OTHER"));
    expect(row?.processedAt).toBeInstanceOf(Date);
  });

  describe("payout item events", () => {
    const paypalBatchId = "PB-5N8C2K1WQ4XZ";
    let senderBatchId: string;
    let payoutId: string;

    function payoutEvent(id: string, type: string, batch: string, nested = false) {
      const resource = nested
        ? { payout_item: { ...payoutFixture.resource.payout_item, payout_batch_id: batch } }
        : { ...payoutFixture.resource, payout_batch_id: batch };
      return { ...payoutFixture, id, event_type: type, resource };
    }

    async function payoutRow() {
      const [row] = await db().select().from(payouts).where(eq(payouts.id, payoutId));
      return row!;
    }

    beforeAll(async () => {
      const [row] = await db().select().from(payouts);
      senderBatchId = row!.batchId;
      payoutId = row!.id;
      await db().update(payouts).set({ paypalBatchId }).where(eq(payouts.id, payoutId));
    });

    it("SUCCEEDED marks the payout SUCCESS, stores the item id and emits", async () => {
      await db()
        .update(payouts)
        .set({ status: "PENDING", itemId: null })
        .where(eq(payouts.id, payoutId));
      emitted.length = 0;
      const res = await POST(
        hook(payoutEvent("WH-PAYOUT-1", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", paypalBatchId)),
      );
      expect(await res.json()).toEqual({ result: "processed" });
      const row = await payoutRow();
      expect(row.status).toBe("SUCCESS");
      expect(row.itemId).toBe("ITEM4KQ9W2M7XZ");
      expect(emitted).toEqual([{ type: "payout.updated", payoutId }]);
    });

    it.each([
      ["PAYMENT.PAYOUTS-ITEM.FAILED", "FAILED"],
      ["PAYMENT.PAYOUTS-ITEM.BLOCKED", "FAILED"],
      ["PAYMENT.PAYOUTS-ITEM.DENIED", "FAILED"],
      ["PAYMENT.PAYOUTS-ITEM.REFUNDED", "FAILED"],
      ["PAYMENT.PAYOUTS-ITEM.RETURNED", "FAILED"],
      ["PAYMENT.PAYOUTS-ITEM.UNCLAIMED", "UNCLAIMED"],
    ])("%s sets status %s (nested payout_item payload)", async (type, status) => {
      await db().update(payouts).set({ status: "PENDING" }).where(eq(payouts.id, payoutId));
      const res = await POST(hook(payoutEvent(`WH-${type}`, type, paypalBatchId, true)));
      expect(await res.json()).toEqual({ result: "processed" });
      expect((await payoutRow()).status).toBe(status);
    });

    it("falls back to our sender batch id when PayPal's id is unknown", async () => {
      await db().update(payouts).set({ status: "PENDING" }).where(eq(payouts.id, payoutId));
      const res = await POST(
        hook(payoutEvent("WH-PAYOUT-FALLBACK", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", senderBatchId)),
      );
      expect(await res.json()).toEqual({ result: "processed" });
      expect((await payoutRow()).status).toBe("SUCCESS");
    });

    it("ignores UNCLAIMED once the payout is SUCCESS or FAILED", async () => {
      for (const final of ["SUCCESS", "FAILED"] as const) {
        await db().update(payouts).set({ status: final }).where(eq(payouts.id, payoutId));
        const res = await POST(
          hook(payoutEvent(`WH-LATE-${final}`, "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", paypalBatchId)),
        );
        expect(await res.json()).toEqual({ result: "ignored" });
        expect((await payoutRow()).status).toBe(final);
      }
    });

    it("a replayed event id is a duplicate and emits nothing", async () => {
      await db().update(payouts).set({ status: "PENDING" }).where(eq(payouts.id, payoutId));
      emitted.length = 0;
      const ev = payoutEvent("WH-PAYOUT-REPLAY", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", paypalBatchId);
      expect(await (await POST(hook(ev))).json()).toEqual({ result: "processed" });
      expect(emitted).toHaveLength(1);
      expect(await (await POST(hook(ev))).json()).toEqual({ result: "duplicate" });
      expect(emitted).toHaveLength(1);
    });

    it("an unknown batch is unmatched", async () => {
      const res = await POST(
        hook(payoutEvent("WH-PAYOUT-NOPE", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "nope")),
      );
      expect(await res.json()).toEqual({ result: "unmatched" });
    });

    it("batch events stay ignored", async () => {
      const res = await POST(
        hook({ id: "WH-BATCH", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: {} }),
      );
      expect(await res.json()).toEqual({ result: "ignored" });
    });
  });

  it("rejects a bad signature with 400 and stores nothing", async () => {
    verify.ok = false;
    const res = await POST(hook(event("WH-BAD", invoiceId)));
    verify.ok = true;
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad signature" });
    const rows = await db().select().from(webhookEvents).where(eq(webhookEvents.id, "WH-BAD"));
    expect(rows).toHaveLength(0);
  });

  it("returns 400 for a malformed body and a bare 500 on failure", async () => {
    expect((await POST(hook("{not json"))).status).toBe(400);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const saved = holder.db;
    holder.db = {
      insert: () => {
        throw new Error("db down secret");
      },
    };
    const res = await POST(hook(event("WH-500", invoiceId)));
    holder.db = saved;
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "webhook" });
    expect(spy).toHaveBeenCalledWith("webhook failed", {
      id: "WH-500",
      type: "INVOICING.INVOICE.PAID",
    });
    spy.mockRestore();
  });
});
