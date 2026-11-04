import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paypal/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paypal/client")>();
  return { ...actual, paypalFetch: vi.fn() };
});

import { paypalFetch } from "@/lib/paypal/client";
import { PayPalError } from "@/lib/paypal/client";
import { computeTotals, type Line } from "@/lib/money";
import {
  buildInvoicePayload,
  createAndSendInvoice,
  PartialInvoiceError,
  generateQr,
  getInvoiceStatus,
  recordCashPayment,
} from "@/lib/paypal/invoices";

const mockFetch = vi.mocked(paypalFetch);

// The spec example: 2 x $4.50 taxable, 1 x $3.00 not taxable.
const lines: Line[] = [
  { name: "Tacos", qty: 2, unitCents: 450, taxable: true },
  { name: "Horchata", qty: 1, unitCents: 300, taxable: false },
];
const taxRate = 0.0825;

function payload(tipPct: 0 | 15 | 18 | 20 | null) {
  return buildInvoicePayload({
    invoiceNumber: "STALL-20261103-AB12",
    lines,
    totals: computeTotals(lines, taxRate, tipPct),
    taxRate,
    businessName: "La Esquina",
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("buildInvoicePayload", () => {
  it("builds the invoice detail, invoicer and items", () => {
    const p = payload(null);
    expect(p.detail).toEqual({
      currency_code: "USD",
      invoice_number: "STALL-20261103-AB12",
      note: "La Esquina",
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    });
    expect(p.invoicer).toEqual({ business_name: "La Esquina" });
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toEqual({
      name: "Tacos",
      quantity: "2",
      unit_amount: { currency_code: "USD", value: "4.50" },
      unit_of_measure: "QUANTITY",
      tax: { name: "Sales tax", percent: "8.25" },
    });
    expect(p.items[1]!.unit_amount.value).toBe("3.00");
  });

  it("sends a tax rate with up to three decimals, without trailing zeros", () => {
    const at = (rate: number) =>
      buildInvoicePayload({
        invoiceNumber: "N",
        lines,
        totals: computeTotals(lines, rate, null),
        taxRate: rate,
        businessName: "B",
      }).items[0]!.tax!.percent;
    expect(at(0.08875)).toBe("8.875");
    expect(at(0.0825)).toBe("8.25");
    expect(at(0.08)).toBe("8");
  });

  it("puts tax only on taxable items", () => {
    const p = payload(null);
    expect(p.items[0]!.tax?.percent).toBe("8.25");
    expect(p.items[1]!.tax).toBeUndefined();
  });

  it("adds an untaxed Tip item when tipCents > 0", () => {
    const p = payload(18); // 18% of 1200 = 216
    expect(p.items).toHaveLength(3);
    expect(p.items[2]).toEqual({
      name: "Tip",
      quantity: "1",
      unit_amount: { currency_code: "USD", value: "2.16" },
    });
    expect(p.items[2]!.tax).toBeUndefined();
  });

  it("adds no tip item when there is no tip, and sends no amount totals", () => {
    expect(payload(null).items.some((i) => i.name === "Tip")).toBe(false);
    expect(payload(0).items.some((i) => i.name === "Tip")).toBe(false);
    expect(JSON.stringify(payload(18))).not.toContain('"amount"');
  });
});

describe("createAndSendInvoice", () => {
  it("creates, sends without emailing, then reads the pay link", async () => {
    mockFetch
      .mockResolvedValueOnce({
        id: "INV2-AAAA",
        href: "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-AAAA",
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: "INV2-AAAA",
        status: "SENT",
        amount: { currency_code: "USD", value: "9.74" },
        detail: { metadata: { recipient_view_url: "https://paypal.test/invoice/p/#AAAA" } },
      });

    const body = payload(null);
    const result = await createAndSendInvoice(body, "draft-1");

    expect(result).toEqual({
      invoiceId: "INV2-AAAA",
      payLink: "https://paypal.test/invoice/p/#AAAA",
      amountCents: 974,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0]![0]).toEqual({
      method: "POST",
      path: "/v2/invoicing/invoices",
      body,
      requestId: "draft-1",
    });
    expect(mockFetch.mock.calls[1]![0]).toEqual({
      method: "POST",
      path: "/v2/invoicing/invoices/INV2-AAAA/send",
      body: { send_to_recipient: false, send_to_invoicer: false },
      requestId: "draft-1-send",
    });
    expect(mockFetch.mock.calls[2]![0]).toEqual({
      method: "GET",
      path: "/v2/invoicing/invoices/INV2-AAAA",
    });
  });

  it("derives the id from href when the create response has no id", async () => {
    mockFetch
      .mockResolvedValueOnce({
        href: "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-BBBB",
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: "INV2-BBBB",
        status: "SENT",
        amount: { currency_code: "USD", value: "9.74" },
        detail: { metadata: { recipient_view_url: "https://paypal.test/p/BBBB" } },
      });

    const result = await createAndSendInvoice(payload(null), "draft-2");
    expect(result.invoiceId).toBe("INV2-BBBB");
    expect(mockFetch.mock.calls[1]![0].path).toBe(
      "/v2/invoicing/invoices/INV2-BBBB/send",
    );
  });

  it("fails clearly when PayPal returns no recipient view url", async () => {
    mockFetch
      .mockResolvedValueOnce({ id: "INV2-CCCC" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "INV2-CCCC", status: "SENT", amount: { value: "9.74" }, detail: { metadata: {} } });
    await expect(createAndSendInvoice(payload(null), "d3")).rejects.toThrow(
      /recipient_view_url/,
    );
  });
});

describe("createAndSendInvoice partial failures", () => {
  it("attaches the invoice id when send fails after create", async () => {
    mockFetch
      .mockResolvedValueOnce({ id: "INV2-PART" })
      .mockRejectedValueOnce(new Error("send blew up"));
    const error = await createAndSendInvoice(payload(null), "d-p").catch((e) => e);
    expect(error).toBeInstanceOf(PartialInvoiceError);
    expect(error).toMatchObject({ invoiceId: "INV2-PART", step: "send" });
  });

  it("reports step read when the GET fails or lacks a pay link", async () => {
    mockFetch
      .mockResolvedValueOnce({ id: "INV2-RD" })
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("get failed"));
    expect(await createAndSendInvoice(payload(null), "d-r").catch((e) => e)).toMatchObject({
      invoiceId: "INV2-RD",
      step: "read",
    });
  });

  it("does not wrap a failure of the create call itself", async () => {
    mockFetch.mockRejectedValueOnce(new Error("create failed"));
    const error = await createAndSendInvoice(payload(null), "d-c").catch((e) => e);
    expect(error).not.toBeInstanceOf(PartialInvoiceError);
  });
});

describe("generateQr", () => {
  it("posts the QR request and returns a bare base64 string", async () => {
    mockFetch.mockResolvedValueOnce("iVBORw0KGgo=" as never);
    const qr = await generateQr("INV2-AAAA", "qr-req-1");
    expect(qr).toBe("iVBORw0KGgo=");
    expect(mockFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/v2/invoicing/invoices/INV2-AAAA/generate-qr-code",
      body: { width: 400, height: 400, action: "pay" },
      requestId: "qr-req-1",
      fetchImpl: expect.any(Function),
      accept: "*/*",
    });
  });

  it("passes a fetch that makes a bare (non-JSON) base64 body parseable", async () => {
    mockFetch.mockResolvedValueOnce("x" as never);
    await generateQr("INV2-AAAA", "qr-req-1");
    const { fetchImpl } = mockFetch.mock.calls[0]![0];

    vi.stubGlobal("fetch", async () => new Response("iVBORw0KGgo=", { status: 200 }));
    try {
      const bare = await fetchImpl!("https://x.test/qr");
      expect(JSON.parse(await bare.text())).toBe("iVBORw0KGgo=");

      vi.stubGlobal("fetch", async () => new Response('{"a":1}', { status: 200 }));
      const json = await fetchImpl!("https://x.test/other");
      expect(JSON.parse(await json.text())).toEqual({ a: 1 });

      vi.stubGlobal("fetch", async () => new Response("nope", { status: 400 }));
      const failed = await fetchImpl!("https://x.test/qr");
      expect(failed.status).toBe(400);
      expect(await failed.text()).toBe("nope");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("extracts the image part from PayPal's real multipart response", async () => {
    const fixture = readFileSync("tests/fixtures/paypal-qr-multipart.txt", "utf8");
    // Emulate paypalFetch: run the supplied fetch, then JSON-parse the body.
    mockFetch.mockImplementationOnce((async (opts: { fetchImpl?: typeof fetch }) => {
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(fixture, {
            status: 200,
            headers: { "content-type": "multipart/form-data; boundary=1714443c" },
          }),
      );
      try {
        const res = await opts.fetchImpl!("https://x.test/qr");
        return JSON.parse(await res.text());
      } finally {
        vi.unstubAllGlobals();
      }
    }) as never);
    const qr = await generateQr("INV2-AAAA", "qr-req-1");
    expect(qr.startsWith("iVBORw0KGgo")).toBe(true);
    expect(qr).not.toContain("--");
    expect(qr).not.toContain("Content-");
    expect(qr).not.toMatch(/\s/);
  });

  it("throws when nothing parses", async () => {
    mockFetch.mockResolvedValueOnce('""' as never);
    await expect(generateQr("INV2-AAAA", "q")).rejects.toThrow(/invalid QR response/);
  });

  it("returns bare and JSON-quoted base64", async () => {
    mockFetch.mockResolvedValueOnce("iVBORw0KGgo=" as never);
    expect(await generateQr("INV2-AAAA", "q")).toBe("iVBORw0KGgo=");
    mockFetch.mockResolvedValueOnce('"iVBORw0KGgo="' as never);
    expect(await generateQr("INV2-AAAA", "q")).toBe("iVBORw0KGgo=");
  });

  it("rejects a multipart body without an image part", async () => {
    const other = [
      "--b",
      'Content-Disposition: form-data; name="other"',
      "Content-Type: text/plain",
      "",
      "iVBORw0KGgo=",
      "--b--",
    ].join("\r\n");
    mockFetch.mockResolvedValueOnce(other as never);
    const error = await generateQr("INV2-AAAA", "q").catch((e) => e);
    expect(error).toBeInstanceOf(PayPalError);
    expect(error).toMatchObject({ status: 0, message: "invalid QR response" });
  });

  it("strips surrounding quotes and whitespace", async () => {
    mockFetch.mockResolvedValueOnce('"iVBORw0KGgo="\n' as never);
    expect(await generateQr("INV2-AAAA", "qr-req-1")).toBe("iVBORw0KGgo=");
  });
});

describe("recordCashPayment", () => {
  it("posts a CASH payment with the amount", async () => {
    mockFetch.mockResolvedValueOnce({ payment_id: "PAY-1" } as never);
    await recordCashPayment("INV2-AAAA", 1450, "cash-1");
    expect(mockFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/v2/invoicing/invoices/INV2-AAAA/payments",
      body: { method: "CASH", amount: { currency_code: "USD", value: "14.50" } },
      requestId: "cash-1",
    });
  });
});

describe("getInvoiceStatus", () => {
  it("returns the status string", async () => {
    mockFetch.mockResolvedValueOnce({ id: "INV2-AAAA", status: "PAID" });
    expect(await getInvoiceStatus("INV2-AAAA")).toBe("PAID");
    expect(mockFetch).toHaveBeenCalledWith({
      method: "GET",
      path: "/v2/invoicing/invoices/INV2-AAAA",
    });
  });
});
