import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { sales } from "@/db/schema";
import { businessDate } from "@/lib/dates";
import { listCatalog } from "@/lib/catalog";
import { ApiError } from "@/lib/apiError";
import { LANGUAGES } from "@/lib/parse/schema";
import { parseSale } from "@/lib/parse/parseSale";
import { emit } from "@/lib/events";
import { PayPalError } from "@/lib/paypal/client";
import {
  createAndSendInvoice,
  generateQr,
  getInvoiceStatus,
  cancelInvoice,
  recordCashPayment,
  recordCashRefund,
} from "@/lib/paypal/invoices";
import {
  isMockEnabled,
  mockInvoices,
  mockParseSale,
  mockCancelInvoice,
  mockRecordCashPayment,
  mockRecordCashRefund,
} from "@/lib/paypal/mock";
import {
  chargeSale,
  getBusiness,
  getSale,
  markPaid,
  type ChargeResult,
  type SaleInvoices,
} from "@/lib/sales";

// Request bodies. Routes only parse JSON and delegate; the services below take
// `db` and `deps` so tests can inject PGlite and fakes.

const language = z.enum(LANGUAGES);

export const parseBody = z.object({
  transcript: z.string().trim().min(1).max(2000),
  language,
});

export const createSaleBody = z.object({
  draftId: z.string().min(1).max(100),
  lines: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        qty: z.number().int().positive().max(999),
        unitCents: z.number().int().positive().max(1_000_000),
        taxable: z.boolean(),
        catalogItemId: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(50),
  tipPct: z.union([
    z.literal(0),
    z.literal(15),
    z.literal(18),
    z.literal(20),
    z.null(),
  ]),
  language,
  transcript: z.string().max(2000),
});

type Env = Record<string, string | undefined>;

/**
 * PayPal functions the sell routes use. PAYPAL_MOCK=1 swaps in offline fakes
 * (never in production); everything else talks to the sandbox.
 */
export function invoiceDeps(env: Env = process.env): {
  invoices: SaleInvoices;
  recordCashPayment: typeof recordCashPayment;
} {
  return isMockEnabled("PAYPAL_MOCK", env)
    ? { invoices: mockInvoices, recordCashPayment: mockRecordCashPayment }
    : { invoices: { createAndSendInvoice, generateQr }, recordCashPayment };
}

/** The sale parser: the model, or the fixed smoke-test parser with PARSE_MOCK=1 (never in production). */
export function parseDep(env: Env = process.env): typeof parseSale {
  return isMockEnabled("PARSE_MOCK", env) ? mockParseSale : parseSale;
}

export class ParseFailedError extends Error {
  constructor(cause: unknown) {
    super("The transcript could not be parsed", { cause });
    this.name = "ParseFailedError";
  }
}

export async function parseTranscript(
  db: Db,
  body: unknown,
  deps: { parse?: typeof parseSale } = {},
) {
  const { transcript, language } = parseBody.parse(body);
  const business = await getBusiness(db);
  const catalog = await listCatalog(db, business.id);
  try {
    return await (deps.parse ?? parseDep())({ transcript, language, catalog });
  } catch (error) {
    throw new ParseFailedError(error);
  }
}

export async function createSale(
  db: Db,
  deps: { invoices: SaleInvoices; now?: Date },
  body: unknown,
): Promise<ChargeResult> {
  const input = createSaleBody.parse(body);
  const business = await getBusiness(db);
  return chargeSale(db, deps, { ...input, businessId: business.id });
}

// Polling fallback for when no PayPal webhook is registered: at most one invoice
// lookup per sale every RECONCILE_INTERVAL_MS.
const RECONCILE_INTERVAL_MS = 3000;
const lastChecked = new Map<string, number>();

export function resetReconcileThrottle(): void {
  lastChecked.clear();
}

export async function saleStatus(
  db: Db,
  saleId: string,
  deps: {
    getInvoiceStatus?: (invoiceId: string) => Promise<string>;
    nowMs?: () => number;
  } = {},
): Promise<{ status: string; totalCents: number } | undefined> {
  let sale = await getSale(db, saleId);
  if (!sale) return undefined;

  const lookup =
    deps.getInvoiceStatus ?? (isMockEnabled("PAYPAL_MOCK") ? undefined : getInvoiceStatus);
  if (lookup && sale.status === "awaiting" && sale.invoiceId) {
    const nowMs = (deps.nowMs ?? Date.now)();
    const last = lastChecked.get(sale.id);
    if (last === undefined || nowMs - last >= RECONCILE_INTERVAL_MS) {
      lastChecked.set(sale.id, nowMs);
      try {
        const status = await lookup(sale.invoiceId);
        if (status === "PAID" || status === "MARKED_AS_PAID") {
          if ((await markPaid(db, sale.id, "paypal", new Date())) === "marked") {
            emit({ type: "sale.paid", saleId: sale.id });
          }
          sale = (await getSale(db, saleId)) ?? sale;
        }
      } catch (error) {
        // Reconciliation is best effort; the stored status is still correct.
        const reason = error instanceof PayPalError ? `status ${error.status}` : "error";
        console.error(`stall: invoice status check failed for sale ${sale.id} (${reason})`);
      }
    }
  }
  return { status: sale.status, totalCents: sale.totalCents };
}

