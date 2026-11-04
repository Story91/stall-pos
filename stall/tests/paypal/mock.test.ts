import { describe, expect, it } from "vitest";
import { invoiceDeps, parseDep } from "@/lib/salesApi";
import { createAndSendInvoice, generateQr } from "@/lib/paypal/invoices";
import { parseSale } from "@/lib/parse/parseSale";
import {
  isMockEnabled,
  mockInvoices,
  mockParseSale,
  MOCK_INVOICE_ID,
} from "@/lib/paypal/mock";

describe("mock modes", () => {
  it("are honoured outside production only", () => {
    expect(isMockEnabled("PAYPAL_MOCK", { PAYPAL_MOCK: "1", NODE_ENV: "development" })).toBe(true);
    expect(isMockEnabled("PAYPAL_MOCK", { PAYPAL_MOCK: "1", NODE_ENV: "test" })).toBe(true);
    expect(isMockEnabled("PAYPAL_MOCK", { PAYPAL_MOCK: "1", NODE_ENV: "production" })).toBe(false);
    expect(isMockEnabled("PAYPAL_MOCK", { PAYPAL_MOCK: "true", NODE_ENV: "development" })).toBe(false);
    expect(isMockEnabled("PARSE_MOCK", { NODE_ENV: "development" })).toBe(false);
  });

  it("invoiceDeps returns the mock off-production and the real client in production", () => {
    const dev = invoiceDeps({ PAYPAL_MOCK: "1", NODE_ENV: "development" });
    expect(dev.invoices).toBe(mockInvoices);
    const prod = invoiceDeps({ PAYPAL_MOCK: "1", NODE_ENV: "production" });
    expect(prod.invoices.createAndSendInvoice).toBe(createAndSendInvoice);
    expect(prod.invoices.generateQr).toBe(generateQr);
    expect(invoiceDeps({ NODE_ENV: "development" }).invoices.createAndSendInvoice).toBe(
      createAndSendInvoice,
    );
  });

  it("parseDep returns the fixed parser off-production and the model in production", () => {
    expect(parseDep({ PARSE_MOCK: "1", NODE_ENV: "development" })).toBe(mockParseSale);
    expect(parseDep({ PARSE_MOCK: "1", NODE_ENV: "production" })).toBe(parseSale);
    expect(parseDep({ NODE_ENV: "development" })).toBe(parseSale);
  });

  it("mock invoices return a fixed id, a pay link and a decodable PNG", async () => {
    const created = await mockInvoices.createAndSendInvoice({} as never, "req");
    expect(created).toEqual({ invoiceId: MOCK_INVOICE_ID, payLink: "https://example.invalid/pay" });
    const png = Buffer.from(await mockInvoices.generateQr(MOCK_INVOICE_ID, "req"), "base64");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    await expect(
      invoiceDeps({ PAYPAL_MOCK: "1", NODE_ENV: "development" }).recordCashPayment(
        MOCK_INVOICE_ID,
        974,
        "r",
      ),
    ).resolves.toBeUndefined();
  });

  it("mock parser returns two tacos al pastor at 4.50 and rejects other orders", async () => {
    const parsed = await mockParseSale({
      transcript: "two tacos al pastor",
      language: "en",
      catalog: [],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      name: "Taco al pastor",
      qty: 2,
      unitCents: 450,
      taxable: true,
    });
    await expect(
      mockParseSale({ transcript: "a unicorn", language: "en", catalog: [] }),
    ).rejects.toThrow();
  });
});
