import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, Payee } from "@/db";
import { businesses, payees } from "@/db/schema";
import { businessDate } from "@/lib/dates";
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
