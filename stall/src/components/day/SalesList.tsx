"use client";

import { useLanguage, useT } from "@/lib/i18n/useT";
import type { SaleRow, SaleStatus } from "@/lib/owner/types";
import { clockTime, formatCents } from "@/lib/sell/format";

const CHIP: Record<SaleStatus, string> = {
  paid: "bg-ink text-paper",
  paid_cash: "bg-marigold text-ink",
  awaiting: "border-2 border-dashed border-ink bg-paper text-ink",
  cancelled: "bg-wash text-graphite line-through",
  draft: "bg-wash text-graphite",
};

function itemsLine(sale: SaleRow): string {
  return sale.lines.map((l) => `${l.qty}× ${l.name}`).join(", ");
}

export function SalesList({ sales, tz }: { sales: SaleRow[]; tz?: string }) {
  const t = useT();
  const language = useLanguage();
  if (sales.length === 0) {
    return <p className="text-lg text-graphite">{t.salesList.empty}</p>;
  }
  // Newest first: the owner checks the sale that just happened.
  const rows = [...sales].reverse();
  return (
    <ul className="border-t-2 border-ink">
      {rows.map((sale) => {
        return (
          <li key={sale.id} className="flex min-h-16 flex-col justify-center gap-0.5 border-b border-rule py-2">
            {/* Time, amount and status on one line; the items get the full width below. */}
            <div className="flex items-center gap-3">
              <span className="money shrink-0 text-lg text-graphite">{clockTime(sale.paidAt ?? sale.createdAt, tz, language)}</span>
              <span className="money ml-auto text-xl font-bold">{formatCents(sale.totalCents)}</span>
              <span className={`w-24 shrink-0 rounded-full px-2 py-1 text-center text-base font-bold ${CHIP[sale.status]}`}>
                {t.salesList.status[sale.status]}
              </span>
            </div>
            <p className="line-clamp-2 text-lg">{itemsLine(sale)}</p>
          </li>
        );
      })}
    </ul>
  );
}
