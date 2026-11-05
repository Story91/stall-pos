import { asc, eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { payees } from "@/db/schema";
import { ApiError } from "@/lib/apiError";
import { runClose, type RunCloseDeps } from "@/lib/close/runClose";
import { businessDate, daysAgo } from "@/lib/dates";
import { reconcileDay, type LedgerPayout, type LedgerSale, type ReconcileReport } from "@/lib/close/reconcile";
import { listTransactions, type PayPalTxn } from "@/lib/paypal/reporting";
import { isMockEnabled } from "@/lib/paypal/mock";
import { resolveDecision, type DecisionAction } from "@/lib/decisions";
import {
  getCloseView,
  getDay,
  isoDate,
  logBill,
  logShift,
  MAX_BILL_CENTS,
  removeShift,
} from "@/lib/obligations";
import { parseObligation } from "@/lib/parse/parseObligation";
import { LANGUAGES } from "@/lib/parse/schema";
import { parseBody, ParseFailedError } from "@/lib/salesApi";
import { getBusiness } from "@/lib/sales";
import type { createPayout } from "@/lib/paypal/payouts";

// Request bodies for the obligation, close and decision routes. Routes only parse
// JSON and delegate; these services take `db` and `deps` so tests inject fakes.

export const shiftBody = z.object({ payeeId: z.uuid(), date: isoDate.optional() });
export const shiftQuery = z.object({ payeeId: z.uuid(), date: isoDate });
export const billBody = z.object({
  payeeId: z.uuid(),
  amountCents: z.number().int().positive().max(MAX_BILL_CENTS),
  note: z.string().trim().min(1).max(140),
  date: isoDate.optional(),
  photoUrl: z.string().url().max(2048).optional(),
});
/** The owner's language words the summary and reasons; absent (the cron ping) means English. */
const ownerLanguage = z.enum(LANGUAGES).default("en");

export const closeBody = z.object({ date: isoDate.optional(), language: ownerLanguage });
export const decisionBody = z.object({
  action: z.enum(["approve", "decline", "mark_paid"]),
  /** The amount the owner was shown; approve refuses if what is owed has changed since. */
  expectedCents: z.number().int().positive().optional(),
  language: ownerLanguage,
});

export function parseDate(value: string): string {
  return isoDate.parse(value);
}

/** Like `readJson`, but an empty body (the scheduler ping) counts as `{}`. */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new z.ZodError([
      { code: "custom", path: [], message: "Body must be valid JSON", input: undefined },
    ]);
  }
}

export async function postShift(db: Db, body: unknown, now = new Date()) {
  const input = shiftBody.parse(body);
  const business = await getBusiness(db);
  const date = input.date ?? businessDate(now, business.tz);
  return logShift(db, business.id, input.payeeId, date);
}

export async function deleteShift(db: Db, query: unknown): Promise<{ removed: true }> {
  const input = shiftQuery.parse(query);
  const business = await getBusiness(db);
  const result = await removeShift(db, business.id, input.payeeId, input.date);
  if (result === "not_found") throw new ApiError(404, "not_found");
  if (result !== "removed") throw new ApiError(409, result);
  return { removed: true };
}

export async function postBill(db: Db, body: unknown, now = new Date()) {
  const input = billBody.parse(body);
  const business = await getBusiness(db);
  const bill = await logBill(db, business.id, {
    ...input,
    date: input.date ?? businessDate(now, business.tz),
  });
  return bill;
}

export async function parseObligationText(
  db: Db,
  body: unknown,
  deps: { parse?: typeof parseObligation } = {},
) {
  const { transcript, language } = parseBody.parse(body);
  const business = await getBusiness(db);
  const people = await db
    .select({ id: payees.id, name: payees.name })
    .from(payees)
    .where(and(eq(payees.businessId, business.id), eq(payees.enabled, true)))
    .orderBy(asc(payees.name));
  try {
    return await (deps.parse ?? parseObligation)({ transcript, language, payees: people });
  } catch (error) {
    throw new ParseFailedError(error);
  }
}

