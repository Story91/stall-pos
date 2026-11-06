import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import { bills, payouts, sales, shifts } from "@/db/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

import { GET } from "@/app/api/history/route";
import { ownerCookieValue } from "@/lib/auth";
import type { Db } from "@/db";
import type { HistoryResponse } from "@/lib/historyView";
import { getBusiness } from "@/lib/sales";

function url(query: string): string {
  return `http://localhost/api/history${query}`;
}

function ownerRequest(query: string): Request {
  return new Request(url(query), { headers: { Cookie: `stall_owner=${ownerCookieValue()}` } });
}

async function history(query: string): Promise<HistoryResponse> {
  const response = await GET(ownerRequest(query));
  expect(response.status).toBe(200);
  return (await response.json()) as HistoryResponse;
}

describe("GET /api/history", () => {
  let close: () => Promise<void>;
  let db: Db;

  beforeAll(async () => {
    const test = await createTestDb();
    db = test.db;
    holder.db = test.db;
    close = test.close;
    const { payees } = await seed(test.db);
    // Replace the seeded ledger with rows whose dates the tests control.
    // The business timezone is America/Chicago (UTC-5 in March 2026).
    const business = await getBusiness(db);
    await db.delete(payouts);
    await db.delete(bills);
    await db.delete(shifts);
    await db.delete(sales);
    const line = (name: string, qty: number, unitCents: number) => ({ name, qty, unitCents, taxable: true });
    await db.insert(sales).values([
      {
        businessId: business.id,
        draftId: "h-cash",
        invoiceNumber: "STALL-CASH",
        status: "paid_cash",
        lines: [line("Taco al pastor", 2, 450), line("Agua fresca", 1, 300)],
        subtotalCents: 1200,
        taxCents: 99,
        tipCents: 0,
        totalCents: 1299,
        createdAt: new Date("2026-03-09T15:00:00Z"),
        paidAt: new Date("2026-03-09T16:00:00Z"),
      },
      {
        // After midnight UTC but still 2026-03-09 in Chicago.
        businessId: business.id,
        draftId: "h-late",
        invoiceNumber: "STALL-LATE",
        status: "paid",
        lines: [line("Elote", 1, 500)],
        subtotalCents: 500,
        taxCents: 41,
        tipCents: 81,
        totalCents: 622,
        createdAt: new Date("2026-03-10T04:00:00Z"),
        paidAt: new Date("2026-03-10T04:30:00Z"),
      },
      {
        businessId: business.id,
        draftId: "h-awaiting",
        invoiceNumber: "STALL-WAIT",
        status: "awaiting",
        lines: [line("Ghost", 1, 100)],
        subtotalCents: 100,
        taxCents: 0,
        tipCents: 0,
        totalCents: 100,
        createdAt: new Date("2026-03-09T17:00:00Z"),
      },
      {
        businessId: business.id,
        draftId: "h-later",
        invoiceNumber: "STALL-LATER",
        status: "paid",
        lines: [line("Later", 1, 500)],
        subtotalCents: 500,
        taxCents: 0,
        tipCents: 0,
        totalCents: 500,
        createdAt: new Date("2026-03-11T15:00:00Z"),
        paidAt: new Date("2026-03-11T15:00:00Z"),
      },
    ]);
    const [shift] = await db
      .insert(shifts)
      .values({ businessId: business.id, payeeId: payees.maria, date: "2026-03-09" })
      .returning();
    const [bill] = await db
      .insert(bills)
      .values({
        businessId: business.id,
        payeeId: payees.rosa,
        amountCents: 24000,
        note: "tortillas",
        date: "2026-03-09",
        status: "open",
      })
      .returning();
    await db.insert(payouts).values([
      {
        businessId: business.id,
        shiftId: shift!.id,
        batchId: "h-batch-shift",
        amountCents: 12000,
        status: "SUCCESS",
        rationale: "Worked the lunch rush",
        createdAt: new Date("2026-03-10T01:00:00Z"), // 20:00 on 03-09 in Chicago
      },
      {
        businessId: business.id,
        billId: bill!.id,
        batchId: "h-batch-bill",
        amountCents: 24000,
        status: "FAILED",
        rationale: "Tortilla delivery",
        createdAt: new Date("2026-03-10T01:05:00Z"),
      },
    ]);
    vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OWNER_PIN", "1234");
    vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key-for-tests");
  }, 60_000);

  afterAll(async () => {
    await close();
  });

  it("returns paid sales and every payout in the range as one ledger, newest first", async () => {
    const { rows } = await history("?from=2026-03-09&to=2026-03-10");

    expect(rows.map((row) => [row.kind, row.date, row.status])).toEqual([
      ["sale", "2026-03-09", "paid"], // 04:30Z
      ["payout", "2026-03-09", "FAILED"], // 01:05Z
      ["payout", "2026-03-09", "SUCCESS"], // 01:00Z
      ["sale", "2026-03-09", "paid_cash"], // 16:00Z
    ]);
    expect(rows[3]).toMatchObject({
      kind: "sale",
      at: "2026-03-09T16:00:00.000Z",
      who: null,
      items: "2× Taco al pastor, 1× Agua fresca",
      method: "cash",
      inCents: 1299,
      outCents: 0,
      taxCents: 99,
      tipCents: 0,
      invoiceNumber: "STALL-CASH",
    });
    expect(rows[0]).toMatchObject({ method: "paypal", inCents: 622, tipCents: 81, invoiceNumber: "STALL-LATE" });
    expect(rows[2]).toMatchObject({
      kind: "payout",
      who: "Maria",
      items: "Worked the lunch rush",
      method: "payout",
      inCents: 0,
      outCents: 12000,
      invoiceNumber: null,
    });
    // A bill payout says what the bill was for, and names the supplier.
    expect(rows[1]).toMatchObject({ who: "Tortillería Rosa", items: "tortillas", outCents: 24000 });
  });

  it("totals money in and out; a failed payout sent nothing", async () => {
    const { totals } = await history("?from=2026-03-09&to=2026-03-10");
    expect(totals).toEqual({ inCents: 1921, outCents: 12000, netCents: 1921 - 12000, sales: 2, payouts: 2 });
  });

  it("filters by business date", async () => {
    const day10 = await history("?from=2026-03-10&to=2026-03-10");
    expect(day10.rows).toEqual([]);
    expect(day10.totals).toEqual({ inCents: 0, outCents: 0, netCents: 0, sales: 0, payouts: 0 });

    const day11 = await history("?from=2026-03-11&to=2026-03-11");
    expect(day11.rows.map((row) => row.invoiceNumber)).toEqual(["STALL-LATER"]);
  });

  it("returns 400 for a bad or too long range", async () => {
    expect((await GET(ownerRequest("?from=2026-03-10&to=2026-03-09"))).status).toBe(400);
    expect((await GET(ownerRequest("?from=2026-01-01&to=2026-04-03"))).status).toBe(400);
    expect((await GET(ownerRequest("?from=2026-03-09"))).status).toBe(400);
    expect((await GET(ownerRequest("?from=2026-02-30&to=2026-03-09"))).status).toBe(400);
    expect((await GET(ownerRequest("?from=2026-03-09&to=2026-03-10&language=de"))).status).toBe(400);
    expect((await GET(ownerRequest("?from=2026-03-09&to=2026-03-10&language=pl"))).status).toBe(200);
  });

  it("requires the owner cookie", async () => {
    expect((await GET(new Request(url("?from=2026-03-09&to=2026-03-10")))).status).toBe(401);
  });
});
