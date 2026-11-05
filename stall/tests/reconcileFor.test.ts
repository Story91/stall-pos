import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { eq } from "drizzle-orm";
import { sales } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb } from "@/db/test-db";
import { reconcileFor } from "@/lib/closeApi";
import { businessDate, daysAgo } from "@/lib/dates";

let db: Db;
let close: () => Promise<void>;
let day: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
  day = daysAgo(businessDate(new Date(), "America/Chicago"), 1);
}, 60_000);
afterAll(async () => close());

describe("reconcileFor", () => {
  it("asks Transaction Search for a window around the day and skips the seeded history", async () => {
    const listTransactions = vi.fn(async () => []);
    const report = await reconcileFor(db, day, { listTransactions });
    const [start, end] = listTransactions.mock.calls[0] as unknown as [Date, Date];
    expect(start.toISOString()).toBe(`${daysAgo(day, 1)}T00:00:00.000Z`);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
    if (!report.available) throw new Error("expected a report");
    // Yesterday's demo sales are seeded (INV2-SEED-*), never sent to PayPal: nothing to match.
    expect(report.stall.inCents).toBe(0);
    expect(report.status).toBe("match");
  });

  it("finds a real PayPal sale missing from PayPal's report", async () => {
    await db.update(sales).set({ invoiceId: "INV2-REAL-1" }).where(eq(sales.draftId, "seed-draft-1"));
    const [row] = await db.select().from(sales).where(eq(sales.draftId, "seed-draft-1"));
    const saleDay = businessDate(row!.paidAt!, "America/Chicago");
    const report = await reconcileFor(db, saleDay, { listTransactions: async () => [] });
    if (!report.available) throw new Error("expected a report");
    expect(report.status).toBe("gaps");
    expect(report.missing.map((m) => m.id)).toContain(row!.id);
  });

  it("reports PayPal as unavailable instead of failing, and refuses a future day", async () => {
    expect(await reconcileFor(db, day, { listTransactions: async () => { throw new Error("403"); } })).toEqual({
      available: false,
      reason: "paypal",
    });
    expect(await reconcileFor(db, "2099-01-01", { listTransactions: async () => [] })).toEqual({
      available: false,
      reason: "future",
    });
  });
});
