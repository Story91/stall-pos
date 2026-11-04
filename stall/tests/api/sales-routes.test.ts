import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { seed } from "@/db/seed";
import { PayPalError } from "@/lib/paypal/client";

// Route handlers are plain functions; hand them the PGlite db and fake PayPal.
const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_t, prop) => Reflect.get(holder.db as object, prop) },
  ),
}));

const paypal = vi.hoisted(() => ({
  createAndSendInvoice: vi.fn(),
  generateQr: vi.fn(),
  recordCashPayment: vi.fn(),
}));
// Keep the real buildInvoicePayload; fake only the PayPal network calls.
vi.mock("@/lib/paypal/invoices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paypal/invoices")>()),
  ...paypal,
}));

const parser = vi.hoisted(() => ({ parseSale: vi.fn() }));
vi.mock("@/lib/parse/parseSale", () => parser);

import { POST as createRoute } from "@/app/api/sales/route";
import { GET as statusRoute } from "@/app/api/sales/[id]/route";
import { POST as cashRoute } from "@/app/api/sales/[id]/cash/route";
import { POST as parseRoute } from "@/app/api/sales/parse/route";
import { ownerCookieValue } from "@/lib/auth";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// The sales routes require the owner cookie, like every other owner route.
const owner = () => ({ Cookie: `stall_owner=${ownerCookieValue()}` });

function post(url: string, body: unknown, signedIn = true): Request {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signedIn ? owner() : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const get = (url: string, signedIn = true) =>
  new Request(`http://localhost${url}`, { headers: signedIn ? owner() : {} });

const sale = (draftId: string) => ({
  draftId,
  lines: [
    { name: "Tacos", qty: 2, unitCents: 450, taxable: true },
    { name: "Horchata", qty: 1, unitCents: 300, taxable: false },
  ],
  tipPct: 18,
  language: "en",
  transcript: "two tacos and a horchata",
});

describe("sell API routes", () => {
  let close: () => Promise<void>;

  beforeAll(async () => {
    const test = await createTestDb();
    holder.db = test.db;
    close = test.close;
    await seed(test.db);
    vi.stubEnv("PAYPAL_CLIENT_ID", "test-client-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/stall");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OWNER_PIN", "1234");
    vi.stubEnv("CLOSE_TRIGGER_KEY", "close-key-for-tests");
  }, 60_000);

  it("rejects every sales route without the owner cookie", async () => {
    expect((await createRoute(post("/api/sales", sale("anon"), false))).status).toBe(401);
    expect((await statusRoute(get("/api/sales/x", false), ctx("x"))).status).toBe(401);
    expect((await cashRoute(post("/x", {}, false), ctx("x"))).status).toBe(401);
    expect((await parseRoute(post("/api/sales/parse", {}, false))).status).toBe(401);
    expect(paypal.createAndSendInvoice).not.toHaveBeenCalled();
  });

  afterAll(async () => {
    await close();
  });

  it("charge -> status -> cash -> second cash is 409, end to end", async () => {
    paypal.createAndSendInvoice.mockResolvedValue({
      invoiceId: "INV2-ROUTE",
      payLink: "https://paypal.test/pay",
    });
    paypal.generateQr.mockResolvedValue("QRBASE64");
    paypal.recordCashPayment.mockResolvedValue(undefined);

    const created = await createRoute(post("/api/sales", sale("route-1")));
    expect(created.status).toBe(200);
    const charge = (await created.json()) as {
      saleId: string;
      qrPng: string;
      payLink: string;
      totalCents: number;
    };
    // 1200 + 74 tax + 216 tip
    expect(charge).toMatchObject({
      qrPng: "QRBASE64",
      payLink: "https://paypal.test/pay",
      totalCents: 1490,
    });

    // Double tap: same draftId -> same sale, one invoice.
    const again = await createRoute(post("/api/sales", sale("route-1")));
    expect(((await again.json()) as { saleId: string }).saleId).toBe(charge.saleId);
    expect(paypal.createAndSendInvoice).toHaveBeenCalledTimes(1);

    const status = await statusRoute(
      get("/api/sales/x"),
      ctx(charge.saleId),
    );
    expect(await status.json()).toEqual({ status: "awaiting", totalCents: 1490 });

    const cash = await cashRoute(post("/x", {}), ctx(charge.saleId));
    expect(cash.status).toBe(200);
    expect(await cash.json()).toEqual({ status: "paid_cash" });
    expect(paypal.recordCashPayment).toHaveBeenCalledWith(
      "INV2-ROUTE",
      1490,
      "route-1-cash",
    );

    const second = await cashRoute(post("/x", {}), ctx(charge.saleId));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "already_paid" });
    expect(paypal.recordCashPayment).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown or malformed sale id", async () => {
    const req = get("/api/sales/x");
    expect((await statusRoute(req, ctx("00000000-0000-0000-0000-000000000000"))).status).toBe(404);
    expect((await statusRoute(req, ctx("junk"))).status).toBe(404);
    expect((await cashRoute(post("/x", {}), ctx("junk"))).status).toBe(404);
  });

  it("returns 400 for an invalid or malformed body", async () => {
    const bad = await createRoute(post("/api/sales", { ...sale("route-bad"), lines: [] }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_request");
    expect((await createRoute(post("/api/sales", "{not json"))).status).toBe(400);
    expect((await parseRoute(post("/api/sales/parse", { language: "en" }))).status).toBe(400);
  });

  it("maps a PayPal failure to 502 with the debug id", async () => {
    paypal.createAndSendInvoice.mockRejectedValueOnce(
      new PayPalError("bad", 422, "{}", "debug-77"),
    );
    const res = await createRoute(post("/api/sales", sale("route-502")));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "paypal", status: 422, debugId: "debug-77" });
  });

  it("parse route returns the parsed sale, or 422 when the parser fails", async () => {
    const parsed = { items: [], spokenConfirmation: "ok", language: "en" };
    parser.parseSale.mockResolvedValueOnce(parsed);
    const ok = await parseRoute(
      post("/api/sales/parse", { transcript: "two tacos", language: "en" }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(parsed);
    const arg = parser.parseSale.mock.calls[0]![0] as { catalog: unknown[] };
    expect(arg.catalog.length).toBeGreaterThan(0);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    parser.parseSale.mockRejectedValueOnce(new Error("model down"));
    const failed = await parseRoute(
      post("/api/sales/parse", { transcript: "two tacos", language: "en" }),
    );
    spy.mockRestore();
    expect(failed.status).toBe(422);
    expect(await failed.json()).toEqual({ error: "parse_failed" });
  });
});
