import type { SaleRow, SaleStatus } from "@/lib/owner/types";
import { clockTime, formatCents } from "@/lib/sell/format";

const CHIP: Record<SaleStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-ink text-paper" },
  paid_cash: { label: "Cash", className: "bg-marigold text-ink" },
  awaiting: { label: "Awaiting", className: "border-2 border-dashed border-ink bg-paper text-ink" },
  cancelled: { label: "Cancelled", className: "bg-wash text-graphite line-through" },
  draft: { label: "Not charged", className: "bg-wash text-graphite" },
};

function itemsLine(sale: SaleRow): string {
  return sale.lines.map((l) => `${l.qty} ${l.name}`).join(", ");
}

export function SalesList({ sales, tz }: { sales: SaleRow[]; tz?: string }) {
  if (sales.length === 0) {
    return <p className="text-lg text-graphite">No sales yet today. Each sale you ring up on Sell lands here.</p>;
  }
  // Newest first: the owner checks the sale that just happened.
  const rows = [...sales].reverse();
  return (
    <ul className="border-t-2 border-ink">
      {rows.map((sale) => {
        const chip = CHIP[sale.status];
        return (
          <li key={sale.id} className="flex min-h-16 items-center gap-3 border-b border-rule py-2">
            <span className="money w-16 shrink-0 text-lg text-graphite">{clockTime(sale.createdAt, tz)}</span>
            <span className="min-w-0 flex-1 truncate text-lg">{itemsLine(sale)}</span>
            <span className="money text-xl font-bold">{formatCents(sale.totalCents)}</span>
            <span className={`w-24 shrink-0 rounded-full px-2 py-1 text-center text-base font-bold ${chip.className}`}>
              {chip.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
