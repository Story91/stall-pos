import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import { sales } from "@/db/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(holder.db as object, prop) }),
}));

import { GET } from "@/app/api/export/route";
import { ownerCookieValue } from "@/lib/auth";
import type { Db } from "@/db";
import { getBusiness } from "@/lib/sales";

const HEADER = "date,invoice_number,status,method,subtotal,tax,tip,total,items";

function url(query: string): string {
  return `http://localhost/api/export${query}`;
}

function ownerRequest(query: string): Request {
  return new Request(url(query), { headers: { Cookie: `stall_owner=${ownerCookieValue()}` } });
}

describe("GET /api/export", () => {
  let close: () => Promise<void>;
  let db: Db;

  beforeAll(async () => {
    const test = await createTestDb();
    db = test.db;
    holder.db = test.db;
    close = test.close;
    await seed(test.db);
    // Replace the seeded history with a few sales whose dates the tests control.
    // The business timezone is America/Chicago (UTC-5 in March 2026).
    const business = await getBusiness(db);
    await db.delete(sales);
    await db.insert(sales).values([
      {
        businessId: business.id,
        draftId: "export-cash",
        invoiceNumber: "STALL-CASH",
        status: "paid_cash",
        lines: [{ name: "Coffee, large", qty: 2, unitCents: 650, taxable: true }],
        subtotalCents: 1300,
        taxCents: 107,
        tipCents: 0,
        totalCents: 1407,
        createdAt: new Date("2026-03-09T15:00:00Z"),
        paidAt: new Date("2026-03-09T16:00:00Z"),
      },
      {
        // Paid after midnight UTC but still 2026-03-09 in Chicago.
        businessId: business.id,
        draftId: "export-late-utc",
        invoiceNumber: "STALL-LATE",
        status: "paid",
        lines: [{ name: "Tacos", qty: 1, unitCents: 1000, taxable: false }],
        subtotalCents: 1000,
        taxCents: 0,
        tipCents: 0,
        totalCents: 1000,
        createdAt: new Date("2026-03-10T04:00:00Z"),
        paidAt: new Date("2026-03-10T04:30:00Z"),
      },
      {
        // Created on 03-08 but paid on 03-09: belongs to 03-09 by paidAt.
        businessId: business.id,
        draftId: "export-paid-next-day",
        invoiceNumber: "STALL-CARRY",
        status: "paid",
        lines: [{ name: "Muffin", qty: 1, unitCents: 299, taxable: false }],
        subtotalCents: 299,
        taxCents: 0,
        tipCents: 0,
        totalCents: 299,
        createdAt: new Date("2026-03-08T12:00:00Z"),
        paidAt: new Date("2026-03-09T18:00:00Z"),
      },
      {
        businessId: business.id,
        draftId: "export-draft",
        invoiceNumber: null,
        status: "draft",
        lines: [{ name: "Ghost", qty: 1, unitCents: 100, taxable: false }],
        subtotalCents: 100,
        taxCents: 0,
        tipCents: 0,
        totalCents: 100,
        createdAt: new Date("2026-03-09T17:00:00Z"),
      },
      {
        // Paid on 03-11, outside the 03-09..03-10 range.
        businessId: business.id,
        draftId: "export-later",
        invoiceNumber: "STALL-LATER",
        status: "paid",
        lines: [{ name: "Later", qty: 1, unitCents: 500, taxable: false }],
        subtotalCents: 500,
        taxCents: 0,
        tipCents: 0,
        totalCents: 500,
        createdAt: new Date("2026-03-11T15:00:00Z"),
        paidAt: new Date("2026-03-11T15:00:00Z"),
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

  it("returns CSV for paid sales whose business date is in the range", async () => {
    const response = await GET(ownerRequest("?from=2026-03-09&to=2026-03-10"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="stall-2026-03-09_2026-03-10.csv"',
    );
    expect(await response.text()).toBe(
      [
        HEADER,
        '2026-03-09,STALL-CASH,paid_cash,cash,13.00,1.07,0.00,14.07,"2× Coffee, large"',
        "2026-03-09,STALL-CARRY,paid,paypal,2.99,0.00,0.00,2.99,1× Muffin",
        "2026-03-09,STALL-LATE,paid,paypal,10.00,0.00,0.00,10.00,1× Tacos",
        "",
      ].join("\r\n"),
    );
  });

  it("filters to a single business day", async () => {
    const response = await GET(ownerRequest("?from=2026-03-10&to=2026-03-10"));
    const body = await response.text();

    expect(body).toBe([HEADER, ""].join("\r\n"));
  });

  it("accepts a 92-day inclusive range and rejects 93 days", async () => {
    expect((await GET(ownerRequest("?from=2026-01-01&to=2026-04-02"))).status).toBe(200);
    expect((await GET(ownerRequest("?from=2026-01-01&to=2026-04-03"))).status).toBe(400);
  });

  it("returns 400 when from is after to", async () => {
    expect((await GET(ownerRequest("?from=2026-03-10&to=2026-03-09"))).status).toBe(400);
  });

  it("returns 400 when from or to is missing or not a real date", async () => {
    expect((await GET(ownerRequest("?from=2026-03-09"))).status).toBe(400);
    expect((await GET(ownerRequest("?to=2026-03-09"))).status).toBe(400);
    expect((await GET(ownerRequest("?from=2026-02-30&to=2026-03-09"))).status).toBe(400);
    expect((await GET(ownerRequest("?from=03-09-2026&to=2026-03-10"))).status).toBe(400);
  });

  it("requires the owner cookie", async () => {
    expect((await GET(new Request(url("?from=2026-03-09&to=2026-03-10")))).status).toBe(401);
  });
});
