// Reconciliation: does what Stall recorded for a day match what PayPal recorded?
// Pure: the ledger and PayPal's transactions go in, a small report comes out.
import { businessDate } from "@/lib/dates";
import type { PayPalTxn } from "@/lib/paypal/reporting";

/** PayPal says a new transaction can take up to about 3 hours to appear in Transaction Search. */
export const REPORT_LAG_MS = 3 * 60 * 60 * 1000;

export type LedgerSale = {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  totalCents: number;
  /** When PayPal confirmed it (ISO). */
  paidAt: string;
};

export type LedgerPayout = {
  id: string;
  /** Who was paid, for the owner. */
  label: string;
  amountCents: number;
  status: "PENDING" | "SUCCESS" | "FAILED" | "UNCLAIMED";
  createdAt: string;
};

export type ReconcileItem = {
  kind: "sale" | "payout";
  id: string;
  label: string;
  cents: number;
  /** Too new to expect in PayPal's report yet. */
  recent: boolean;
};

export type ReconcileReport = {
  status: "match" | "waiting" | "gaps";
  stall: { inCents: number; outCents: number };
  paypal: { inCents: number; outCents: number };
  matched: number;
  /** In Stall's ledger, not (yet) in PayPal's report. */
  missing: ReconcileItem[];
  /** PayPal activity on that day that Stall did not make: shown as information, not an error. */
  other: { id: string; cents: number; at: string }[];
  asOf: string;
};

/** Payouts that PayPal has actually moved money for. PENDING is still settling; FAILED moved nothing. */
const MOVED = new Set<LedgerPayout["status"]>(["SUCCESS", "UNCLAIMED"]);

export function reconcileDay(input: {
  date: string;
  tz: string;
  sales: LedgerSale[];
  payouts: LedgerPayout[];
  txns: PayPalTxn[];
  now: Date;
}): ReconcileReport {
  const { date, tz, now } = input;
  // Denied and reversed transactions moved no money that stayed.
  const pool = input.txns.filter((t) => t.status === "S" || t.status === "P");
  const used = new Set<string>();
  const missing: ReconcileItem[] = [];
  let matched = 0;
  const recent = (iso: string) => now.getTime() - new Date(iso).getTime() < REPORT_LAG_MS;

  const take = (pick: (t: PayPalTxn) => boolean): PayPalTxn | undefined => {
    const hit = pool.find((t) => !used.has(t.id) && pick(t));
    if (hit) used.add(hit.id);
    return hit;
  };

  for (const sale of input.sales) {
    const keys = [sale.invoiceNumber, sale.invoiceId].filter((k): k is string => Boolean(k));
    // By invoice reference first; by amount on the same day only when PayPal gave no reference.
    const hit =
      take((t) => t.cents > 0 && t.invoiceId !== null && keys.includes(t.invoiceId)) ??
      take((t) => t.cents === sale.totalCents && t.invoiceId === null && businessDate(new Date(t.at), tz) === date);
    if (hit) matched += 1;
    else
      missing.push({
        kind: "sale",
        id: sale.id,
        label: sale.invoiceNumber ?? sale.invoiceId ?? sale.id,
        cents: sale.totalCents,
        recent: recent(sale.paidAt),
      });
  }

  const moved = input.payouts.filter((p) => MOVED.has(p.status));
  for (const payout of moved) {
    const sent = businessDate(new Date(payout.createdAt), tz);
    const hit = take((t) => t.cents === -payout.amountCents && businessDate(new Date(t.at), tz) === sent);
    if (hit) matched += 1;
    else
      missing.push({
        kind: "payout",
        id: payout.id,
        label: payout.label,
        cents: payout.amountCents,
        recent: recent(payout.createdAt),
      });
  }

  const other = pool
    .filter((t) => !used.has(t.id) && t.cents !== 0 && businessDate(new Date(t.at), tz) === date)
    .map((t) => ({ id: t.id, cents: t.cents, at: t.at }));

  const inDay = pool.filter((t) => used.has(t.id) || other.some((o) => o.id === t.id));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    status: missing.some((m) => !m.recent) ? "gaps" : missing.length > 0 ? "waiting" : "match",
    stall: {
      inCents: sum(input.sales.map((s) => s.totalCents)),
      outCents: sum(moved.map((p) => p.amountCents)),
    },
    paypal: {
      inCents: sum(inDay.filter((t) => t.cents > 0).map((t) => t.cents)),
      outCents: sum(inDay.filter((t) => t.cents < 0).map((t) => -t.cents)),
    },
    matched,
    missing,
    other,
    asOf: now.toISOString(),
  };
}