export async function closeDay(
  db: Db,
  deps: { createPayout: typeof createPayout } & Pick<RunCloseDeps, "model" | "now" | "invoices">,
  body: unknown,
) {
  const input = closeBody.parse(body);
  const business = await getBusiness(db);
  const today = businessDate(deps.now ?? new Date(), business.tz);
  const date = input.date ?? today;
  // A future day would see none of today's payouts and so reset the per-day limits.
  if (date > today) throw new ApiError(400, "future_date");
  return runClose(db, deps, { businessId: business.id, date, language: input.language });
}

export async function closeViewFor(db: Db, date: string) {
  const business = await getBusiness(db);
  return getCloseView(db, business.id, parseDate(date), business.tz);
}

export async function dayFor(db: Db, date: string) {
  const business = await getBusiness(db);
  return getDay(db, business.id, parseDate(date), business.tz);
}

const FAILURE_STATUS: Record<string, number> = {
  not_found: 404,
  already_resolved: 409,
  already_paid: 409,
  paypal: 502,
};

export async function decide(
  db: Db,
  deps: { createPayout: typeof createPayout },
  decisionId: string,
  body: unknown,
) {
  const { action, expectedCents, language } = decisionBody.parse(body);
  const result = await resolveDecision(
    db,
    deps,
    decisionId,
    action as DecisionAction,
    expectedCents,
    language,
  );
  if (!result.ok) {
    throw new ApiError(
      FAILURE_STATUS[result.error] ?? 409,
      result.error,
      result.debugId ? { debugId: result.debugId } : {},
    );
  }
  return { decision: result.decision, payout: result.payout ?? null };
}

export type ReconcileResponse =
  | ({ available: true } & ReconcileReport)
  | { available: false; reason: "paypal" | "future" };

/**
 * Checks the day's ledger against PayPal's own Transaction Search. Read-only:
 * nothing is changed on either side. In mock mode PayPal's side mirrors the ledger.
 */
export async function reconcileFor(
  db: Db,
  date: string,
  deps: { listTransactions?: typeof listTransactions; now?: Date } = {},
): Promise<ReconcileResponse> {
  const now = deps.now ?? new Date();
  const business = await getBusiness(db);
  const day = await getDay(db, business.id, parseDate(date), business.tz);
  if (date > businessDate(now, business.tz)) return { available: false, reason: "future" };

  const sales: LedgerSale[] = day.sales
    // Seeded demo history (INV2-SEED-*) never went through PayPal, so it has nothing to match.
    .filter((s) => s.status === "paid" && s.paidAt && !s.invoiceId?.startsWith("INV2-SEED-"))
    .map((s) => ({
      id: s.id,
      invoiceId: s.invoiceId,
      invoiceNumber: s.invoiceNumber,
      totalCents: s.totalCents,
      paidAt: new Date(s.paidAt!).toISOString(),
    }));
  const ledgerPayouts: LedgerPayout[] = day.payouts.map((p) => ({
    id: p.id,
    label: p.payeeName ?? "",
    amountCents: p.amountCents,
    status: p.status,
    createdAt: new Date(p.createdAt).toISOString(),
  }));

  // A day in the business timezone sits inside [date-1 00:00Z, date+2 00:00Z]; the report trims to the day.
  const start = new Date(`${daysAgo(date, 1)}T00:00:00Z`);
  const end = new Date(Math.min(now.getTime(), new Date(`${date}T00:00:00Z`).getTime() + 2 * 86_400_000));
  let txns: PayPalTxn[];
  const lookup = deps.listTransactions ?? (isMockEnabled("PAYPAL_MOCK") ? undefined : listTransactions);
  if (!lookup) {
    txns = [
      ...sales.map((s) => ({ id: `mock-${s.id}`, at: s.paidAt, cents: s.totalCents, currency: "USD", status: "S", invoiceId: s.invoiceNumber, code: "T0011" })),
      ...ledgerPayouts
        .filter((p) => p.status === "SUCCESS" || p.status === "UNCLAIMED")
        .map((p) => ({ id: `mock-${p.id}`, at: p.createdAt, cents: -p.amountCents, currency: "USD", status: "S", invoiceId: null, code: "T0000" })),
    ];
  } else {
    try {
      txns = await lookup(start, end);
    } catch (error) {
      console.error("reconcile: transaction search failed", error instanceof Error ? error.message : error);
      return { available: false, reason: "paypal" };
    }
  }
  return { available: true, ...reconcileDay({ date, tz: business.tz, sales, payouts: ledgerPayouts, txns, now }) };
}
