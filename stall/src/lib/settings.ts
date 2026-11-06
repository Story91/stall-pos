import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, Payee } from "@/db";
import { businesses, payees } from "@/db/schema";
import { businessDate } from "@/lib/dates";
import { ApiError } from "@/lib/apiError";
import { getBusiness } from "@/lib/sales";

export type BusinessView = {
  name: string;
  taxRate: number;
  currency: string;
  tz: string;
  /** Today's business date in the business timezone, so screens never trust the phone's clock. */
  today: string;
};

export async function businessView(db: Db, now = new Date()): Promise<BusinessView> {
  const business = await getBusiness(db);
  return {
    name: business.name,
    taxRate: Number(business.taxRate),
    currency: business.currency,
    tz: business.tz,
    today: businessDate(now, business.tz),
  };
}

export const businessPatch = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    // A fraction: 0.0825 is 8.25%. The column keeps six decimals.
    taxRate: z.number().min(0).max(0.25).optional(),
  })
  .refine((v) => v.name !== undefined || v.taxRate !== undefined, "Nothing to change");

export async function updateBusiness(db: Db, body: unknown): Promise<BusinessView> {
  const patch = businessPatch.parse(body);
  const business = await getBusiness(db);
  await db
    .update(businesses)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.taxRate !== undefined ? { taxRate: patch.taxRate.toFixed(6) } : {}),
    })
    .where(eq(businesses.id, business.id));
  return businessView(db);
}

export async function listPayees(db: Db, businessId: string): Promise<Payee[]> {
  return db.select().from(payees).where(eq(payees.businessId, businessId)).orderBy(asc(payees.name));
}

/** Ceiling for any one person in a day: the business's own daily payout cap ($1,000). */
export const MAX_PAYEE_DAY_CENTS = 100_000;

const cents = z.number().int().min(0).max(MAX_PAYEE_DAY_CENTS);

/** What the owner may change for a person or supplier. Name and PayPal email stay as set up. */
export const payeePatch = z
  .object({
    dailyRateCents: cents.positive().nullable().optional(),
    maxPerDayCents: cents.optional(),
    autoPay: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

/** Updates one payee of this business. A day rate above the daily limit is refused: it could never be paid. */
export async function updatePayee(db: Db, payeeId: string, body: unknown): Promise<Payee> {
  const patch = payeePatch.parse(body);
  const business = await getBusiness(db);
  const where = and(eq(payees.id, payeeId), eq(payees.businessId, business.id));
  const [current] = z.string().uuid().safeParse(payeeId).success
    ? await db.select().from(payees).where(where)
    : [];
  if (!current) throw new ApiError(404, "not_found");
  if (patch.dailyRateCents !== undefined && patch.dailyRateCents !== null && current.role !== "helper") {
    throw new ApiError(400, "invalid_request");
  }
  const rate = patch.dailyRateCents === undefined ? current.dailyRateCents : patch.dailyRateCents;
  const max = patch.maxPerDayCents ?? current.maxPerDayCents;
  if (rate !== null && rate > max) throw new ApiError(400, "rate_over_limit");
  const [row] = await db
    .update(payees)
    .set({
      ...(patch.dailyRateCents !== undefined ? { dailyRateCents: patch.dailyRateCents } : {}),
      ...(patch.maxPerDayCents !== undefined ? { maxPerDayCents: patch.maxPerDayCents } : {}),
      ...(patch.autoPay !== undefined ? { autoPay: patch.autoPay } : {}),
    })
    .where(where)
    .returning();
  return row!;
}
