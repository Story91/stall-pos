import type { ParsedSale } from "@/lib/parse/schema";
import type { parseSale } from "@/lib/parse/parseSale";
import type { SaleInvoices } from "@/lib/sales";

// Offline stand-ins for PayPal and the parser, used by the Playwright smoke
// test. They never run in production: callers go through `isMockEnabled`.

type Env = Record<string, string | undefined>;

/** `<NAME>=1`, honoured only when NODE_ENV is not "production". */
export function isMockEnabled(name: "PAYPAL_MOCK" | "PARSE_MOCK", env: Env = process.env): boolean {
  return env[name] === "1" && env.NODE_ENV !== "production";
}

export const MOCK_INVOICE_ID = "INV2-MOCK-0001";
export const MOCK_PAY_LINK = "https://example.invalid/pay";

// 1x1 PNG.
const MOCK_QR_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export const mockInvoices: SaleInvoices = {
  async createAndSendInvoice() {
    return { invoiceId: MOCK_INVOICE_ID, payLink: MOCK_PAY_LINK };
  },
  async generateQr() {
    return MOCK_QR_PNG;
  },
};

export const mockRecordCashPayment = async (): Promise<void> => {};
export const mockCancelInvoice = async (): Promise<void> => {};
export const mockGetInvoiceStatus = async (): Promise<string> => "SENT";

/** Fixed parse of the smoke-test order; any other transcript fails like a model error would. */
export const mockParseSale: typeof parseSale = async (input) => {
  if (!/two tacos al pastor/i.test(input.transcript)) {
    throw new Error("PARSE_MOCK only understands “two tacos al pastor”");
  }
  const sale: ParsedSale = {
    items: [
      { name: "Taco al pastor", qty: 2, unitCents: 450, confidence: 1, taxable: true },
    ],
    spokenConfirmation: "Two tacos al pastor",
    language: input.language,
  };
  return sale;
};
