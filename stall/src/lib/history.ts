import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db, Sale } from "@/db";
import { bills, payees, payouts, shifts } from "@/db/schema";
import { businessDate } from "@/lib/dates";
import { inBusinessRange, loadWindow, paidSalesInRange, settledAt, type ExportQuery } from "@/lib/export";
import { totalsOf, type HistoryResponse, type HistoryRow } from "@/lib/historyView";
import { localPayoutTexts } from "@/lib/close/view";
import type { Language } from "@/lib/parse/schema";

/** "2× Taco al pastor, 1× Agua fresca". */
function saleItems(sale: Sale): string {
  return sale.lines.map((line) => `${line.qty}× ${line.name}`).join(", ");
}

/**
 * One ledger for business dates `[from, to]`, newest first: paid sales (by the
 * same business-date rule as the CSV export) and every payout, whatever its
 * status, dated by when it was sent.
 */
export async function loadHistory(db: Db, query: ExportQuery, language: Language = "en"): Promise<HistoryRow[]> {
  const { business, rows: paidSales } = await paidSalesInRange(db, query);
  const { lo, hi } = loadWindow(query);

  const allPayoutRows = await db
    .select({
      payout: payouts,
      payeeName: payees.name,
      billNote: bills.note,
      obligationDate: sql<string | null>`coalesce(${shifts.date}, ${bills.date})`,
    })
    .from(payouts)
    .leftJoin(shifts, eq(payouts.shiftId, shifts.id))
    .leftJoin(bills, eq(payouts.billId, bills.id))
    .leftJoin(payees, eq(payees.id, sql`coalesce(${shifts.payeeId}, ${bills.payeeId})`))
    .where(and(eq(payouts.businessId, business.id), gte(payouts.createdAt, lo), lte(payouts.createdAt, hi)));
  const payoutRows = allPayoutRows.filter((row) => inBusinessRange(row.payout.createdAt, query, business.tz));
  const reasons = await localPayoutTexts(
    db,
    business.id,
    payoutRows
      .filter((row) => row.billNote === null)
      .map(({ payout, obligationDate }) => ({
        ...payout,
        runDate: obligationDate ?? businessDate(payout.createdAt, business.tz),
      })),
    language,
  );

  const ledger: HistoryRow[] = [
    ...paidSales.map((sale): HistoryRow => {
      const at = settledAt(sale);
      return {
        id: sale.id,
        kind: "sale",
        date: businessDate(at, business.tz),
        at: at.toISOString(),
        who: null,
        items: saleItems(sale),
        method: sale.status === "paid_cash" ? "cash" : "paypal",
        status: sale.status === "paid_cash" ? "paid_cash" : "paid",
        inCents: sale.totalCents,
        outCents: 0,
        taxCents: sale.taxCents,
        tipCents: sale.tipCents,
        invoiceNumber: sale.invoiceNumber,
      };
    }),
    ...payoutRows.map(({ payout, payeeName, billNote }): HistoryRow => ({
        id: payout.id,
        kind: "payout",
        date: businessDate(payout.createdAt, business.tz),
        at: payout.createdAt.toISOString(),
        who: payeeName,
        // A bill says what it was for; a shift payout carries the agent's one-line reason, in the owner's language.
        items: billNote ?? reasons.get(payout.id) ?? payout.rationale,
        method: "payout",
        status: payout.status,
        inCents: 0,
        outCents: payout.amountCents,
        taxCents: 0,
        tipCents: 0,
        invoiceNumber: null,
      })),
  ];

  return ledger.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1));
}

export async function historyFor(db: Db, query: ExportQuery, language: Language = "en"): Promise<HistoryResponse> {
  const rows = await loadHistory(db, query, language);
  return { rows, totals: totalsOf(rows) };
}
