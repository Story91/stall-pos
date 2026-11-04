"use client";

import { useT } from "@/lib/i18n/useT";
import type { DayTotals } from "@/lib/owner/types";
import { formatCents } from "@/lib/sell/format";

/** The day's takings: one big number, the breakdown, and a cash/PayPal split bar. */
export function TotalsStrip({ totals }: { totals: DayTotals }) {
  const t = useT();
  const paypalShare = totals.totalCents > 0 ? (totals.paypalCents / totals.totalCents) * 100 : 0;
  return (
    <section aria-label={t.totals.label} className="flex flex-col gap-4 rounded-2xl bg-ink p-4 text-paper">
      <div>
        <p className="text-lg text-paper/80">
          {t.totals.tookIn(totals.count)}
        </p>
        <p className="money text-6xl font-extrabold leading-none text-marigold">
          {formatCents(totals.totalCents)}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Figure label={t.totals.beforeTax} cents={totals.subtotalCents} />
        <Figure label={t.totals.tax} cents={totals.taxCents} />
        <Figure label={t.totals.tips} cents={totals.tipCents} />
      </dl>
      <div className="flex flex-col gap-2">
        <div
          aria-hidden
          className="flex h-4 overflow-hidden rounded-full bg-paper"
        >
          <span className="bg-marigold" style={{ width: `${paypalShare}%` }} />
        </div>
        <dl className="flex justify-between text-lg">
          <div>
            <dt className="text-paper/80">{t.totals.paypal}</dt>
            <dd className="money text-2xl font-bold text-marigold">{formatCents(totals.paypalCents)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-paper/80">{t.totals.cash}</dt>
            <dd className="money text-2xl font-bold">{formatCents(totals.cashCents)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Figure({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <dt className="text-base text-paper/80">{label}</dt>
      <dd className="money text-2xl font-bold">{formatCents(cents)}</dd>
    </div>
  );
}
