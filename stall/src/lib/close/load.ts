import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { bills, businesses, decisions, payees, payouts, sales, shifts } from "@/db/schema";
import { businessDate, daysAgo } from "@/lib/dates";
import type { EvaluateInput, Obligation, PaidBill } from "./rules";

export type CloseData = {
  businessName: string;
  obligations: Obligation[];
  existingPayouts: EvaluateInput["existingPayouts"];
  paidBills: PaidBill[];
  paidTodayByPayee: Record<string, number>;
  sales: { count: number; totalCents: number };
  /** Decisions that already cover an obligation (same day, or still open). */
  decidedIds: Set<string>;
};

const LIVE: ("PENDING" | "SUCCESS")[] = ["PENDING", "SUCCESS"];
const isLive = (status: string) => status === "PENDING" || status === "SUCCESS";

/**
 * Reads everything the rules engine and the agent need for one business day.
 * Per-day limits always count money sent on the current business date (from `now`),
 * whatever date is being closed, so closing another day cannot reset them.
 */
export async function loadCloseData(
  db: Db,
  businessId: string,
  date: string,
  now: Date = new Date(),
): Promise<CloseData> {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!business) throw new Error(`Unknown business ${businessId}`);
  const today = businessDate(now, business.tz);

  const shiftRows = await db
    .select({ id: shifts.id, payee: payees })
    .from(shifts)
    .innerJoin(payees, eq(shifts.payeeId, payees.id))
    .where(and(eq(shifts.businessId, businessId), eq(shifts.date, date)))
    .orderBy(asc(shifts.createdAt));
  // Held bills stay in the set so a later run sees them as already escalated.
  const billRows = await db
    .select({ bill: bills, payee: payees })
    .from(bills)
    .innerJoin(payees, eq(bills.payeeId, payees.id))
    .where(
      and(
        eq(bills.businessId, businessId),
        inArray(bills.status, ["open", "held"]),
        lte(bills.date, date),
      ),
    )
    .orderBy(asc(bills.date), asc(bills.createdAt));

  const decisionRows = await db
    .select({
      shiftId: decisions.shiftId,
      billId: decisions.billId,
      date: decisions.date,
      status: decisions.status,
      createdAt: decisions.createdAt,
    })
    .from(decisions)
    .where(eq(decisions.businessId, businessId));
  // A held bill whose latest decision is settled (approved, declined, marked paid) is out of the owner's queue
  // and out of this run; approve/decline/mark_paid move the bill to paid or declined themselves.
  const latestByBill = new Map<string, { status: string; at: number }>();
  for (const d of decisionRows) {
    if (!d.billId) continue;
    const at = d.createdAt.getTime();
    const seen = latestByBill.get(d.billId);
    if (!seen || at >= seen.at) latestByBill.set(d.billId, { status: d.status, at });
  }
  const loadableBills = billRows.filter((b) => {
    if (b.bill.status !== "held") return true;
    const latest = latestByBill.get(b.bill.id);
    return !latest || latest.status === "open";
  });

  const obligations: Obligation[] = [
    ...shiftRows.map(
      (s): Obligation => ({
        kind: "shift",
        id: s.id,
        payee: s.payee,
        amountCents: s.payee.dailyRateCents ?? 0,
        date,
      }),
    ),
    ...loadableBills.map(
      (b): Obligation => ({
        kind: "bill",
        id: b.bill.id,
        payee: b.payee,
        amountCents: b.bill.amountCents,
        note: b.bill.note,
        date: b.bill.date,
      }),
    ),
  ];

  const shiftIds = shiftRows.map((s) => s.id);
  const billIds = loadableBills.map((b) => b.bill.id);

  const existingPayouts: EvaluateInput["existingPayouts"] = [];
  if (shiftIds.length > 0) {
    const rows = await db.select().from(payouts).where(inArray(payouts.shiftId, shiftIds));
    for (const p of rows) existingPayouts.push({ shiftId: p.shiftId ?? undefined, status: p.status });
  }
  if (billIds.length > 0) {
    const rows = await db.select().from(payouts).where(inArray(payouts.billId, billIds));
    for (const p of rows) existingPayouts.push({ billId: p.billId ?? undefined, status: p.status });
  }

  // Only a live payout is evidence of an earlier payment; a FAILED one paid nothing.
  const paidBillRows = await db
    .select({ bill: bills, batchId: payouts.batchId })
    .from(bills)
    .innerJoin(payouts, eq(payouts.billId, bills.id))
    .where(
      and(
        eq(bills.businessId, businessId),
        eq(bills.status, "paid"),
        inArray(payouts.status, LIVE),
        gte(bills.date, daysAgo(date, 7)),
        lte(bills.date, date),
      ),
    );
  const paidBills: PaidBill[] = paidBillRows.map((r) => ({
    id: r.bill.id,
    payeeId: r.bill.payeeId,
    amountCents: r.bill.amountCents,
    note: r.bill.note,
    date: r.bill.date,
    payoutBatchId: r.batchId,
  }));

  // Business dates depend on the timezone, so fetch with a generous window and filter exactly.
  const windowFor = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 36 * 3_600_000);
  const payoutRows = await db
    .select({
      amountCents: payouts.amountCents,
      status: payouts.status,
      createdAt: payouts.createdAt,
      shiftPayee: shifts.payeeId,
      billPayee: bills.payeeId,
    })
    .from(payouts)
    .leftJoin(shifts, eq(payouts.shiftId, shifts.id))
    .leftJoin(bills, eq(payouts.billId, bills.id))
    .where(and(eq(payouts.businessId, businessId), gte(payouts.createdAt, windowFor(today))));
  const paidTodayByPayee: Record<string, number> = {};
  for (const p of payoutRows) {
    if (!isLive(p.status)) continue;
    if (businessDate(p.createdAt, business.tz) !== today) continue;
    const payeeId = p.shiftPayee ?? p.billPayee;
    if (!payeeId) continue;
    paidTodayByPayee[payeeId] = (paidTodayByPayee[payeeId] ?? 0) + p.amountCents;
  }

  const saleRows = await db
    .select({ total: sales.totalCents, status: sales.status, paidAt: sales.paidAt })
    .from(sales)
    .where(and(eq(sales.businessId, businessId), gte(sales.paidAt, windowFor(date))));
  const todaysSales = saleRows.filter(
    (s) =>
      (s.status === "paid" || s.status === "paid_cash") &&
      s.paidAt !== null &&
      businessDate(s.paidAt, business.tz) === date,
  );

  // An approval whose payout then failed no longer covers the obligation: it goes back to the owner.
  const liveIds = new Set(
    existingPayouts.filter((p) => isLive(p.status)).map((p) => p.shiftId ?? p.billId),
  );
  const failedIds = new Set(
    existingPayouts.map((p) => p.shiftId ?? p.billId).filter((id) => id !== undefined && !liveIds.has(id)),
  );
  const decidedIds = new Set<string>();
  for (const d of decisionRows) {
    if (d.date !== date && d.status !== "open") continue;
    const coveredId = d.shiftId ?? d.billId;
    if (d.status === "approved" && coveredId && failedIds.has(coveredId)) continue;
    if (d.shiftId) decidedIds.add(d.shiftId);
    if (d.billId) decidedIds.add(d.billId);
  }

  return {
    businessName: business.name,
    obligations,
    existingPayouts,
    paidBills,
    paidTodayByPayee,
    sales: {
      count: todaysSales.length,
      totalCents: todaysSales.reduce((sum, s) => sum + s.total, 0),
    },
    decidedIds,
  };
}
