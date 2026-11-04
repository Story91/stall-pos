"use client";

import Link from "next/link";
import { BillLogger } from "@/components/day/BillLogger";
import { PayeeChips } from "@/components/day/PayeeChips";
import { SalesList } from "@/components/day/SalesList";
import { TotalsStrip } from "@/components/day/TotalsStrip";
import { PayoutsList } from "@/components/close/PayoutsList";
import { ErrorBox, Screen, ScreenHeader, SectionTitle } from "@/components/ui";
import { useDay } from "@/hooks/useDay";
import { useLanguage, useT } from "@/lib/i18n/useT";
import { payeeNames, type DayView } from "@/lib/owner/types";
import { formatCents, longDate } from "@/lib/sell/format";

export default function DayPage() {
  const d = useDay();
  const t = useT();
  const language = useLanguage();
  const { business, day } = d;

  return (
    <Screen>
      <ScreenHeader
        title={t.day.title}
        detail={business ? `${longDate(business.today, language)}, ${business.name}` : " "}
      />

      {d.loadError && <ErrorBox message={d.loadError} onRetry={d.reload} />}

      {!day ? (
        !d.loadError && <DaySkeleton />
      ) : (
        <>
          <TotalsStrip totals={day.totals} />

          <section aria-labelledby="sales" className="flex flex-col gap-3">
            <SectionTitle id="sales">{t.day.sales}</SectionTitle>
            <SalesList sales={day.sales} tz={business?.tz} />
          </section>

          <section aria-labelledby="worked" className="flex flex-col gap-3">
            <SectionTitle id="worked">{t.day.worked}</SectionTitle>
            <p className="text-lg text-graphite">{t.day.tapHint}</p>
            <PayeeChips
              payees={d.payees.filter((p) => p.role === "helper")}
              worked={new Set(day.shifts.map((s) => s.payeeId))}
              busy={d.busy}
              messages={d.shiftMessages}
              onToggle={d.toggleShift}
            />
          </section>

          <section aria-labelledby="bill" className="flex flex-col gap-3">
            <SectionTitle id="bill">{t.day.logBill}</SectionTitle>
            {d.voice.suggestion && (
              <div className="flex flex-col gap-2 rounded-2xl bg-marigold-soft p-3">
                <p className="text-lg font-semibold">{t.day.shiftSuggestion(d.voice.suggestion.name)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={d.voice.dismissShift} className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold">
                    {t.day.notNow}
                  </button>
                  <button type="button" onClick={d.voice.confirmShift} className="min-h-14 rounded-xl bg-ink text-lg font-bold text-paper">
                    {t.day.logShift}
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
            <SectionTitle id="payouts">{t.day.paidOut}</SectionTitle>
            <PayoutsList payouts={day.payouts} names={payeeNames(day)} />
            <DecisionsLine decisions={day.decisions} />
          </section>

          <Link
            href="/close"
            className="flex min-h-16 items-center justify-center rounded-2xl bg-marigold text-2xl font-extrabold text-ink"
          >
            {t.day.closeDay}
          </Link>
        </>
      )}
    </Screen>
  );
}

function BillsList({ bills }: { bills: DayView["bills"] }) {
  const t = useT();
  if (bills.length === 0) return null;
  return (
    <ul aria-label={t.day.billsLabel} className="border-t-2 border-ink">
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
            {t.day.billStatus[bill.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DecisionsLine({ decisions }: { decisions: DayView["decisions"] }) {
  const t = useT();
  const open = decisions.filter((x) => x.status === "open").length;
  if (decisions.length === 0) return null;
  return (
    <p className="text-lg">
      {open > 0 ? (
        <>
          <strong>{t.day.decisionsWait(open)}</strong>{" "}
          <Link href="/close" className="font-semibold underline underline-offset-4">
            {t.day.reviewOnClose}
          </Link>
        </>
      ) : (
        t.day.allSettled(decisions.length)
      )}
    </p>
  );
}

function DaySkeleton() {
  const t = useT();
  return (
    <div aria-busy aria-label={t.day.loading} className="flex flex-col gap-4">
      <div className="skeleton h-56 rounded-2xl bg-wash" />
      {[1, 2, 3].map((n) => (
        <div key={n} className="skeleton h-16 rounded-xl bg-wash" />
      ))}
    </div>
  );
}
