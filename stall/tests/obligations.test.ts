import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { bills, payouts, sales, shifts } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";
import { getDay, logBill, logShift, removeShift } from "@/lib/obligations";
import { getBusiness } from "@/lib/sales";

let db: Db;
let close: () => Promise<void>;
let businessId: string;
let mariaId: string;
let rosaId: string;

beforeAll(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  const seeded = await seed(db);
  businessId = (await getBusiness(db)).id;
  mariaId = seeded.payees.maria;
  rosaId = seeded.payees.rosa;
}, 60_000);

afterAll(async () => {
  await close();
});

describe("logShift", () => {
  it("is an upsert: the same payee and day gives one row", async () => {
    const a = await logShift(db, businessId, mariaId, "2031-01-05");
    const b = await logShift(db, businessId, mariaId, "2031-01-05");
    expect(b.id).toBe(a.id);
    const rows = await db.select().from(shifts).where(eq(shifts.date, "2031-01-05"));
    expect(rows).toHaveLength(1);
  });
});

describe("logBill", () => {
  it("stores an open bill", async () => {
    const bill = await logBill(db, businessId, {
      payeeId: rosaId,
      amountCents: 24000,
      note: "tortillas",
      date: "2031-01-05",
    });
    expect(bill).toMatchObject({ status: "open", amountCents: 24000, note: "tortillas", photoUrl: null });
    const [row] = await db.select().from(bills).where(eq(bills.id, bill.id));
    expect(row?.payeeId).toBe(rosaId);
  });

  it("rejects non-positive or fractional amounts and long notes", async () => {
    const base = { payeeId: rosaId, note: "x", date: "2031-01-05" };
    await expect(logBill(db, businessId, { ...base, amountCents: 0 })).rejects.toThrow();
    await expect(logBill(db, businessId, { ...base, amountCents: 10.5 })).rejects.toThrow();
    await expect(
      logBill(db, businessId, { ...base, amountCents: 100, note: "n".repeat(141) }),
    ).rejects.toThrow();
  });
});

describe("removeShift", () => {
  it("removes a wrongly logged shift", async () => {
    await logShift(db, businessId, mariaId, "2031-02-01");
    expect(await removeShift(db, businessId, mariaId, "2031-02-01")).toBe("removed");
    expect(await db.select().from(shifts).where(eq(shifts.date, "2031-02-01"))).toHaveLength(0);
    expect(await removeShift(db, businessId, mariaId, "2031-02-01")).toBe("not_found");
  });

  it("refuses when a payout exists for the shift", async () => {
    const shift = await logShift(db, businessId, mariaId, "2031-02-02");
    await db.insert(payouts).values({
      businessId,
      shiftId: shift.id,
      batchId: `stall-${businessId}-shift-${shift.id}`,
      amountCents: 12000,
      rationale: "test",
    });
    expect(await removeShift(db, businessId, mariaId, "2031-02-02")).toBe("has_payout");
    expect(await db.select().from(shifts).where(eq(shifts.id, shift.id))).toHaveLength(1);
  });
});

describe("getDay", () => {
  it("returns the day's shifts and bills with payees, and zero totals when empty", async () => {
    const day = await getDay(db, businessId, "2031-01-05");
    expect(day.shifts.map((s) => s.payee.name)).toEqual(["Maria"]);
    expect(day.bills.map((b) => b.payee.name)).toContain("Tortillería Rosa");
    expect(day.sales).toEqual([]);
    expect(day.totals).toEqual({
      count: 0,
      subtotalCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0,
      cashCents: 0,
      paypalCents: 0,
    });
  });

  it("totals paid sales by method and ignores unpaid ones", async () => {
    const at = new Date("2031-03-10T18:00:00Z");
    const row = (draftId: string, status: "paid" | "paid_cash" | "awaiting", total: number) => ({
      businessId,
      draftId,
      status,
      lines: [],
      subtotalCents: total - 15,
      taxCents: 10,
      tipCents: 5,
      totalCents: total,
      createdAt: at,
    });
    await db.insert(sales).values([
      row("d-paypal", "paid", 1000),
      row("d-cash", "paid_cash", 500),
      row("d-open", "awaiting", 700),
    ]);
    const day = await getDay(db, businessId, "2031-03-10");
    expect(day.sales).toHaveLength(3);
    expect(day.totals).toEqual({
      count: 2,
      subtotalCents: 1500 - 30,
      taxCents: 20,
      tipCents: 10,
      totalCents: 1500,
      cashCents: 500,
      paypalCents: 1000,
    });
  });
});
