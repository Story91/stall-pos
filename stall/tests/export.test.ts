import { describe, expect, it } from "vitest";
import type { Sale } from "@/db";
import { salesToCsv } from "@/lib/export";

const TZ = "America/Chicago";

/** The line at `index` of a CSV string; throws when it is missing. */
function line(csv: string, index: number): string {
  const value = csv.split("\r\n")[index];
  if (value === undefined) throw new Error(`no CSV line at ${index}`);
  return value;
}

function sale(over: Partial<Sale> = {}): Sale {
  const base: Sale = {
    id: "00000000-0000-4000-8000-000000000001",
    businessId: "00000000-0000-4000-8000-0000000000aa",
    draftId: "draft-1",
    invoiceId: null,
    invoiceNumber: "STALL-20260309-ABC123",
    status: "paid",
    lines: [{ name: "Coffee", qty: 1, unitCents: 1299, taxable: false }],
    subtotalCents: 1299,
    taxCents: 0,
    tipCents: 0,
    totalCents: 1299,
    language: "en",
    transcript: null,
    qrPng: null,
    payLink: null,
    paidAt: new Date("2026-03-09T16:00:00Z"),
    createdAt: new Date("2026-03-09T15:00:00Z"),
  };
  return { ...base, ...over };
}

describe("salesToCsv", () => {
  it("writes a header and one CRLF line per sale, money as two decimals", () => {
    const rows = [
      sale({
        id: "a",
        invoiceNumber: "STALL-A",
        status: "paid",
        lines: [{ name: "Coffee", qty: 1, unitCents: 1299, taxable: false }],
        subtotalCents: 1299,
        taxCents: 0,
        tipCents: 0,
        totalCents: 1299,
      }),
      sale({
        id: "b",
        invoiceNumber: "STALL-B",
        status: "paid_cash",
        paidAt: new Date("2026-03-09T17:00:00Z"),
        lines: [{ name: "Tacos", qty: 2, unitCents: 500, taxable: true }],
        subtotalCents: 1000,
        taxCents: 80,
        tipCents: 150,
        totalCents: 1230,
      }),
    ];

    expect(salesToCsv(rows, TZ)).toBe(
      [
        "date,invoice_number,status,method,subtotal,tax,tip,total,items",
        "2026-03-09,STALL-A,paid,paypal,12.99,0.00,0.00,12.99,1× Coffee",
        "2026-03-09,STALL-B,paid_cash,cash,10.00,0.80,1.50,12.30,2× Tacos",
        "",
      ].join("\r\n"),
    );
  });

  it("joins items with '; ' and quotes names that contain commas", () => {
    const csv = salesToCsv(
      [
        sale({
          lines: [
            { name: "Coffee, large", qty: 2, unitCents: 650, taxable: true },
            { name: "Muffin", qty: 1, unitCents: 299, taxable: false },
          ],
        }),
      ],
      TZ,
    );

    const line = csv.split("\r\n")[1];
    expect(line).toBe(
      '2026-03-09,STALL-20260309-ABC123,paid,paypal,12.99,0.00,0.00,12.99,"2× Coffee, large; 1× Muffin"',
    );
  });

  it("doubles inner quotes and quotes fields with newlines (RFC 4180)", () => {
    const csv = salesToCsv(
      [sale({ lines: [{ name: 'Say "hi"\nburger', qty: 1, unitCents: 1299, taxable: false }] })],
      TZ,
    );

    expect(line(csv, 1).endsWith(',"1× Say ""hi""\nburger"')).toBe(true);
  });

  it("uses the business date of paidAt, not the UTC date", () => {
    // 2026-03-10 04:30 UTC is 2026-03-09 23:30 in Chicago (CDT, UTC-5).
    const csv = salesToCsv(
      [
        sale({
          createdAt: new Date("2026-03-10T04:00:00Z"),
          paidAt: new Date("2026-03-10T04:30:00Z"),
        }),
      ],
      TZ,
    );

    expect(line(csv, 1).startsWith("2026-03-09,")).toBe(true);
  });

  it("falls back to createdAt for the date when paidAt is missing", () => {
    const csv = salesToCsv(
      [sale({ status: "paid", paidAt: null, createdAt: new Date("2026-03-09T15:00:00Z") })],
      TZ,
    );

    expect(line(csv, 1).startsWith("2026-03-09,")).toBe(true);
  });

  it("includes only paid and paid_cash sales, ordered by paidAt ?? createdAt", () => {
    const csv = salesToCsv(
      [
        sale({ id: "late", invoiceNumber: "LATE", paidAt: new Date("2026-03-09T20:00:00Z") }),
        sale({ id: "draft", invoiceNumber: "DRAFT", status: "draft", paidAt: null }),
        sale({ id: "awaiting", invoiceNumber: "AWAIT", status: "awaiting", paidAt: null }),
        sale({ id: "cancelled", invoiceNumber: "CANC", status: "cancelled" }),
        sale({
          id: "early-created",
          invoiceNumber: "EARLY",
          createdAt: new Date("2026-03-09T13:00:00Z"),
          paidAt: new Date("2026-03-09T14:00:00Z"),
        }),
        sale({ id: "cash", invoiceNumber: "CASH", status: "paid_cash", paidAt: new Date("2026-03-09T18:00:00Z") }),
      ],
      TZ,
    );

    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(4);
    expect(lines.slice(1).map((l) => l.split(",")[1])).toEqual(["EARLY", "CASH", "LATE"]);
  });

  it("maps paid to paypal and paid_cash to cash", () => {
    const csv = salesToCsv(
      [
        sale({ invoiceNumber: "P", status: "paid" }),
        sale({ invoiceNumber: "C", status: "paid_cash", paidAt: new Date("2026-03-09T18:00:00Z") }),
      ],
      TZ,
    );

    expect(line(csv, 1).split(",")[3]).toBe("paypal");
    expect(line(csv, 2).split(",")[3]).toBe("cash");
  });

  it("leaves invoice_number empty when the sale has none", () => {
    const csv = salesToCsv([sale({ invoiceNumber: null })], TZ);

    expect(line(csv, 1).split(",")[1]).toBe("");
  });

  it("returns only the header line when there are no paid sales", () => {
    expect(salesToCsv([sale({ status: "draft", paidAt: null })], TZ)).toBe(
      "date,invoice_number,status,method,subtotal,tax,tip,total,items\r\n",
    );
  });
});
