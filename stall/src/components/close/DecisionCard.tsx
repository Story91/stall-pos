"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";
import type { DecisionAction, DecisionRow, DecisionStatus, DecisionType } from "@/lib/owner/types";
import { normalize } from "@/lib/owner/text";
import type { Messages } from "@/lib/i18n";
import { useLanguage, useT } from "@/lib/i18n/useT";
import type { Language } from "@/lib/parse/schema";
import { formatCents, shortDate } from "@/lib/sell/format";

export type ActionOutcome = { ok: true } | { ok: false; message: string; conflict: boolean };

type Props = {
  decision: DecisionRow;
  /** `expectedCents` (approve only) is the amount on the card; the server refuses if it has changed. */
  onAction(action: DecisionAction, expectedCents?: number): Promise<ActionOutcome>;
};

function cardDate(t: Messages, language: Language, date: string | undefined): string {
  return date ? shortDate(date, language) : t.decision.unknownDate;
}

/** The agent's rationale is worth showing only when it adds something to the rules' reason. */
function extraRationale(headline: string, rationale: string | null | undefined): string | null {
  if (!rationale) return null;
  const a = normalize(headline);
  const b = normalize(rationale);
  if (!b || a.includes(b) || b.includes(a)) return null;
  return rationale;
}

export function DecisionCard({ decision, onAction }: Props) {
  const t = useT();
  const language = useLanguage();
  const typeLabel: Record<DecisionType, string> = t.decision.type;
  const outcomeLabel: Record<Exclude<DecisionStatus, "open">, string> = t.decision.outcome;
  const actionLabel: Record<DecisionAction, string> = t.decision.action;
  const [confirming, setConfirming] = useState<DecisionAction | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<{ message: string; locked: boolean } | null>(null);
  const obligation = decision.source.obligation;
  // The API's current amount wins over the snapshot taken when the card was made.
  const cents = decision.currentAmountCents ?? obligation?.amountCents ?? null;
  const amount = cents === null ? null : formatCents(cents);
  // An escalated item whose PayPal batch id is already used cannot be sent again from here.
  const handPayOnly = decision.type === "escalated" && decision.payoutBlocked === true;
  const who = obligation?.payee.name ?? t.decision.thisPayee;
  const headline = decision.source.rulesReason ?? decision.reason;
  const rationale = extraRationale(headline, decision.source.agentRationale);

  const confirmText: Record<DecisionAction, { question: string; yes: string }> = {
    approve: { question: t.decision.approveQuestion(amount, who), yes: t.decision.approveYes(amount) },
    decline: { question: t.decision.declineQuestion, yes: t.decision.declineYes },
    mark_paid: { question: t.decision.markQuestion, yes: t.decision.markYes },
  };

  const act = async (action: DecisionAction) => {
    setConfirming(null);
    setWorking(true);
    setError(null);
    const outcome =
      action === "approve" && cents !== null ? await onAction(action, cents) : await onAction(action);
    setWorking(false);
    if (!outcome.ok) setError({ message: outcome.message, locked: outcome.conflict });
  };

  const resolved = decision.status !== "open";
  const locked = working || error?.locked === true;

  return (
    <article
      aria-label={`${typeLabel[decision.type]}: ${who}`}
      className={`flex flex-col gap-4 rounded-2xl border-2 border-ink p-4 ${resolved ? "bg-wash" : "bg-paper"}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-base font-bold ${
            resolved ? "bg-paper text-graphite" : "bg-marigold text-ink"
          }`}
        >
          {typeLabel[decision.type]}
        </span>
        {obligation && (
          <span className="text-lg font-semibold">
            {who} <span className="money">{amount}</span>
          </span>
        )}
      </header>

      <div className="flex flex-col gap-1">
        <p className="text-lg">{headline}</p>
        {rationale && (
          <p data-testid="agent-rationale" className="text-base text-graphite">
            {t.decision.agent} {rationale}
          </p>
        )}
      </div>

      {decision.type === "duplicate_bill" && obligation && (
        <div className="grid grid-cols-2 gap-2">
          <BillFacts
            label={t.decision.thisBill}
            cents={obligation.amountCents}
            date={cardDate(t, language, obligation.date)}
            note={obligation.note}
          />
          <BillFacts
            label={t.decision.alreadyPaid}
            cents={decision.source.evidence?.amountCents}
            date={cardDate(t, language, decision.source.evidence?.date)}
            note={decision.source.evidence?.note}
            batchId={decision.source.evidence?.payoutBatchId}
          />
        </div>
      )}

      {resolved ? (
        <p className="text-xl font-bold">{outcomeLabel[decision.status as Exclude<DecisionStatus, "open">]}</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2 rounded-xl bg-marigold-soft p-3">
          <p className="text-lg font-semibold">{confirmText[confirming].question}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold"
            >
              {t.common.back}
            </button>
            <button
              type="button"
              onClick={() => void act(confirming)}
              className="min-h-14 rounded-xl bg-ink px-2 text-lg font-bold text-paper"
            >
              {confirmText[confirming].yes}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {handPayOnly && (
            <p className="rounded-xl bg-marigold-soft p-3 text-lg font-semibold">
              {t.decision.handPay}
            </p>
          )}
          <div className={`grid gap-2 ${handPayOnly ? "grid-cols-1" : "grid-cols-2"}`}>
            {(handPayOnly ? (["decline"] as const) : (["approve", "decline"] as const)).map((action) => (
              <button
                key={action}
                type="button"
                disabled={locked}
                onClick={() => setConfirming(action)}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-xl text-lg font-bold disabled:opacity-40 ${
                  action === "approve" ? "bg-ink text-paper" : "border-2 border-ink bg-paper"
                }`}
              >
                {working && action === "approve" && <Spinner />}
                {actionLabel[action]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={locked}
            onClick={() => setConfirming("mark_paid")}
            className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold disabled:opacity-40"
          >
            {actionLabel.mark_paid}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-ink p-3 text-lg text-paper">
          {error.message}
        </p>
      )}
    </article>
  );
}

function BillFacts({
  label,
  cents,
  date,
  note,
  batchId,
}: {
  label: string;
  cents: number | undefined;
  date: string;
  note: string | undefined;
  batchId?: string;
}) {
  const t = useT();
  return (
    <section role="group" aria-label={label} className="flex min-w-0 flex-col gap-1 rounded-xl bg-wash p-3">
      <h3 className="text-base font-semibold text-graphite">{label}</h3>
      <p className="money text-3xl font-bold leading-none">{cents === undefined ? t.decision.unknown : formatCents(cents)}</p>
      <p className="text-base font-semibold">{date}</p>
      <p className="text-base">{note ?? t.decision.noNote}</p>
      {batchId && (
        <p className="break-all text-sm text-graphite">
          {t.decision.payout} <span className="font-semibold text-ink">{batchId}</span>
        </p>
      )}
    </section>
  );
}
