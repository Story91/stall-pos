"use client";

import { ActionLog } from "@/components/close/ActionLog";
import { DecisionCard } from "@/components/close/DecisionCard";
import { PayoutsList } from "@/components/close/PayoutsList";
import { ErrorBox, Screen, ScreenHeader, SectionTitle, Spinner } from "@/components/ui";
import { useClose, type RunNotice } from "@/hooks/useClose";
import { useLanguage, useT } from "@/lib/i18n/useT";
import { agentNote } from "@/lib/owner/text";
import { payeeNames } from "@/lib/owner/types";
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
            <h2 id="summary" className="sr-only">{t.close.summary}</h2>
            <p className="font-display text-3xl font-bold leading-tight">{run.summary}</p>
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
            <PayoutsList payouts={c.view.payouts} names={names} />
          </section>

          <section aria-labelledby="log" className="flex flex-col gap-3">
            <SectionTitle id="log">{t.close.log}</SectionTitle>
            <ActionLog log={run.log} names={names} />
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
      {notice.kind === "nothing-new" ? t.close.nothingNew : t.close.acted(notice.paid, notice.held)}
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
