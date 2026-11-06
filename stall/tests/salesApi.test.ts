import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import type { Db } from "@/db";
import { catalogItems, sales } from "@/db/schema";
import { listCatalog } from "@/lib/catalog";
import { PayPalError } from "@/lib/paypal/client";
import {
  ParseFailedError,
  createSale,
  parseTranscript,
  payCash,
  cancelSale,
  resetReconcileThrottle,
  saleStatus,
  toResponse,
} from "@/lib/salesApi";

describe("sales API services", () => {
  let db: Db;
  let close: () => Promise<void>;
  let businessId: string;

  const body = (draftId: string, extra: Record<string, unknown> = {}) => ({
    draftId,
    lines: [
      { name: "Tacos", qty: 2, unitCents: 450, taxable: true },
      { name: "Horchata", qty: 1, unitCents: 300, taxable: false },
    ],
    tipPct: null,
    language: "en",
    transcript: "two tacos and a horchata",
    ...extra,
  });

  function deps() {
    const createAndSendInvoice = vi.fn(async () => ({
      invoiceId: "INV2-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      payLink: "https://paypal.test/pay",
    }));
    return {
      createAndSendInvoice,
      value: {
        invoices: { createAndSendInvoice, generateQr: vi.fn(async () => "QR") },
      },
    };
  }

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ({ businessId } = await seed(db));
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.delete(sales);
  });

  describe("parseTranscript", () => {
    it("loads the seeded catalog and passes it to the parser", async () => {
      const parse = vi.fn(async () => ({
        items: [],
        spokenConfirmation: "ok",
        language: "en" as const,
      }));
      await parseTranscript(db, { transcript: "two tacos", language: "en" }, { parse });
      const arg = (parse.mock.calls[0] as unknown as [
        { transcript: string; language: string; catalog: { businessId: string }[] },
      ])[0];
      expect(arg.transcript).toBe("two tacos");
      expect(arg.language).toBe("en");
      expect(arg.catalog.length).toBeGreaterThan(0);
      expect(arg.catalog.every((c) => c.businessId === businessId)).toBe(true);
    });

    it("wraps parser failures in ParseFailedError", async () => {
      const parse = vi.fn(async () => {
        throw new Error("model exploded");
      });
      await expect(
        parseTranscript(db, { transcript: "x", language: "pl" }, { parse }),
      ).rejects.toBeInstanceOf(ParseFailedError);
    });

    it("rejects an unsupported language or empty transcript", async () => {
      await expect(
        parseTranscript(db, { transcript: "x", language: "fr" }),
      ).rejects.toThrow();
      await expect(
        parseTranscript(db, { transcript: "  ", language: "en" }),
      ).rejects.toThrow();
    });
  });

  describe("createSale", () => {
    it("charges using the seeded business tax rate", async () => {
      const { value } = deps();
      const result = await createSale(db, value, body("api-1"));
      // 1200 subtotal + 8.25% of 900 taxable (74) = 1274
      expect(result.totalCents).toBe(1274);
      const [row] = await db.select().from(sales).where(eq(sales.id, result.saleId));
      expect(row!.businessId).toBe(businessId);
      expect(row!.taxCents).toBe(74);
    });

    it("stores clean lines but uses catalogItemId to learn", async () => {
      const [taco] = await listCatalog(db, businessId);
      const before = taco!.sightings;
      const { value } = deps();
      const result = await createSale(
        db,
        value,
        body("api-learn", {
          lines: [
            {
              name: "some other label",
              qty: 1,
              unitCents: 999,
              taxable: true,
              catalogItemId: taco!.id,
            },
          ],
        }),
      );
      const [row] = await db.select().from(sales).where(eq(sales.id, result.saleId));
      expect(row!.lines).toEqual([
        { name: "some other label", qty: 1, unitCents: 999, taxable: true },
      ]);
      const [after] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.id, taco!.id));
      expect(after!.sightings).toBe(before + 1);
      expect(after!.lastSeenPriceCents).toBe(999);
    });

    it.each([
      ["no lines", { lines: [] }],
      ["fractional qty", { lines: [{ name: "a", qty: 1.5, unitCents: 100, taxable: true }] }],
      ["zero price", { lines: [{ name: "a", qty: 1, unitCents: 0, taxable: true }] }],
      ["bad tip", { tipPct: 10 }],
      ["missing draftId", { draftId: "" }],
    ])("rejects invalid input: %s", async (_label, extra) => {
      const { value, createAndSendInvoice } = deps();
      await expect(createSale(db, value, body("api-bad", extra))).rejects.toThrow();
      expect(createAndSendInvoice).not.toHaveBeenCalled();
    });
  });

  describe("saleStatus", () => {
    it("returns status and total, undefined when unknown or malformed", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-status"));
      expect(await saleStatus(db, saleId)).toEqual({ status: "awaiting", totalCents: 1274 });
      expect(await saleStatus(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
      expect(await saleStatus(db, "not-a-uuid")).toBeUndefined();
    });
  });

  describe("saleStatus reconciliation with PayPal", () => {
    beforeEach(() => resetReconcileThrottle());

    it("marks an awaiting sale paid when the invoice is PAID", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-rec-paid"));
      const lookup = vi.fn(async () => "PAID");
      expect(await saleStatus(db, saleId, { getInvoiceStatus: lookup })).toEqual({
        status: "paid",
        totalCents: 1274,
      });
      const [row] = await db.select().from(sales).where(eq(sales.id, saleId));
      expect(row!.status).toBe("paid");
      expect(row!.paidAt).toBeInstanceOf(Date);
    });

    it("also accepts MARKED_AS_PAID", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-rec-marked"));
      const out = await saleStatus(db, saleId, { getInvoiceStatus: async () => "MARKED_AS_PAID" });
      expect(out?.status).toBe("paid");
    });

    it("leaves the sale awaiting when the invoice is UNPAID", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-rec-unpaid"));
      const out = await saleStatus(db, saleId, { getInvoiceStatus: async () => "UNPAID" });
      expect(out?.status).toBe("awaiting");
    });

    it("asks PayPal at most once per 3 seconds per sale", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-rec-throttle"));
      const lookup = vi.fn(async () => "UNPAID");
      let now = 1_000_000;
      const d = { getInvoiceStatus: lookup, nowMs: () => now };
      await saleStatus(db, saleId, d);
      now += 2_999;
      await saleStatus(db, saleId, d);
      expect(lookup).toHaveBeenCalledTimes(1);
      now += 1;
      await saleStatus(db, saleId, d);
      expect(lookup).toHaveBeenCalledTimes(2);
    });

    it("swallows a PayPal failure and returns the stored status", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-rec-throws"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const out = await saleStatus(db, saleId, {
        getInvoiceStatus: async () => {
          throw new PayPalError("boom", 500, "{}");
        },
      });
      expect(out?.status).toBe("awaiting");
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]![0])).toContain(saleId);
      log.mockRestore();
    });
  });

  describe("cancelSale", () => {
    const paypal = (status = "SENT") => ({
      getInvoiceStatus: vi.fn(async () => status),
      cancelInvoice: vi.fn(async () => {}),
    });

    it("cancels the PayPal invoice and marks the sale cancelled", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cancel"));
      const d = paypal();
      expect(await cancelSale(db, d, saleId)).toEqual({ kind: "cancelled" });
      const [row] = await db.select().from(sales).where(eq(sales.id, saleId));
      expect(row!.status).toBe("cancelled");
      expect(d.cancelInvoice).toHaveBeenCalledWith(row!.invoiceId, "api-cancel-cancel");
    });

    it("never cancels a sale the customer already paid; it records the payment instead", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cancel2"));
      const d = paypal("PAID");
      expect(await cancelSale(db, d, saleId)).toEqual({ kind: "already_paid" });
      expect(d.cancelInvoice).not.toHaveBeenCalled();
      const [row] = await db.select().from(sales).where(eq(sales.id, saleId));
      expect(row!.status).toBe("paid");
    });

    it("re-checks PayPal when the cancel is refused, and keeps a paid sale paid", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cancel3"));
      const d = paypal();
      d.getInvoiceStatus.mockResolvedValueOnce("SENT").mockResolvedValueOnce("PAID");
      d.cancelInvoice.mockRejectedValueOnce(new PayPalError("nope", 422, "{}", "dbg"));
      expect(await cancelSale(db, d, saleId)).toEqual({ kind: "already_paid" });
      const [row] = await db.select().from(sales).where(eq(sales.id, saleId));
      expect(row!.status).toBe("paid");
    });

    it("a paid, cancelled or unknown sale never reaches PayPal", async () => {
      const d = paypal();
      expect(await cancelSale(db, d, "00000000-0000-0000-0000-000000000000")).toEqual({ kind: "not_found" });
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cancel4"));
      await db.update(sales).set({ status: "paid_cash" }).where(eq(sales.id, saleId));
      expect(await cancelSale(db, d, saleId)).toEqual({ kind: "already_paid" });
      await db.update(sales).set({ status: "cancelled" }).where(eq(sales.id, saleId));
      expect(await cancelSale(db, d, saleId)).toEqual({ kind: "cancelled" });
      expect(d.cancelInvoice).not.toHaveBeenCalled();
    });
  });

  describe("payCash", () => {
    it("records the cash payment on the invoice and marks the sale paid_cash", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cash"));
      const recordCashPayment = vi.fn(async () => {});

      const result = await payCash(db, { recordCashPayment }, saleId);
      expect(result).toEqual({ kind: "paid", status: "paid_cash" });
      const [row] = await db.select().from(sales).where(eq(sales.id, saleId));
      expect(row!.status).toBe("paid_cash");
      expect(row!.paidAt).toBeInstanceOf(Date);
      expect(recordCashPayment).toHaveBeenCalledWith(row!.invoiceId, 1274, "api-cash-cash");
    });

    it("a second cash payment is already_paid and never reaches PayPal", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cash2"));
      const recordCashPayment = vi.fn(async () => {});
      await payCash(db, { recordCashPayment }, saleId);
      recordCashPayment.mockClear();

      expect(await payCash(db, { recordCashPayment }, saleId)).toEqual({
        kind: "already_paid",
      });
      expect(recordCashPayment).not.toHaveBeenCalled();
    });

    it("cash after a PayPal payment is already_paid", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cash3"));
      await db.update(sales).set({ status: "paid" }).where(eq(sales.id, saleId));
      const recordCashPayment = vi.fn(async () => {});
      expect(await payCash(db, { recordCashPayment }, saleId)).toEqual({
        kind: "already_paid",
      });
      expect(recordCashPayment).not.toHaveBeenCalled();
    });

    it("unknown sale is not_found; cancelled sale is not_payable", async () => {
      const recordCashPayment = vi.fn(async () => {});
      expect(
        await payCash(db, { recordCashPayment }, "00000000-0000-0000-0000-000000000000"),
      ).toEqual({ kind: "not_found" });

      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cash4"));
      await db.update(sales).set({ status: "cancelled" }).where(eq(sales.id, saleId));
      expect(await payCash(db, { recordCashPayment }, saleId)).toEqual({
        kind: "not_payable",
      });
      expect(recordCashPayment).not.toHaveBeenCalled();
    });

    it("leaves the sale awaiting when PayPal rejects the cash payment", async () => {
      const { value } = deps();
      const { saleId } = await createSale(db, value, body("api-cash5"));
      const recordCashPayment = vi.fn(async () => {
        throw new PayPalError("nope", 422, "{}", "dbg");
      });
      await expect(payCash(db, { recordCashPayment }, saleId)).rejects.toBeInstanceOf(
        PayPalError,
      );
      expect((await saleStatus(db, saleId))?.status).toBe("awaiting");
    });
  });

  describe("toResponse", () => {
    it("maps PayPalError to 502 with status and debugId", async () => {
      const res = toResponse(new PayPalError("x", 422, "{}", "dbg-1"));
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "paypal", status: 422, debugId: "dbg-1" });
    });

    it("maps parse failures to 422 and rethrows unknown errors", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(toResponse(new ParseFailedError(new Error("x"))).status).toBe(422);
      spy.mockRestore();
      expect(() => toResponse(new Error("boom"))).toThrow("boom");
    });
  });
});
