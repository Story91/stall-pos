import type { computeTotals, Line } from "@/lib/money";
import { fromMoney, PayPalError, paypalFetch, toMoney } from "./client";
import { invoiceCreateSchema, invoiceGetSchema, invoiceStatusSchema, parseResponse } from "./schemas";

type Money = { currency_code: "USD"; value: string };

export type InvoiceItem = {
  name: string;
  quantity: string;
  unit_amount: Money;
  unit_of_measure?: "QUANTITY";
  tax?: { name: string; percent: string };
};

export type InvoicePayload = {
  detail: {
    currency_code: "USD";
    invoice_number: string;
    note: string;
    payment_term: { term_type: "DUE_ON_RECEIPT" };
  };
  invoicer: { business_name: string };
  items: InvoiceItem[];
};

const usd = (cents: number): Money => ({
  currency_code: "USD",
  value: toMoney(cents),
});

/** "8.875" for 0.08875, "8.25" for 0.0825, "8" for 0.08: up to three decimals, no trailing zeros. */
export function taxPercent(taxRate: number): string {
  return (taxRate * 100).toFixed(3).replace(/\.?0+$/, "");
}

/**
 * Totals are not sent: PayPal computes them from the items, rounding tax per
 * line. PayPal's total is authoritative; `chargeSale` stores it if ours differs.
 */
export function buildInvoicePayload(input: {
  invoiceNumber: string;
  lines: Line[];
  totals: ReturnType<typeof computeTotals>;
  taxRate: number;
  businessName: string;
}): InvoicePayload {
  const percent = taxPercent(input.taxRate);
  const items: InvoiceItem[] = input.lines.map((line) => ({
    name: line.name,
    quantity: String(line.qty),
    unit_amount: usd(line.unitCents),
    unit_of_measure: "QUANTITY",
    tax: line.taxable ? { name: "Sales tax", percent } : undefined,
  }));
  if (input.totals.tipCents > 0) {
    items.push({
      name: "Tip",
      quantity: "1",
      unit_amount: usd(input.totals.tipCents),
    });
  }
  return {
    detail: {
      currency_code: "USD",
      invoice_number: input.invoiceNumber,
      note: input.businessName,
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    invoicer: { business_name: input.businessName },
    items,
  };
}

/** The invoice exists at PayPal but a later step failed; callers can log or clean it up. */
export class PartialInvoiceError extends Error {
  constructor(
    readonly invoiceId: string,
    readonly step: "send" | "read",
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    super(`PayPal invoice ${invoiceId} created but ${step} failed${detail}`, { cause });
    this.name = "PartialInvoiceError";
  }
}

/**
 * Creates the invoice, marks it sent without emailing anyone (the customer pays
 * by scanning the QR / opening the link), and reads back the payer-facing link
 * and PayPal's own total.
 */
export async function createAndSendInvoice(
  payload: InvoicePayload,
  requestId: string,
): Promise<{ invoiceId: string; payLink: string; amountCents: number }> {
  const created = parseResponse(
    invoiceCreateSchema,
    await paypalFetch<unknown>({
      method: "POST",
      path: "/v2/invoicing/invoices",
      body: payload,
      requestId,
    }),
  );
  // Depending on the Prefer header PayPal returns the full invoice or only
  // { rel, href, method }, whose last path segment is the id.
  const invoiceId = created.id ?? created.href?.split("/").filter(Boolean).pop();
  if (!invoiceId) {
    throw new Error("PayPal create invoice response had neither id nor href");
  }

  try {
    await paypalFetch({
      method: "POST",
      path: `/v2/invoicing/invoices/${invoiceId}/send`,
      body: { send_to_recipient: false, send_to_invoicer: false },
      requestId: `${requestId}-send`,
    });
  } catch (error) {
    throw new PartialInvoiceError(invoiceId, "send", error);
  }

  try {
    const invoice = parseResponse(
      invoiceGetSchema,
      await paypalFetch<unknown>({ method: "GET", path: `/v2/invoicing/invoices/${invoiceId}` }),
    );
    return {
      invoiceId,
      payLink: invoice.detail.metadata.recipient_view_url,
      amountCents: fromMoney(invoice.amount.value),
    };
  } catch (error) {
    throw new PartialInvoiceError(invoiceId, "read", error);
  }
}

// The QR endpoint answers with a multipart/form-data body (or, in other
// environments, a bare base64 string), which paypalFetch's JSON parsing would
// reject. Re-encode a non-JSON success body as a JSON string so it survives.
const rawBodyFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.ok) return res;
  const text = await res.text();
  let body = text;
  try {
    JSON.parse(text);
  } catch {
    body = JSON.stringify(text);
  }
  return new Response(body, { status: res.status, headers: res.headers });
};

/** Pulls the `image` part out of a multipart body; undefined if there is none. */
function extractMultipartImage(text: string): string | undefined {
  const part = /name="image"[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n/.exec(text);
  if (!part) return undefined;
  const body = text.slice(part.index + part[0].length);
  const end = body.search(/\r?\n--/);
  return (end === -1 ? body : body.slice(0, end)).trim();
}

/** Base64 PNG of a pay QR code, without quotes or data-URI prefix. */
export async function generateQr(
  invoiceId: string,
  requestId: string,
): Promise<string> {
  const res = await paypalFetch<unknown>({
    method: "POST",
    path: `/v2/invoicing/invoices/${invoiceId}/generate-qr-code`,
    body: { width: 400, height: 400, action: "pay" },
    requestId,
    fetchImpl: rawBodyFetch,
    // The endpoint answers multipart/form-data and 406s on Accept: application/json.
    accept: "*/*",
  });
  if (typeof res !== "string") {
    throw new Error("PayPal QR code response was not a string");
  }
  const base64 = (extractMultipartImage(res) ?? res)
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^data:image\/png;base64,/, "")
    .trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new PayPalError("invalid QR response", 0, "");
  }
  return base64;
}

export async function recordCashPayment(
  invoiceId: string,
  cents: number,
  requestId: string,
): Promise<void> {
  await paypalFetch({
    method: "POST",
    path: `/v2/invoicing/invoices/${invoiceId}/payments`,
    body: { method: "CASH", amount: usd(cents) },
    requestId,
  });
}

/** Cancels an unpaid invoice so the customer can no longer pay it; nobody is emailed. */
export async function cancelInvoice(invoiceId: string, requestId: string): Promise<void> {
  await paypalFetch({
    method: "POST",
    path: `/v2/invoicing/invoices/${invoiceId}/cancel`,
    body: { send_to_invoicer: false, send_to_recipient: false },
    requestId,
  });
}

export async function getInvoiceStatus(invoiceId: string): Promise<string> {
  const invoice = parseResponse(
    invoiceStatusSchema,
    await paypalFetch<unknown>({ method: "GET", path: `/v2/invoicing/invoices/${invoiceId}` }),
  );
  return invoice.status;
}
