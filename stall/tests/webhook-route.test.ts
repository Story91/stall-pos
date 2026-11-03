import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import { sales, webhookEvents } from "@/db/schema";
import { chargeSale, getBusiness, getSale } from "@/lib/sales";
import { subscribe, type StallEvent } from "@/lib/events";
import fixture from "./fixtures/webhook-invoice-paid.json";

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
