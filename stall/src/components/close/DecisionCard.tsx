"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";
import type { DecisionAction, DecisionRow, DecisionStatus, DecisionType } from "@/lib/owner/types";
import { normalize } from "@/lib/owner/text";
import { formatCents } from "@/lib/sell/format";

export type ActionOutcome = { ok: true } | { ok: false; message: string; conflict: boolean };

type Props = {
  decision: DecisionRow;
  onAction(action: DecisionAction): Promise<ActionOutcome>;
};

const TYPE_LABEL: Record<DecisionType, string> = {
  duplicate_bill: "Possible duplicate",
  over_limit: "Over the limit",
  manual_payee: "Needs your approval",
  escalated: "Agent asked you",
};

const OUTCOME: Record<Exclude<DecisionStatus, "open">, string> = {
  approved: "Approved and paid",
  declined: "Declined, nothing paid",
  marked_paid: "Marked as already paid",
};

const ACTION_LABEL: Record<DecisionAction, string> = {
  approve: "Approve",
  decline: "Decline",
  mark_paid: "Mark as already paid",
};

function shortDate(date: string | undefined): string {
  if (!date) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
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
  const [confirming, setConfirming] = useState<DecisionAction | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<{ message: string; locked: boolean } | null>(null);
  const obligation = decision.source.obligation;
  const amount = obligation ? formatCents(obligation.amountCents) : null;
  const who = obligation?.payee.name ?? "this payee";
  const headline = decision.source.rulesReason ?? decision.reason;
  const rationale = extraRationale(headline, decision.source.agentRationale);

  const confirmText: Record<DecisionAction, { question: string; yes: string }> = {
    approve: {
      question: `Send ${amount ?? "this payment"} to ${who} through PayPal now?`,
      yes: amount ? `Yes, pay ${amount}` : "Yes, pay",
    },
    decline: { question: "Decline it? Nothing will be paid.", yes: "Yes, decline" },
    mark_paid: {
      question: "Mark it as already paid? Nothing will be sent.",
      yes: "Yes, it's already paid",
    },
  };

  const act = async (action: DecisionAction) => {
    setConfirming(null);
    setWorking(true);
    setError(null);
    const outcome = await onAction(action);
    setWorking(false);
    if (!outcome.ok) setError({ message: outcome.message, locked: outcome.conflict });
  };

  const resolved = decision.status !== "open";
  const locked = working || error?.locked === true;

  return (
    <article
      aria-label={`${TYPE_LABEL[decision.type]}: ${who}`}
      className={`flex flex-col gap-4 rounded-2xl border-2 border-ink p-4 ${resolved ? "bg-wash" : "bg-paper"}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-base font-bold ${
            resolved ? "bg-paper text-graphite" : "bg-marigold text-ink"
          }`}
        >
          {TYPE_LABEL[decision.type]}
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
            Agent: {rationale}
          </p>
        )}
      </div>

      {decision.type === "duplicate_bill" && obligation && (
        <div className="grid grid-cols-2 gap-2">
          <BillFacts
            label="This bill"
            cents={obligation.amountCents}
            date={shortDate(obligation.date)}
            note={obligation.note}
          />
          <BillFacts
            label="Already paid"
            cents={decision.source.evidence?.amountCents}
            date={shortDate(decision.source.evidence?.date)}
            note={decision.source.evidence?.note}
            batchId={decision.source.evidence?.payoutBatchId}
          />
        </div>
      )}

      {resolved ? (
        <p className="text-xl font-bold">{OUTCOME[decision.status as Exclude<DecisionStatus, "open">]}</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2 rounded-xl bg-marigold-soft p-3">
          <p className="text-lg font-semibold">{confirmText[confirming].question}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold"
            >
              Back
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
          <div className="grid grid-cols-2 gap-2">
            {(["approve", "decline"] as const).map((action) => (
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
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={locked}
            onClick={() => setConfirming("mark_paid")}
            className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold disabled:opacity-40"
          >
            {ACTION_LABEL.mark_paid}
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
  return (
    <section role="group" aria-label={label} className="flex min-w-0 flex-col gap-1 rounded-xl bg-wash p-3">
      <h3 className="text-base font-semibold text-graphite">{label}</h3>
      <p className="money text-3xl font-bold leading-none">{cents === undefined ? "Unknown" : formatCents(cents)}</p>
      <p className="text-base font-semibold">{date}</p>
      <p className="text-base">{note ?? "No note"}</p>
      {batchId && (
        <p className="break-all text-sm text-graphite">
          Payout <span className="font-semibold text-ink">{batchId}</span>
        </p>
      )}
    </section>
  );
}
