"use client";

import { Spinner } from "@/components/ui";
import { payoutPayee, type PayoutRow, type PayoutStatus } from "@/lib/owner/types";
import { useT } from "@/lib/i18n/useT";
import { formatCents } from "@/lib/sell/format";

const STATUS_CLASS: Record<PayoutStatus, string> = {
  PENDING: "bg-marigold-soft text-ink",
  SUCCESS: "bg-ink text-paper",
  FAILED: "hazard text-paper",
  UNCLAIMED: "border-2 border-ink bg-paper text-ink",
};

export function PayoutsList({ payouts, names }: { payouts: PayoutRow[]; names: Map<string, string> }) {
  const t = useT();
  if (payouts.length === 0) return <p className="text-lg text-graphite">{t.payouts.empty}</p>;
  return (
    <ul className="border-t-2 border-ink">
      {payouts.map((payout) => {
        return (
          <li key={payout.id} className="flex min-h-16 items-center gap-3 border-b border-rule py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold">
                {payoutPayee(payout, names, t.payouts.unknownPayee)}
                {payout.payeeRole && (
                  <span className="ml-2 text-base font-normal text-graphite">
                    {payout.payeeRole === "helper" ? t.common.helper : t.common.supplier}
                  </span>
                )}
              </p>
              <p className={`text-base text-graphite ${payout.status === "FAILED" ? "" : "truncate"}`}>{payout.rationale}</p>
            </div>
            <span className="money text-2xl font-bold">{formatCents(payout.amountCents)}</span>
            <span
              className={`flex min-w-24 items-center justify-center gap-1.5 rounded-full px-3 py-1 text-base font-bold ${STATUS_CLASS[payout.status]}`}
            >
              {payout.status === "PENDING" && <Spinner className="size-4 border-2" />}
              <span className={payout.status === "FAILED" ? "rounded bg-ink px-1" : undefined}>{t.payouts.status[payout.status]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
