import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import { businessDate, daysAgo } from "@/lib/dates";
import { computeTotals } from "@/lib/money";
import { loadCloseData } from "@/lib/close/load";
import { evaluateObligations } from "@/lib/close/rules";
import { obligationBatchId } from "@/lib/close/batchId";
import { matchCatalog } from "@/lib/parse/matchCatalog";

describe("seed", () => {
  let db: Db;
  let close: () => Promise<void>;
  let result: Awaited<ReturnType<typeof seed>>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    result = await seed(db);
  }, 60_000);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await close();
  });

  it("dates every sale in the past week up to now: createdAt is 2 minutes before paidAt", async () => {
    const now = Date.now();
    const today = businessDate(new Date(), "America/Chicago");
    const rows = await db.select().from(sales);
    expect(rows.length).toBeGreaterThan(0);
    for (const sale of rows) {
      expect(sale.paidAt).toBeInstanceOf(Date);
      expect(sale.paidAt!.getTime() - sale.createdAt.getTime()).toBe(2 * 60_000);
      expect(sale.paidAt!.getTime()).toBeLessThanOrEqual(now);
      const day = businessDate(sale.paidAt!, "America/Chicago");
      expect(businessDate(sale.createdAt, "America/Chicago")).toBe(day);
      expect(day >= daysAgo(today, 7) && day <= today, day).toBe(true);
    }
  });

  it("sells like a taco truck: 20-35 sales on each past day, at lunch and dinner in Chicago", async () => {
    const today = businessDate(new Date(), "America/Chicago");
    const rows = await db.select().from(sales);
    for (let ago = 1; ago <= 7; ago++) {
      const day = daysAgo(today, ago);
      const count = rows.filter((s) => businessDate(s.paidAt!, "America/Chicago") === day).length;
      expect(count, day).toBeGreaterThanOrEqual(20);
      expect(count, day).toBeLessThanOrEqual(35);
    }
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
    });
    for (const sale of rows) {
      const [h, m] = clock.format(sale.paidAt!).split(":").map(Number) as [number, number];
      const minute = h * 60 + m;
      const lunch = minute >= 11 * 60 && minute < 14 * 60 + 30;
      const dinner = minute >= 17 * 60 + 30 && minute < 21 * 60;
      expect(lunch || dinner, clock.format(sale.paidAt!)).toBe(true);
    }
    // Not the same clock times every day.
    const times = (ago: number) =>
      rows
        .filter((s) => businessDate(s.paidAt!, "America/Chicago") === daysAgo(today, ago))
        .map((s) => clock.format(s.paidAt!))
        .sort();
    expect(times(1)).not.toEqual(times(2));
  });

  it("takes about a third in cash, tips only on PayPal sales, and totals like the Sell screen", async () => {
    const rows = await db.select().from(sales);
    const cash = rows.filter((s) => s.status === "paid_cash");
    expect(cash.length / rows.length).toBeGreaterThanOrEqual(0.2);
    expect(cash.length / rows.length).toBeLessThanOrEqual(0.4);
    expect(cash.every((s) => s.tipCents === 0)).toBe(true);
    expect(rows.filter((s) => s.tipCents > 0).length).toBeGreaterThan(5);
    for (const sale of rows) {
      const tipPct =
        sale.tipCents === 0
          ? null
          : ([15, 18, 20] as const).find((pct) => computeTotals(sale.lines, 0.0825, pct).tipCents === sale.tipCents);
      expect(tipPct, sale.draftId).not.toBeUndefined();
      expect(computeTotals(sale.lines, 0.0825, tipPct ?? null)).toEqual({
        subtotalCents: sale.subtotalCents,
        taxCents: sale.taxCents,
        tipCents: sale.tipCents,
        totalCents: sale.totalCents,
      });
      expect(sale.invoiceNumber).toMatch(/^STALL-\d{8}-[0-9A-F]{6}$/);
      expect(sale.invoiceNumber!.slice(6, 14)).toBe(
        businessDate(sale.paidAt!, "America/Chicago").replaceAll("-", ""),
      );
      expect(sale.invoiceId).toMatch(/^INV2-SEED-\d+$/);
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

  it("creates Tortilleria Rosa as a manual supplier whose daily limit covers her bills", async () => {
    const [rosa] = await db
      .select()
      .from(payees)
      .where(eq(payees.id, result.payees.rosa));
    expect(rosa).toMatchObject({
      role: "supplier",
      autoPay: false,
      maxPerDayCents: 30000,
    });
    expect(rosa!.name).toContain("Rosa");
    const rosaBills = await db.select().from(bills).where(eq(bills.payeeId, rosa!.id));
    for (const bill of rosaBills) expect(bill.amountCents).toBeLessThanOrEqual(rosa!.maxPerDayCents);
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
      batchId: obligationBatchId(result.businessId, "bill", paid.id),
    });
    // Sent with the bill two days ago, so it never counts as today's.
    expect(businessDate(payout!.createdAt, "America/Chicago")).toBe(paid.date);
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

  it("seeds 13 catalog items and 140-255 paid sales across the past week and today", async () => {
    const items = await db.select().from(catalogItems);
    expect(items).toHaveLength(13);
    const salesRows = await db.select().from(sales);
    expect(salesRows.length).toBeGreaterThanOrEqual(140);
    expect(salesRows.length).toBeLessThanOrEqual(255);
    for (const s of salesRows) {
      expect(["paid", "paid_cash"]).toContain(s.status);
      expect(s.totalCents).toBe(s.subtotalCents + s.taxCents + s.tipCents);
    }
  });

  it("matches the menu when the owner names items in English, Spanish or Polish", async () => {
    const catalog = await db.select().from(catalogItems);
    const said = {
      "Agua fresca": ["agua fresca", "fruit water", "woda owocowa", "lemoniada"],
      "Mexican Coke": ["coke", "coca", "cola", "kola", "coca de vidrio"],
      "Chips and salsa": ["chips", "totopos", "nachos", "chipsy"],
      Elote: ["corn", "elote", "kukurydza"],
      Churros: ["churro", "czurros"],
      Quesadilla: ["kesadilla", "quesadillas"],
      Horchata: ["orczata"],
      "Bottled water": ["water", "agua", "woda", "butelka wody"],
    } satisfies Record<string, string[]>;
    for (const [name, words] of Object.entries(said)) {
      const items = matchCatalog(
        words.map((word) => ({ name: word, qty: 1, unitCents: null, confidence: 1 })),
        catalog,
      );
      const id = catalog.find((c) => c.name === name)!.id;
      for (const [i, item] of items.entries()) expect(item.catalogItemId, words[i]).toBe(id);
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
    expect(await db.select().from(catalogItems)).toHaveLength(13);
    expect(await db.select().from(sales)).toHaveLength(before.sales);
    expect(await db.select().from(shifts)).toHaveLength(before.shifts);
    expect(await db.select().from(payouts)).toHaveLength(before.payouts);
  });

  it("seeds payees with the real sandbox emails when configured, else the example ones", async () => {
    vi.stubEnv("SANDBOX_MARIA_EMAIL", "maria-real@personal.example.com");
    vi.stubEnv("SANDBOX_ROSA_EMAIL", "rosa-real@personal.example.com");
    await seed(db);
    expect((await db.select().from(payees)).map((p) => p.email).sort()).toEqual([
      "maria-real@personal.example.com",
      "rosa-real@personal.example.com",
    ]);

    vi.stubEnv("SANDBOX_MARIA_EMAIL", "");
    vi.stubEnv("SANDBOX_ROSA_EMAIL", "");
    await seed(db);
    expect((await db.select().from(payees)).map((p) => p.email).sort()).toEqual([
      "maria@stall.example",
      "rosa@stall.example",
    ]);
  });

  it("sets up the close demo: the rules pay Maria and hold Rosa's bill as a duplicate", async () => {
    const seeded = await seed(db);
    const today = businessDate(new Date(), "America/Chicago");
    const data = await loadCloseData(db, seeded.businessId, today);
    const outcomes = evaluateObligations({
      date: today,
      obligations: data.obligations,
      existingPayouts: data.existingPayouts,
      paidBills: data.paidBills,
      paidTodayByPayee: data.paidTodayByPayee,
      businessDailyCapCents: 50_000,
    });
    expect(outcomes.map((o) => [o.obligation.payee.name, o.verdict, o.decisionType])).toEqual([
      ["Maria", "pay", undefined],
      ["Tortillería Rosa", "hold", "duplicate_bill"],
    ]);
    // The earlier payout was two days ago, so nothing counts against today's limits.
    expect(data.paidTodayByPayee).toEqual({});
  });
});

describe("seed: today's sales so far", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  const salesOn = async (date: string) =>
    (await db.select().from(sales)).filter((s) => businessDate(s.paidAt!, "America/Chicago") === date);

  it("in the afternoon, has 6-10 sales already paid today and none in the future", async () => {
    const now = new Date("2026-11-06T22:00:00Z"); // 16:00 in Chicago (CST)
    await seed(db, { now });
    const today = await salesOn("2026-11-06");
    expect(today.length).toBeGreaterThanOrEqual(6);
    expect(today.length).toBeLessThanOrEqual(10);
    for (const sale of await db.select().from(sales)) {
      expect(sale.paidAt!.getTime()).toBeLessThanOrEqual(now.getTime());
    }
    expect(await db.select().from(shifts).where(eq(shifts.date, "2026-11-06"))).toHaveLength(1);
  });

  it("early in the morning, has no sales today yet rather than sales in the future", async () => {
    const now = new Date("2026-11-06T13:00:00Z"); // 07:00 in Chicago
    await seed(db, { now });
    expect(await salesOn("2026-11-06")).toHaveLength(0);
    expect((await salesOn("2026-11-05")).length).toBeGreaterThanOrEqual(20);
    for (const sale of await db.select().from(sales)) {
      expect(sale.paidAt!.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("is deterministic: the same moment seeds the same sales", async () => {
    const now = new Date("2026-11-06T22:00:00Z");
    const snapshot = async () =>
      (await db.select().from(sales))
        .map((s) => [s.draftId, s.status, s.totalCents, s.tipCents, s.paidAt!.toISOString(), s.invoiceNumber, s.transcript])
        .sort();
    await seed(db, { now });
    const first = await snapshot();
    await seed(db, { now });
    expect(await snapshot()).toEqual(first);
  });
});
