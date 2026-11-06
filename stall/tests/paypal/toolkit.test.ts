import { describe, expect, it } from "vitest";
import { createInvoiceLookup, unpaidFromList } from "@/lib/paypal/toolkit";

const list = {
  items: [
    { id: "INV2-1", status: "SENT", detail: { invoice_number: "STALL-1", invoice_date: "2026-11-05" }, amount: { value: "12.50", currency_code: "USD" } },
    { id: "INV2-2", status: "PAID", detail: { invoice_number: "STALL-2", invoice_date: "2026-11-05" }, amount: { value: "8.00", currency_code: "USD" } },
    { id: "INV2-3", status: "SENT", detail: { invoice_number: "STALL-3", invoice_date: "2026-11-04" }, amount: { value: "3.00", currency_code: "USD" } },
  ],
};

describe("unpaidFromList", () => {
  it("keeps only that day's unpaid invoices, as small rows", () => {
    expect(unpaidFromList(list, "2026-11-05")).toEqual([
      { invoiceId: "INV2-1", number: "STALL-1", status: "SENT", total: "12.50 USD" },
    ]);
  });
  it("accepts JSON text and survives junk", () => {
    expect(unpaidFromList(JSON.stringify(list), "2026-11-04")).toHaveLength(1);
    expect(unpaidFromList("not json", "2026-11-05")).toEqual([]);
    expect(unpaidFromList({ error: "x" }, "2026-11-05")).toEqual([]);
  });
});

describe("createInvoiceLookup", () => {
  it("is off in mock mode or without credentials", () => {
    expect(createInvoiceLookup({ PAYPAL_MOCK: "1", PAYPAL_CLIENT_ID: "a", PAYPAL_CLIENT_SECRET: "b" })).toBeNull();
    expect(createInvoiceLookup({})).toBeNull();
  });
  it("builds the toolkit's list_invoices when configured", () => {
    expect(createInvoiceLookup({ PAYPAL_CLIENT_ID: "a", PAYPAL_CLIENT_SECRET: "b" })).not.toBeNull();
  });
});