export type CashResult =
  | { kind: "paid"; status: "paid_cash" }
  | { kind: "not_found" }
  | { kind: "already_paid" }
  | { kind: "not_payable" };

/**
 * Cash payment: record it on the PayPal invoice, then mark the sale. A sale
 * that is already paid is rejected before PayPal is called.
 */
export async function payCash(
  db: Db,
  deps: {
    recordCashPayment: (
      invoiceId: string,
      cents: number,
      requestId: string,
    ) => Promise<void>;
    now?: Date;
  },
  saleId: string,
): Promise<CashResult> {
  const sale = await getSale(db, saleId);
  if (!sale) return { kind: "not_found" };
  if (sale.status === "paid" || sale.status === "paid_cash") {
    return { kind: "already_paid" };
  }
  if (sale.status !== "awaiting" || !sale.invoiceId) {
    return { kind: "not_payable" };
  }

  await deps.recordCashPayment(sale.invoiceId, sale.totalCents, `${sale.draftId}-cash`);
  const marked = await markPaid(db, sale.id, "cash", deps.now ?? new Date());
  return marked === "marked"
    ? { kind: "paid", status: "paid_cash" }
    : { kind: "already_paid" };
}

export type VoidDeps = {
  cancelInvoice: (invoiceId: string, requestId: string) => Promise<void>;
  recordCashRefund: (invoiceId: string, cents: number, requestId: string) => Promise<void>;
};

/** PayPal calls for cancelling a sale; offline fakes with PAYPAL_MOCK=1 (never in production). */
export function voidDeps(env: Env = process.env): VoidDeps {
  return isMockEnabled("PAYPAL_MOCK", env)
    ? { cancelInvoice: mockCancelInvoice, recordCashRefund: mockRecordCashRefund }
    : { cancelInvoice, recordCashRefund };
}

export type VoidResult =
  | { kind: "cancelled"; was: "awaiting" | "paid_cash" | "draft" }
  | { kind: "not_found" }
  | { kind: "already_cancelled" }
  /** Paid through PayPal: the money is in the owner's account; refund it from PayPal. */
  | { kind: "paid_paypal" }
  /** It changed (for example, got paid) while we were cancelling it. */
  | { kind: "changed" };

/**
 * Cancels a sale. Unpaid: the PayPal invoice is cancelled so it can't be paid.
 * Paid in cash: a cash refund is recorded on the invoice. Paid through PayPal:
 * refused; the owner refunds it in PayPal. PayPal first, then our row, with a
 * conditional update so a sale paid in the meantime is never marked cancelled.
 */
export async function voidSale(db: Db, deps: VoidDeps, saleId: string): Promise<VoidResult> {
  const sale = await getSale(db, saleId);
  if (!sale) return { kind: "not_found" };
  if (sale.status === "cancelled") return { kind: "already_cancelled" };
  if (sale.status === "paid") return { kind: "paid_paypal" };

  const was = sale.status;
  if (sale.invoiceId) {
    if (was === "awaiting") await deps.cancelInvoice(sale.invoiceId, `${sale.draftId}-cancel`);
    if (was === "paid_cash") await deps.recordCashRefund(sale.invoiceId, sale.totalCents, `${sale.draftId}-refund`);
  }
  const updated = await db
    .update(sales)
    .set({ status: "cancelled" })
    .where(and(eq(sales.id, sale.id), eq(sales.status, was)))
    .returning({ id: sales.id });
  return updated.length > 0 ? { kind: "cancelled", was } : { kind: "changed" };
}

export type LastSale = {
  saleId: string;
  invoiceNumber: string | null;
  totalCents: number;
  status: "awaiting" | "paid" | "paid_cash";
  items: string;
  createdAt: string;
};

/** The newest charged sale of the business today (what "cancel that sale" means), or null. */
export async function lastSale(db: Db, now = new Date()): Promise<LastSale | null> {
  const business = await getBusiness(db);
  const [row] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.businessId, business.id), inArray(sales.status, ["awaiting", "paid", "paid_cash"])))
    .orderBy(desc(sales.createdAt))
    .limit(1);
  if (!row || businessDate(row.createdAt, business.tz) !== businessDate(now, business.tz)) return null;
  return {
    saleId: row.id,
    invoiceNumber: row.invoiceNumber,
    totalCents: row.totalCents,
    status: row.status as LastSale["status"],
    items: row.lines.map((l) => `${l.qty} ${l.name}`).join(", "),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Maps expected failures to API responses; anything else is rethrown (500). */
export function toResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: "invalid_request", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof ApiError) {
    return Response.json({ error: error.code, ...error.extra }, { status: error.status });
  }
  if (error instanceof ParseFailedError) {
    console.error(error);
    return Response.json({ error: "parse_failed" }, { status: 422 });
  }
  if (error instanceof PayPalError) {
    return Response.json(
      { error: "paypal", status: error.status, debugId: error.debugId },
      { status: 502 },
    );
  }
  throw error;
}

/** Parses a JSON request body; a malformed body becomes a 400 via ZodError. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      { code: "custom", path: [], message: "Body must be valid JSON", input: undefined },
    ]);
  }
}
