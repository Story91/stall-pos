"use client";

import { ActionLog } from "@/components/close/ActionLog";
import { DecisionCard } from "@/components/close/DecisionCard";
import { PayoutsList } from "@/components/close/PayoutsList";
import { ErrorBox, Screen, ScreenHeader, SectionTitle, Spinner } from "@/components/ui";
import { useClose, type RunNotice } from "@/hooks/useClose";
import { useLanguage, useT } from "@/lib/i18n/useT";
import { failedPayouts } from "@/lib/owner/closeIssues";
import { agentNote, summarySentences } from "@/lib/owner/text";
import { payeeNames, type PayoutRow } from "@/lib/owner/types";
import { longDate } from "@/lib/sell/format";

export default function ClosePage() {
  const c = useClose();
  const t = useT();
  const language = useLanguage();
  const run = c.view?.run ?? null;
  const names = payeeNames(c.day);
  const decisions = [...(c.view?.decisions ?? [])].sort(
    (a, b) => Number(b.status === "open") - Number(a.status === "open"),
  );
  const note = run ? agentNote(run.log) : null;
  // Attempted but never sent: listed with the payouts so the summary's "could not be paid" has a row to point at.
  const failed: PayoutRow[] = run && c.view
    ? failedPayouts(run.log, c.view.payouts, c.day).map((f) => ({
        id: `failed-${f.obligationId}`,
        shiftId: null,
        billId: null,
        batchId: "",
        amountCents: f.amountCents,
        status: "FAILED",
        rationale: t.payouts.notSent,
        createdAt: run.createdAt,
        payeeName: f.payeeName,
      }))
    : [];
  const [headline, ...details] = run ? summarySentences(run.summary) : [];

  return (
    <Screen>
      <ScreenHeader
        title={t.close.title}
        detail={c.business ? longDate(c.business.today, language) : " "}
      />

      {c.loadError && <ErrorBox message={c.loadError} onRetry={c.reload} />}
      {c.runError && <ErrorBox message={c.runError} onRetry={c.run} />}

      {!c.view ? (
        !c.loadError && <div aria-busy aria-label={t.close.loading} className="skeleton h-48 rounded-2xl bg-wash" />
      ) : c.running && !run ? (
        <Running />
      ) : !run ? (
        <section className="flex flex-col gap-4">
          <p className="text-xl">{t.close.intro}</p>
          <button
            type="button"
            onClick={c.run}
            className="min-h-16 rounded-2xl bg-marigold text-2xl font-extrabold text-ink"
          >
            {t.close.runNow}
          </button>
        </section>
      ) : (
        <>
          <section aria-labelledby="summary" className="flex flex-col gap-3">
            <h2 id="summary" className="font-display text-3xl font-bold leading-tight">
              <span className="sr-only">{t.close.summary}: </span>
              {headline}
            </h2>
            {details.length > 0 && (
              <ul className="flex flex-col gap-1 text-xl leading-snug">
                {details.map((sentence) => (
                  <li key={sentence} className="border-l-4 border-ink pl-3">{sentence}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={c.replaySummary}
              className="min-h-12 self-start rounded-xl border-2 border-ink px-4 text-lg font-semibold"
            >
              {t.close.readAloud}
            </button>
            {note && (
              <figure className="border-l-8 border-marigold pl-4">
                <figcaption className="text-base font-semibold text-graphite">{t.close.agentNote}</figcaption>
                <blockquote className="text-xl">{note}</blockquote>
              </figure>
            )}
          </section>

          {decisions.length > 0 && (
            <section aria-labelledby="decisions" className="flex flex-col gap-3">
              <SectionTitle id="decisions">{t.close.needsYou}</SectionTitle>
              {decisions.map((decision) => (
                <DecisionCard
                  key={decision.id}
                  decision={decision}
                  onAction={(action, expectedCents) => c.resolve(decision.id, action, expectedCents)}
                />
              ))}
            </section>
          )}

          <section aria-labelledby="payouts" className="flex flex-col gap-3">
            <SectionTitle id="payouts">{t.close.payouts}</SectionTitle>
            <PayoutsList payouts={[...failed, ...c.view.payouts]} names={names} />
          </section>

          <section aria-labelledby="log" className="flex flex-col gap-3">
            <SectionTitle id="log">{t.close.log}</SectionTitle>
            <ActionLog log={run.log} names={names} tz={c.business?.tz} />
          </section>

          <section className="flex flex-col gap-2">
            <button
              type="button"
              onClick={c.run}
              disabled={c.running}
              className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-ink text-xl font-bold disabled:opacity-50"
            >
              {c.running && <Spinner />}
              {c.running ? t.close.closingAgain : t.close.runAgain}
            </button>
            <p className="text-base text-graphite">{t.close.safe}</p>
            {c.runNotice && <RunNoticeLine notice={c.runNotice} />}
          </section>
        </>
      )}
    </Screen>
  );
}

function RunNoticeLine({ notice }: { notice: RunNotice }) {
  const t = useT();
  return (
    <p role="status" className="text-lg font-semibold">
      {notice.kind === "nothing-new" ? t.close.nothingNew : t.close.acted(notice.paid, notice.held, notice.failed)}
    </p>
  );
}

function Running() {
  const t = useT();
  return (
    <section role="status" className="flex flex-col items-center gap-4 rounded-2xl bg-ink p-6 text-paper">
      <Spinner className="size-12 border-[5px] text-marigold" />
      <p className="text-center text-xl">{t.close.running}</p>
    </section>
  );
}
