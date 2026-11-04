"use client";

import { Spinner } from "@/components/ui";
import { payoutPayee, type PayoutRow, type PayoutStatus } from "@/lib/owner/types";
import { formatCents } from "@/lib/sell/format";

const STATUS: Record<PayoutStatus, { label: string; className: string }> = {
  PENDING: { label: "Sending", className: "bg-marigold-soft text-ink" },
  SUCCESS: { label: "Paid", className: "bg-ink text-paper" },
  FAILED: { label: "Failed", className: "hazard text-paper" },
  UNCLAIMED: { label: "Not claimed yet", className: "border-2 border-ink bg-paper text-ink" },
};

export function PayoutsList({ payouts, names }: { payouts: PayoutRow[]; names: Map<string, string> }) {
  if (payouts.length === 0) return <p className="text-lg text-graphite">No payouts for this day.</p>;
  return (
    <ul className="border-t-2 border-ink">
      {payouts.map((payout) => {
        const status = STATUS[payout.status];
        return (
          <li key={payout.id} className="flex min-h-16 items-center gap-3 border-b border-rule py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold">
                {payoutPayee(payout, names)}
                {payout.payeeRole && (
                  <span className="ml-2 text-base font-normal text-graphite">
                    {payout.payeeRole === "helper" ? "Helper" : "Supplier"}
                  </span>
                )}
              </p>
              <p className="truncate text-base text-graphite">{payout.rationale}</p>
            </div>
            <span className="money text-2xl font-bold">{formatCents(payout.amountCents)}</span>
            <span
              className={`flex min-w-24 items-center justify-center gap-1.5 rounded-full px-3 py-1 text-base font-bold ${status.className}`}
            >
              {payout.status === "PENDING" && <Spinner className="size-4 border-2" />}
              <span className={payout.status === "FAILED" ? "rounded bg-ink px-1" : undefined}>{status.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
