import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import {
  bills,
  businesses,
  catalogItems,
  payees,
  payouts,
  sales,
  shifts,
} from "@/db/schema";
import type { Db } from "@/db";
import { businessDate } from "@/lib/dates";

describe("seed", () => {
  let db: Db;
  let close: () => Promise<void>;
  let result: Awaited<ReturnType<typeof seed>>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    result = await seed(db);
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it("dates history sales in the past: createdAt is 2 minutes before paidAt, never today", async () => {
    const today = businessDate(new Date(), "America/Chicago");
    const rows = await db.select().from(sales);
    expect(rows.length).toBeGreaterThan(0);
    for (const sale of rows) {
      expect(sale.paidAt).toBeInstanceOf(Date);
      expect(sale.paidAt!.getTime() - sale.createdAt.getTime()).toBe(2 * 60_000);
      expect(businessDate(sale.createdAt, "America/Chicago")).not.toBe(today);
    }
  });

  it("creates the La Esquina business", async () => {
    const rows = await db.select().from(businesses);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.businessId,
      name: "La Esquina",
      currency: "USD",
      tz: "America/Chicago",
    });
    expect(Number(rows[0]!.taxRate)).toBe(0.0825);
    expect(rows[0]!.ownerPinHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creates Maria as an auto-pay helper at 12000 cents a day", async () => {
    const [maria] = await db
      .select()
      .from(payees)
      .where(eq(payees.id, result.payees.maria));
    expect(maria).toMatchObject({
      name: "Maria",
      role: "helper",
      autoPay: true,
      dailyRateCents: 12000,
      maxPerDayCents: 15000,
    });
  });

  it("creates Tortilleria Rosa as a manual supplier", async () => {
    const [rosa] = await db
      .select()
      .from(payees)
      .where(eq(payees.id, result.payees.rosa));
    expect(rosa).toMatchObject({
      role: "supplier",
      autoPay: false,
      maxPerDayCents: 20000,
    });
    expect(rosa!.name).toContain("Rosa");
  });

  it("has a paid tortilla bill with a SUCCESS payout and an open one today", async () => {
    const rosaBills = await db
      .select()
      .from(bills)
      .where(eq(bills.payeeId, result.payees.rosa));
    expect(rosaBills).toHaveLength(2);
    expect(rosaBills.every((b) => b.amountCents === 24000)).toBe(true);

    const paid = rosaBills.find((b) => b.status === "paid")!;
    const open = rosaBills.find((b) => b.status === "open")!;
    expect(open.date).toBe(businessDate(new Date(), "America/Chicago"));
    expect(open.note).toBe("tortillas");
    expect(paid.date < open.date).toBe(true);

    const [payout] = await db
      .select()
      .from(payouts)
      .where(eq(payouts.billId, paid.id));
    expect(payout).toMatchObject({
      status: "SUCCESS",
      amountCents: 24000,
      batchId: `stall-${result.businessId}-bill-${paid.id}`,
    });
  });

  it("has Maria's shift for today", async () => {
    const rows = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.payeeId, result.payees.maria),
          eq(shifts.date, businessDate(new Date(), "America/Chicago")),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("seeds 12 catalog items and at least 20 sales across the past week", async () => {
    const items = await db.select().from(catalogItems);
    expect(items).toHaveLength(12);
    const salesRows = await db.select().from(sales);
    expect(salesRows.length).toBeGreaterThanOrEqual(20);
    for (const s of salesRows) {
      expect(["paid", "paid_cash"]).toContain(s.status);
      expect(s.totalCents).toBe(s.subtotalCents + s.taxCents + s.tipCents);
    }
  });

  it("is idempotent", async () => {
    const before = {
      sales: (await db.select().from(sales)).length,
      shifts: (await db.select().from(shifts)).length,
      payouts: (await db.select().from(payouts)).length,
    };
    expect(before.shifts).toBe(1);
    expect(before.payouts).toBe(1);

    const again = await seed(db);

    expect(again.businessId).not.toBe(result.businessId);
    expect(await db.select().from(businesses)).toHaveLength(1);
    expect(await db.select().from(payees)).toHaveLength(2);
    expect(await db.select().from(bills)).toHaveLength(2);
    expect(await db.select().from(catalogItems)).toHaveLength(12);
    expect(await db.select().from(sales)).toHaveLength(before.sales);
    expect(await db.select().from(shifts)).toHaveLength(before.shifts);
    expect(await db.select().from(payouts)).toHaveLength(before.payouts);
  });
});
