import { asc, eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { payees } from "@/db/schema";
import { ApiError } from "@/lib/apiError";
import { runClose, type RunCloseDeps } from "@/lib/close/runClose";
import { businessDate } from "@/lib/dates";
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
export const closeBody = z.object({ date: isoDate.optional() });
export const decisionBody = z.object({ action: z.enum(["approve", "decline", "mark_paid"]) });

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
  deps: { createPayout: typeof createPayout } & Pick<RunCloseDeps, "model" | "now">,
  body: unknown,
) {
  const input = closeBody.parse(body);
  const business = await getBusiness(db);
  const date = input.date ?? businessDate(deps.now ?? new Date(), business.tz);
  return runClose(db, deps, { businessId: business.id, date });
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
  const { action } = decisionBody.parse(body);
  const result = await resolveDecision(db, deps, decisionId, action as DecisionAction);
  if (!result.ok) {
    throw new ApiError(
      FAILURE_STATUS[result.error] ?? 409,
      result.error,
      result.debugId ? { debugId: result.debugId } : {},
    );
  }
  return { decision: result.decision, payout: result.payout ?? null };
}
