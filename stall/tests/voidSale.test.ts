import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sales } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";
import { lastSale, voidSale, type VoidDeps } from "@/lib/salesApi";

let db: Db;
let close: () => Promise<void>;
let businessId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 60_000);
afterAll(async () => close());
beforeEach(async () => {
  ({ businessId } = await seed(db));
}, 30_000);

const deps = (): VoidDeps & { cancelInvoice: ReturnType<typeof vi.fn>; recordCashRefund: ReturnType<typeof vi.fn> } => ({
  cancelInvoice: vi.fn(async () => {}),
  recordCashRefund: vi.fn(async () => {}),
});

async function addSale(status: "awaiting" | "paid" | "paid_cash" | "cancelled" | "draft", createdAt = new Date()) {
  const [row] = await db
    .insert(sales)
    .values({
      businessId,
      draftId: `test-${status}-${createdAt.getTime()}-${Math.random()}`,
      invoiceId: `INV2-TEST-${Math.random().toString(16).slice(2)}`,
      invoiceNumber: "STALL-TEST-1",
      status,
      lines: [{ name: "Taco al pastor", qty: 2, unitCents: 450, taxable: true }],
      subtotalCents: 900,
      taxCents: 74,
      tipCents: 0,
      totalCents: 974,
      createdAt,
      paidAt: status === "paid" || status === "paid_cash" ? createdAt : null,
    })
    .returning();
  return row!;
}

const statusOf = async (id: string) => (await db.select().from(sales).where(eq(sales.id, id)))[0]!.status;

describe("voidSale", () => {
  it("cancels the PayPal invoice of an unpaid sale, idempotently keyed, then marks it cancelled", async () => {
    const sale = await addSale("awaiting");
    const d = deps();
    expect(await voidSale(db, d, sale.id)).toEqual({ kind: "cancelled", was: "awaiting" });
    expect(d.cancelInvoice).toHaveBeenCalledWith(sale.invoiceId, `${sale.draftId}-cancel`);
    expect(d.recordCashRefund).not.toHaveBeenCalled();
    expect(await statusOf(sale.id)).toBe("cancelled");
    expect(await voidSale(db, d, sale.id)).toEqual({ kind: "already_cancelled" });
  });

  it("records a cash refund on the invoice of a cash sale", async () => {
    const sale = await addSale("paid_cash");
    const d = deps();
    expect(await voidSale(db, d, sale.id)).toEqual({ kind: "cancelled", was: "paid_cash" });
    expect(d.recordCashRefund).toHaveBeenCalledWith(sale.invoiceId, 974, `${sale.draftId}-refund`);
  });

  it("refuses a sale paid through PayPal and touches nothing", async () => {
    const sale = await addSale("paid");
    const d = deps();
    expect(await voidSale(db, d, sale.id)).toEqual({ kind: "paid_paypal" });
    expect(d.cancelInvoice).not.toHaveBeenCalled();
    expect(await statusOf(sale.id)).toBe("paid");
  });

  it("does not mark it cancelled when PayPal refuses, and never marks a sale paid in the meantime", async () => {
    const sale = await addSale("awaiting");
    const failing = { cancelInvoice: vi.fn(async () => { throw new Error("422"); }), recordCashRefund: vi.fn() };
    await expect(voidSale(db, failing, sale.id)).rejects.toThrow("422");
    expect(await statusOf(sale.id)).toBe("awaiting");

    const racing = {
      cancelInvoice: vi.fn(async () => {
        await db.update(sales).set({ status: "paid", paidAt: new Date() }).where(eq(sales.id, sale.id));
      }),
      recordCashRefund: vi.fn(),
    };
    expect(await voidSale(db, racing, sale.id)).toEqual({ kind: "changed" });
    expect(await statusOf(sale.id)).toBe("paid");
  });

  it("says not_found for an unknown sale", async () => {
    expect(await voidSale(db, deps(), "00000000-0000-4000-8000-000000000000")).toEqual({ kind: "not_found" });
  });
});

describe("lastSale", () => {
  it("is today's newest charged sale, skipping drafts and cancelled ones", async () => {
    expect(await lastSale(db)).toBeNull(); // the seed has no sales today
    const older = await addSale("paid_cash", new Date(Date.now() - 60_000));
    await addSale("draft");
    await addSale("cancelled");
    expect((await lastSale(db))?.saleId).toBe(older.id);
    const newest = await addSale("awaiting");
    expect(await lastSale(db)).toMatchObject({ saleId: newest.id, status: "awaiting", items: "2 Taco al pastor", totalCents: 974 });
  });
});
