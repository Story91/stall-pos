import { and, asc, eq, gte, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Bill, Db, Decision, Payee, Payout, Sale, Shift } from "@/db";
import { agentRuns, bills, decisions, payees, payouts, sales, shifts } from "@/db/schema";
import { ApiError } from "@/lib/apiError";
import { businessDate } from "@/lib/dates";

export const MAX_BILL_CENTS = 500_000;

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
  }, "Not a real date");

const billInput = z.object({
  payeeId: z.uuid(),
  amountCents: z.number().int().positive().max(MAX_BILL_CENTS),
  note: z.string().trim().min(1).max(140),
  date: isoDate,
  photoUrl: z.string().url().max(2048).optional(),
});
export type BillInput = z.input<typeof billInput>;

async function requirePayee(db: Db, businessId: string, payeeId: string): Promise<Payee> {
  const [payee] = await db
    .select()
    .from(payees)
    .where(and(eq(payees.id, payeeId), eq(payees.businessId, businessId)));
  if (!payee) throw new ApiError(404, "payee_not_found");
  return payee;
}

/** Records that a payee worked on `date`. Idempotent: returns the existing row on a repeat. */
export async function logShift(
  db: Db,
  businessId: string,
  payeeId: string,
  date: string,
): Promise<Shift> {
  await requirePayee(db, businessId, payeeId);
  const [created] = await db
    .insert(shifts)
    .values({ businessId, payeeId, date })
    .onConflictDoNothing({ target: [shifts.payeeId, shifts.date] })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.payeeId, payeeId), eq(shifts.date, date)));
  return existing!;
}

export async function logBill(db: Db, businessId: string, input: BillInput): Promise<Bill> {
  const bill = billInput.parse(input);
  await requirePayee(db, businessId, bill.payeeId);
  const [row] = await db
    .insert(bills)
    .values({ businessId, ...bill, photoUrl: bill.photoUrl ?? null })
    .returning();
  return row!;
}

export type RemoveShiftResult = "removed" | "not_found" | "has_payout" | "has_decision";

/** Undoes a wrongly logged shift, but never one money or an owner decision already points at. */
export async function removeShift(
  db: Db,
  businessId: string,
  payeeId: string,
  date: string,
): Promise<RemoveShiftResult> {
  return db.transaction(async (tx) => {
    const [shift] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.businessId, businessId), eq(shifts.payeeId, payeeId), eq(shifts.date, date)))
      .for("update");
    if (!shift) return "not_found";
    const [payout] = await tx.select({ id: payouts.id }).from(payouts).where(eq(payouts.shiftId, shift.id));
    if (payout) return "has_payout";
    const [decision] = await tx
      .select({ id: decisions.id })
      .from(decisions)
      .where(eq(decisions.shiftId, shift.id));
    if (decision) return "has_decision";
    await tx.delete(shifts).where(eq(shifts.id, shift.id));
    return "removed";
  });
}

// Business dates depend on the timezone: fetch a generous UTC window, then filter exactly.
function dayWindow(date: string): { from: Date; to: Date } {
  const start = Date.parse(`${date}T00:00:00Z`);
  return { from: new Date(start - 36 * 3_600_000), to: new Date(start + 60 * 3_600_000) };
}

export type DayTotals = {
  count: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  cashCents: number;
  paypalCents: number;
};

export type DayView = {
  sales: Omit<Sale, "qrPng">[];
  totals: DayTotals;
  shifts: (Shift & { payee: Payee })[];
  bills: (Bill & { payee: Payee })[];
  payouts: Payout[];
  decisions: Decision[];
};

/** Payouts tied to that day's shifts or bills, or created on that business day. */
async function payoutsForDate(db: Db, businessId: string, date: string, tz: string): Promise<Payout[]> {
  const { from, to } = dayWindow(date);
  const rows = await db
    .select({ payout: payouts, shiftDate: shifts.date, billDate: bills.date })
    .from(payouts)
    .leftJoin(shifts, eq(payouts.shiftId, shifts.id))
    .leftJoin(bills, eq(payouts.billId, bills.id))
    .where(
      and(
        eq(payouts.businessId, businessId),
        or(eq(shifts.date, date), eq(bills.date, date), and(gte(payouts.createdAt, from), lte(payouts.createdAt, to))),
      ),
    )
    .orderBy(asc(payouts.createdAt));
  return rows
    .filter((r) => r.shiftDate === date || r.billDate === date || businessDate(r.payout.createdAt, tz) === date)
    .map((r) => r.payout);
}

async function decisionsForDate(db: Db, businessId: string, date: string): Promise<Decision[]> {
  return db
    .select()
    .from(decisions)
    .where(and(eq(decisions.businessId, businessId), eq(decisions.date, date)))
    .orderBy(asc(decisions.createdAt));
}

export async function getDay(db: Db, businessId: string, date: string, tz = "America/Chicago"): Promise<DayView> {
  const { from, to } = dayWindow(date);
  const saleRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.businessId, businessId), gte(sales.createdAt, from), lte(sales.createdAt, to)))
    .orderBy(asc(sales.createdAt));
  const daySales = saleRows
    .filter((s) => businessDate(s.createdAt, tz) === date)
    .map(({ qrPng, ...rest }) => {
      void qrPng; // the QR image is large and only the sell screen needs it
      return rest;
    });

  const totals: DayTotals = {
    count: 0,
    subtotalCents: 0,
    taxCents: 0,
    tipCents: 0,
    totalCents: 0,
    cashCents: 0,
    paypalCents: 0,
  };
  for (const s of daySales) {
    if (s.status !== "paid" && s.status !== "paid_cash") continue;
    totals.count += 1;
    totals.subtotalCents += s.subtotalCents;
    totals.taxCents += s.taxCents;
    totals.tipCents += s.tipCents;
    totals.totalCents += s.totalCents;
    if (s.status === "paid_cash") totals.cashCents += s.totalCents;
    else totals.paypalCents += s.totalCents;
  }

  const shiftRows = await db
    .select({ shift: shifts, payee: payees })
    .from(shifts)
    .innerJoin(payees, eq(shifts.payeeId, payees.id))
    .where(and(eq(shifts.businessId, businessId), eq(shifts.date, date)))
    .orderBy(asc(shifts.createdAt));
  const billRows = await db
    .select({ bill: bills, payee: payees })
    .from(bills)
    .innerJoin(payees, eq(bills.payeeId, payees.id))
    .where(and(eq(bills.businessId, businessId), eq(bills.date, date)))
    .orderBy(asc(bills.createdAt));

  return {
    sales: daySales,
    totals,
    shifts: shiftRows.map((r) => ({ ...r.shift, payee: r.payee })),
    bills: billRows.map((r) => ({ ...r.bill, payee: r.payee })),
    payouts: await payoutsForDate(db, businessId, date, tz),
    decisions: await decisionsForDate(db, businessId, date),
  };
}

/** What the owner sees for a closed day: the agent's run, what it escalated, what it paid. */
export async function getCloseView(db: Db, businessId: string, date: string, tz = "America/Chicago") {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.businessId, businessId), eq(agentRuns.date, date)));
  return {
    run: run ?? null,
    decisions: await decisionsForDate(db, businessId, date),
    payouts: await payoutsForDate(db, businessId, date, tz),
  };
}
