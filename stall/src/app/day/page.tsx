"use client";

import Link from "next/link";
import { BillLogger } from "@/components/day/BillLogger";
import { PayeeChips } from "@/components/day/PayeeChips";
import { SalesList } from "@/components/day/SalesList";
import { TotalsStrip } from "@/components/day/TotalsStrip";
import { PayoutsList } from "@/components/close/PayoutsList";
import { ErrorBox, Screen, ScreenHeader, SectionTitle } from "@/components/ui";
import { useDay } from "@/hooks/useDay";
import { payeeNames, type BillStatus, type DayView } from "@/lib/owner/types";
import { formatCents, longDate } from "@/lib/sell/format";

export default function DayPage() {
  const d = useDay();
  const { business, day } = d;

  return (
    <Screen>
      <ScreenHeader
        title="Today"
        detail={business ? `${longDate(business.today)}, ${business.name}` : " "}
      />

      {d.loadError && <ErrorBox message={d.loadError} onRetry={d.reload} />}

      {!day ? (
        !d.loadError && <DaySkeleton />
      ) : (
        <>
          <TotalsStrip totals={day.totals} />

          <section aria-labelledby="sales" className="flex flex-col gap-3">
            <SectionTitle id="sales">Sales</SectionTitle>
            <SalesList sales={day.sales} tz={business?.tz} />
          </section>

          <section aria-labelledby="worked" className="flex flex-col gap-3">
            <SectionTitle id="worked">Who worked today</SectionTitle>
            <p className="text-lg text-graphite">Tap a name to log their shift. Tap again to undo.</p>
            <PayeeChips
              payees={d.payees.filter((p) => p.role === "helper")}
              worked={new Set(day.shifts.map((s) => s.payeeId))}
              busy={d.busy}
              messages={d.shiftMessages}
              onToggle={d.toggleShift}
            />
          </section>

          <section aria-labelledby="bill" className="flex flex-col gap-3">
            <SectionTitle id="bill">Log a bill</SectionTitle>
            {d.voice.suggestion && (
              <div className="flex flex-col gap-2 rounded-2xl bg-marigold-soft p-3">
                <p className="text-lg font-semibold">That sounded like a shift. Log {d.voice.suggestion.name} as worked today?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={d.voice.dismissShift} className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold">
                    Not now
                  </button>
                  <button type="button" onClick={d.voice.confirmShift} className="min-h-14 rounded-xl bg-ink text-lg font-bold text-paper">
                    Log shift
                  </button>
                </div>
              </div>
            )}
            <BillLogger
              key={d.voice.draft.key}
              payees={d.payees}
              mic={d.voice.mic}
              micSupported={d.voice.micSupported}
              onPressStart={d.voice.pressStart}
              onPressEnd={d.voice.pressEnd}
              heard={d.voice.heard}
              voiceNotice={d.voice.notice}
              draft={d.voice.draft.value}
              onSave={d.saveBill}
            />
            <BillsList bills={day.bills} />
          </section>

          <section aria-labelledby="payouts" className="flex flex-col gap-3">
            <SectionTitle id="payouts">Paid out</SectionTitle>
            <PayoutsList payouts={day.payouts} names={payeeNames(day)} />
            <DecisionsLine decisions={day.decisions} />
          </section>

          <Link
            href="/close"
            className="flex min-h-16 items-center justify-center rounded-2xl bg-marigold text-2xl font-extrabold text-ink"
          >
            Close the day
          </Link>
        </>
      )}
    </Screen>
  );
}

const BILL_STATUS: Record<BillStatus, string> = {
  open: "Not paid yet",
  paid: "Paid",
  held: "Waiting on you",
  declined: "Declined",
};

function BillsList({ bills }: { bills: DayView["bills"] }) {
  if (bills.length === 0) return null;
  return (
    <ul aria-label="Bills logged today" className="border-t-2 border-ink">
      {bills.map((bill) => (
        <li key={bill.id} className="flex min-h-14 items-center gap-3 border-b border-rule py-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{bill.payee.name}</p>
            <p className="truncate text-base text-graphite">{bill.note}</p>
          </div>
          <span className="money text-xl font-bold">{formatCents(bill.amountCents)}</span>
          <span
            className={`rounded-full px-3 py-1 text-base font-bold ${
              bill.status === "held" ? "bg-marigold text-ink" : bill.status === "paid" ? "bg-ink text-paper" : "bg-wash"
            }`}
          >
            {BILL_STATUS[bill.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DecisionsLine({ decisions }: { decisions: DayView["decisions"] }) {
  const open = decisions.filter((x) => x.status === "open").length;
  if (decisions.length === 0) return null;
  return (
    <p className="text-lg">
      {open > 0 ? (
        <>
          <strong>{open === 1 ? "1 decision waits" : `${open} decisions wait`} for you.</strong>{" "}
          <Link href="/close" className="font-semibold underline underline-offset-4">
            Review on Close
          </Link>
        </>
      ) : (
        `All ${decisions.length} decisions for today are settled.`
      )}
    </p>
  );
}

function DaySkeleton() {
  return (
    <div aria-busy aria-label="Loading today" className="flex flex-col gap-4">
      <div className="skeleton h-56 rounded-2xl bg-wash" />
      {[1, 2, 3].map((n) => (
        <div key={n} className="skeleton h-16 rounded-xl bg-wash" />
      ))}
    </div>
  );
}
