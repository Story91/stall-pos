import { randomInt } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Business, Db, Sale } from "@/db";
import { businesses, sales } from "@/db/schema";
import { recordSightings } from "@/lib/catalog";
import { businessDate } from "@/lib/dates";
import { computeTotals, type Line } from "@/lib/money";
import type { Language } from "@/lib/parse/schema";
import { buildInvoicePayload } from "@/lib/paypal/invoices";

export type TipPct = 0 | 15 | 18 | 20 | null;

export type SaleInvoices = {
  createAndSendInvoice(
    payload: ReturnType<typeof buildInvoicePayload>,
    requestId: string,
  ): Promise<{ invoiceId: string; payLink: string }>;
  generateQr(invoiceId: string): Promise<string>;
};

/** A confirmed line; `catalogItemId` links it to a catalog row for learning. */
export type SaleLine = Line & { catalogItemId?: string };

export type ChargeResult = {
  saleId: string;
  qrPng: string;
  payLink: string;
  totalCents: number;
};

/** Single-tenant: the current business is the first row. */
export async function getBusiness(db: Db): Promise<Business> {
  const [business] = await db
    .select()
    .from(businesses)
    .orderBy(asc(businesses.createdAt), asc(businesses.id))
    .limit(1);
  if (!business) throw new Error("No business is set up; run the seed");
  return business;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSale(db: Db, saleId: string): Promise<Sale | undefined> {
  // A non-UUID id can never match; skip the query instead of a Postgres cast error.
  if (!UUID.test(saleId)) return undefined;
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId));
  return sale;
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function invoiceNumber(date: string): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += BASE36[randomInt(BASE36.length)];
  return `STALL-${date.replaceAll("-", "")}-${suffix}`;
}

function storedResult(sale: Sale): ChargeResult {
  if (!sale.qrPng || !sale.payLink) {
    throw new Error(`Sale ${sale.id} exists but has no invoice yet`);
  }
  return {
    saleId: sale.id,
    qrPng: sale.qrPng,
    payLink: sale.payLink,
    totalCents: sale.totalCents,
  };
}

/**
 * Turns confirmed lines into a PayPal invoice + QR. Idempotent on `draftId`.
 *
 * The draft row and the PayPal calls share one transaction: a concurrent
 * duplicate blocks on the unique `draft_id` index until the first commits, then
 * sees a conflict and returns the stored result. If PayPal fails, the draft
 * rolls back, so a retry starts clean (PayPal's own request id dedupes too).
 */
export async function chargeSale(
  db: Db,
  deps: { invoices: SaleInvoices; now?: Date },
  input: {
    businessId: string;
    draftId: string;
    lines: SaleLine[];
    tipPct: TipPct;
    language: Language;
    transcript: string;
  },
): Promise<ChargeResult> {
  const now = deps.now ?? new Date();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, input.businessId));
  if (!business) throw new Error(`Unknown business ${input.businessId}`);

  const taxRate = Number(business.taxRate);
  // Strip catalogItemId: it is only for learning, not part of the stored sale.
  const lines: Line[] = input.lines.map(
    ({ name, qty, unitCents, taxable }) => ({ name, qty, unitCents, taxable }),
  );
  const totals = computeTotals(lines, taxRate, input.tipPct);

  const { result, created } = await db.transaction(async (tx) => {
    const [draft] = await tx
      .insert(sales)
      .values({
        businessId: input.businessId,
        draftId: input.draftId,
        status: "draft",
        lines,
        ...totals,
        language: input.language,
        transcript: input.transcript,
      })
      .onConflictDoNothing({ target: sales.draftId })
      .returning({ id: sales.id });

    if (!draft) {
      const [existing] = await tx
        .select()
        .from(sales)
        .where(eq(sales.draftId, input.draftId));
      return { result: storedResult(existing!), created: false };
    }

    const number = invoiceNumber(businessDate(now, business.tz));
    const payload = buildInvoicePayload({
      invoiceNumber: number,
      lines,
      totals,
      taxRate,
      businessName: business.name,
    });
    const { invoiceId, payLink } = await deps.invoices.createAndSendInvoice(
      payload,
      input.draftId,
    );
    const qrPng = await deps.invoices.generateQr(invoiceId);

    await tx
      .update(sales)
      .set({
        status: "awaiting",
        invoiceId,
        invoiceNumber: number,
        qrPng,
        payLink,
      })
      .where(eq(sales.id, draft.id));

    return {
      result: { saleId: draft.id, qrPng, payLink, totalCents: totals.totalCents },
      created: true,
    };
  });

  // Learning is best-effort: the invoice already exists, so a catalog hiccup
  // must not fail the sale (a retry would not re-learn, being idempotent).
  if (created) {
    try {
      await recordSightings(
        db,
        input.businessId,
        input.lines.map(({ name, unitCents, catalogItemId }) => ({
          name,
          unitCents,
          catalogItemId,
        })),
      );
    } catch (error) {
      console.error("recordSightings failed", error);
    }
  }

  return result;
}

/**
 * Race-safe: the conditional UPDATE only matches an unpaid sale, so exactly one
 * of two concurrent callers gets 'marked'.
 */
export async function markPaid(
  db: Db,
  saleId: string,
  method: "paypal" | "cash",
  paidAt: Date,
): Promise<"marked" | "already_paid"> {
  const updated = await db
    .update(sales)
    .set({ status: method === "cash" ? "paid_cash" : "paid", paidAt })
    .where(and(eq(sales.id, saleId), inArray(sales.status, ["draft", "awaiting"])))
    .returning({ id: sales.id });
  return updated.length > 0 ? "marked" : "already_paid";
}
