import { z } from "zod";
import type { Db } from "@/db";
import { listCatalog } from "@/lib/catalog";
import { LANGUAGES } from "@/lib/parse/schema";
import { parseSale } from "@/lib/parse/parseSale";
import { PayPalError } from "@/lib/paypal/client";
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
    return await (deps.parse ?? parseSale)({ transcript, language, catalog });
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

export async function saleStatus(
  db: Db,
  saleId: string,
): Promise<{ status: string; totalCents: number } | undefined> {
  const sale = await getSale(db, saleId);
  return sale && { status: sale.status, totalCents: sale.totalCents };
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

/** Maps expected failures to API responses; anything else is rethrown (500). */
export function toResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: "invalid_request", issues: error.issues },
      { status: 400 },
    );
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
