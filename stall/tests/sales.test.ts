import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import type { Db } from "@/db";
import { catalogItems, sales } from "@/db/schema";
import type { Line } from "@/lib/money";
import { PartialInvoiceError } from "@/lib/paypal/invoices";
import { chargeSale, getBusiness, getSale, markPaid } from "@/lib/sales";

type TipPct = 0 | 15 | 18 | 20 | null;

describe("sales service", () => {
  let db: Db;
  let close: () => Promise<void>;
  let businessId: string;

  const lines: Line[] = [
    { name: "Tacos", qty: 2, unitCents: 450, taxable: true },
    { name: "Horchata", qty: 1, unitCents: 300, taxable: false },
  ];

  function fakes() {
    const createAndSendInvoice = vi.fn(
      async (): Promise<{ invoiceId: string; payLink: string; amountCents?: number }> => ({
        invoiceId: "INV2-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        payLink: "https://paypal.test/pay/1",
      }),
    );
    const generateQr = vi.fn<(invoiceId: string, requestId: string) => Promise<string>>(
      async () => "BASE64PNG",
    );
    return {
      createAndSendInvoice,
      generateQr,
      deps: {
        invoices: { createAndSendInvoice, generateQr },
        now: new Date("2026-11-03T15:00:00Z"),
      },
    };
  }

  function input(
    draftId: string,
    overrides: { lines?: Line[]; tipPct?: TipPct } = {},
  ) {
    return {
      businessId,
      draftId,
      lines: overrides.lines ?? lines,
      tipPct: (overrides.tipPct ?? null) as TipPct,
      language: "es" as const,
      transcript: "dos tacos a cuatro cincuenta y una horchata a tres",
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

  it("getBusiness returns the single seeded business", async () => {
    const business = await getBusiness(db);
    expect(business.id).toBe(businessId);
    expect(Number(business.taxRate)).toBeCloseTo(0.0825);
  });

  it("charges a sale: stores an awaiting row with invoice, QR and pay link", async () => {
    const { deps, createAndSendInvoice, generateQr } = fakes();
    const result = await chargeSale(db, deps, input("draft-a", { tipPct: 18 }));

    // subtotal 1200, tax 8.25% of 900 = 74 (74.25), tip 18% of 1200 = 216
    expect(result.totalCents).toBe(1490);
    expect(result.qrPng).toBe("BASE64PNG");
    expect(result.payLink).toBe("https://paypal.test/pay/1");

    const [row] = await db.select().from(sales).where(eq(sales.id, result.saleId));
    expect(row).toMatchObject({
      draftId: "draft-a",
      status: "awaiting",
      subtotalCents: 1200,
      taxCents: 74,
      tipCents: 216,
      totalCents: 1490,
      language: "es",
      qrPng: "BASE64PNG",
      payLink: "https://paypal.test/pay/1",
      lines,
    });
    expect(row!.invoiceId).toMatch(/^INV2-/);
    expect(row!.invoiceNumber).toMatch(/^STALL-20261103-[0-9A-F]{6}$/);

    // The payload sent to PayPal carries the same invoice number and a tip item.
    const [payload, requestId] = createAndSendInvoice.mock.calls[0] as unknown as [
      { detail: { invoice_number: string; note: string }; items: { name: string }[] },
      string,
    ];
    expect(requestId).toBe("draft-a");
    expect(payload.detail.invoice_number).toBe(row!.invoiceNumber);
    expect(payload.detail.note).toBe("La Esquina");
    expect(payload.items.map((i) => i.name)).toEqual(["Tacos", "Horchata", "Tip"]);
    expect(generateQr).toHaveBeenCalledWith(row!.invoiceId, "draft-a-qr");
  });

  it("stores PayPal's invoice total when it differs, moving the difference into tax", async () => {
    const { deps, createAndSendInvoice } = fakes();
    createAndSendInvoice.mockImplementationOnce(async () => ({
      invoiceId: "INV2-ROUND",
      payLink: "https://paypal.test/pay/1",
      amountCents: 1491, // PayPal rounded the tax per line: one cent more than our 1490
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await chargeSale(db, deps, input("draft-round", { tipPct: 18 }));
    expect(warn).toHaveBeenCalledWith("invoice total adjusted", { draftId: "draft-round", ours: 1490, paypal: 1491 });
    warn.mockRestore();
    expect(result.totalCents).toBe(1491);
    const [row] = await db.select().from(sales).where(eq(sales.id, result.saleId));
    expect(row).toMatchObject({ subtotalCents: 1200, taxCents: 75, tipCents: 216, totalCents: 1491 });
    expect(row!.subtotalCents + row!.taxCents + row!.tipCents).toBe(row!.totalCents);
  });

  it("keeps our totals and logs nothing when PayPal's total agrees", async () => {
    const { deps, createAndSendInvoice } = fakes();
    createAndSendInvoice.mockImplementationOnce(async () => ({
      invoiceId: "INV2-SAME",
      payLink: "https://paypal.test/pay/1",
      amountCents: 1490,
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await chargeSale(db, deps, input("draft-same", { tipPct: 18 }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    const [row] = await db.select().from(sales).where(eq(sales.id, result.saleId));
    expect(row).toMatchObject({ taxCents: 74, totalCents: 1490 });
  });

  it("is idempotent on draftId: two charges, one row, one invoice", async () => {
    const { deps, createAndSendInvoice, generateQr } = fakes();
    const first = await chargeSale(db, deps, input("draft-dup"));
    const second = await chargeSale(db, deps, input("draft-dup"));

    expect(second).toEqual(first);
    expect(createAndSendInvoice).toHaveBeenCalledTimes(1);
    expect(generateQr).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(sales).where(eq(sales.draftId, "draft-dup"));
    expect(rows).toHaveLength(1);
  });

  it("resolves concurrent duplicate draftIds to the same sale", async () => {
    const { deps, createAndSendInvoice } = fakes();
    const [a, b] = await Promise.all([
      chargeSale(db, deps, input("draft-race")),
      chargeSale(db, deps, input("draft-race")),
    ]);
    expect(b.saleId).toBe(a.saleId);
    expect(createAndSendInvoice).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(sales).where(eq(sales.draftId, "draft-race"));
    expect(rows).toHaveLength(1);
  });

  it("records sightings of the sold lines in the catalog", async () => {
    const { deps } = fakes();
    await chargeSale(
      db,
      deps,
      input("draft-sight", {
        lines: [{ name: "Elote nuevo", qty: 1, unitCents: 500, taxable: true }],
      }),
    );
    const rows = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.name, "Elote nuevo"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sightings: 1, lastSeenPriceCents: 500 });
  });

  it("leaves no half-written sale when PayPal fails, and a retry succeeds", async () => {
    const failing = fakes();
    failing.createAndSendInvoice.mockRejectedValueOnce(new Error("paypal down"));
    await expect(chargeSale(db, failing.deps, input("draft-fail"))).rejects.toThrow(
      "paypal down",
    );
    expect(await db.select().from(sales).where(eq(sales.draftId, "draft-fail"))).toHaveLength(0);
    expect(failing.generateQr).not.toHaveBeenCalled();

    const ok = fakes();
    const result = await chargeSale(db, ok.deps, input("draft-fail"));
    expect(ok.createAndSendInvoice).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(sales).where(eq(sales.id, result.saleId));
    expect(row!.status).toBe("awaiting");
  });

  it("derives the invoice number deterministically from the draftId", async () => {
    const numbers: string[] = [];
    for (const draft of ["draft-det", "draft-det", "draft-other"]) {
      const { deps, createAndSendInvoice } = fakes();
      await db.delete(sales);
      await chargeSale(db, deps, input(draft));
      const [payload] = createAndSendInvoice.mock.calls[0] as unknown as [
        { detail: { invoice_number: string } },
      ];
      numbers.push(payload.detail.invoice_number);
    }
    expect(numbers[0]).toBe(numbers[1]);
    expect(numbers[0]).not.toBe(numbers[2]);
  });

  it("logs an orphaned invoice and leaves no row when send fails after create", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const f = fakes();
      f.createAndSendInvoice.mockRejectedValueOnce(
        new PartialInvoiceError("INV2-ORPH", "send", new Error("send down")),
      );
      await expect(chargeSale(db, f.deps, input("draft-orph"))).rejects.toBeInstanceOf(
        PartialInvoiceError,
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("invoice orphaned", {
        draftId: "draft-orph",
        invoiceId: "INV2-ORPH",
        step: "send",
      });
      expect(await db.select().from(sales).where(eq(sales.draftId, "draft-orph"))).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("logs the orphan when the QR step fails, but not when create itself fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const qrFail = fakes();
      qrFail.generateQr.mockRejectedValueOnce(new Error("qr down"));
      await expect(chargeSale(db, qrFail.deps, input("draft-qr"))).rejects.toThrow("qr down");
      expect(spy).toHaveBeenCalledWith("invoice orphaned", {
        draftId: "draft-qr",
        invoiceId: expect.stringMatching(/^INV2-/),
        step: "qr",
      });

      spy.mockClear();
      const createFail = fakes();
      createFail.createAndSendInvoice.mockRejectedValueOnce(new Error("create down"));
      await expect(chargeSale(db, createFail.deps, input("draft-cf"))).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  describe("markPaid", () => {
    it("marks an awaiting sale paid, then reports already_paid", async () => {
      const { deps } = fakes();
      const { saleId } = await chargeSale(db, deps, input("draft-pay"));
      const paidAt = new Date("2026-11-03T16:00:00Z");

      expect(await markPaid(db, saleId, "paypal", paidAt)).toBe("marked");
      const sale = await getSale(db, saleId);
      expect(sale?.status).toBe("paid");
      expect(sale?.paidAt?.toISOString()).toBe(paidAt.toISOString());

      expect(await markPaid(db, saleId, "cash", new Date())).toBe("already_paid");
      expect((await getSale(db, saleId))?.status).toBe("paid");
    });

    it("marks cash payments paid_cash and treats paid_cash as already paid", async () => {
      const { deps } = fakes();
      const { saleId } = await chargeSale(db, deps, input("draft-cash"));
      expect(await markPaid(db, saleId, "cash", new Date())).toBe("marked");
      expect((await getSale(db, saleId))?.status).toBe("paid_cash");
      expect(await markPaid(db, saleId, "paypal", new Date())).toBe("already_paid");
    });

    it("only one of two concurrent markPaid calls wins", async () => {
      const { deps } = fakes();
      const { saleId } = await chargeSale(db, deps, input("draft-mp-race"));
      const results = await Promise.all([
        markPaid(db, saleId, "paypal", new Date()),
        markPaid(db, saleId, "cash", new Date()),
      ]);
      expect(results.filter((r) => r === "marked")).toHaveLength(1);
      expect(results.filter((r) => r === "already_paid")).toHaveLength(1);
    });
  });

  it("getSale returns undefined for an unknown id", async () => {
    expect(await getSale(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });
});
