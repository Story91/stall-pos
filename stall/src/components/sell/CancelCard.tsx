"use client";

import { Spinner } from "@/components/ui";
import type { CancelStage } from "@/hooks/useSellFlow";
import { useT } from "@/lib/i18n/useT";
import { formatCents } from "@/lib/sell/format";

type Props = { stage: CancelStage; onConfirm(): void; onDismiss(): void };

/** "Cancel that sale": the sale it found, what cancelling will do, and the outcome. */
export function CancelCard({ stage, onConfirm, onDismiss }: Props) {
  const t = useT();
  const c = t.cancelSale;

  if (stage.step === "finding") {
    return (
      <section role="status" className="flex items-center gap-3 rounded-2xl bg-wash p-4 text-lg">
        <Spinner /> {c.finding}
      </section>
    );
  }
  if (stage.step === "none") return <Outcome text={c.none} onDismiss={onDismiss} ok={c.ok} />;

  const { sale } = stage;
  const total = formatCents(sale.totalCents);
  const summary = (
    <div className="flex flex-col gap-1 rounded-xl bg-paper p-3 text-ink">
      <p className="flex items-baseline justify-between gap-3">
        <span className="money text-3xl font-extrabold">{total}</span>
        <span className="text-base font-semibold">{stage.step === "done" ? c.status.cancelled : c.status[sale.status]}</span>
      </p>
      {sale.items && <p className="line-clamp-2 text-base">{sale.items}</p>}
      {sale.invoiceNumber && <p className="text-sm text-graphite">{sale.invoiceNumber}</p>}
    </div>
  );

  if (stage.step === "confirm" || stage.step === "working") {
    const working = stage.step === "working";
    return (
      <section aria-labelledby="cancel-title" className="flex flex-col gap-3 rounded-2xl bg-ink p-4 text-paper">
        <h2 id="cancel-title" className="font-display text-2xl font-bold">{c.title}</h2>
        {summary}
        <p className="text-lg">{sale.status === "paid_cash" ? c.effectCash(total) : c.effectAwaiting}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={working}
            className="min-h-14 rounded-xl border-2 border-paper text-lg font-bold disabled:opacity-50"
          >
            {c.keep}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={working}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-marigold text-lg font-bold text-ink disabled:opacity-70"
          >
            {working && <Spinner />}
            {working ? c.working : c.yes}
          </button>
        </div>
      </section>
    );
  }

  if (stage.step === "done") {
    return (
      <Outcome
        text={stage.was === "paid_cash" ? c.doneCash(total) : c.doneAwaiting}
        onDismiss={onDismiss}
        ok={c.ok}
        status
      >
        {summary}
      </Outcome>
    );
  }
  if (stage.step === "paypal") {
    return (
      <Outcome text={c.paypal} onDismiss={onDismiss} ok={c.ok}>
        {summary}
      </Outcome>
    );
  }
  // failed
  const text = stage.reason === "changed" ? c.changed : stage.reason === "gone" ? c.gone : stage.reason === "network" ? t.common.noConnection : c.failed;
  const canRetry = stage.reason === "paypal" || stage.reason === "network";
  return (
    <Outcome text={text} onDismiss={onDismiss} ok={c.ok} retry={canRetry ? { label: c.tryAgain, onRetry: onConfirm } : undefined}>
      {summary}
    </Outcome>
  );
}

function Outcome({
  text,
  ok,
  onDismiss,
  status = false,
  retry,
  children,
}: {
  text: string;
  ok: string;
  onDismiss(): void;
  status?: boolean;
  retry?: { label: string; onRetry(): void };
  children?: React.ReactNode;
}) {
  return (
    <section role={status ? "status" : "alert"} className="flex flex-col gap-3 rounded-2xl bg-ink p-4 text-paper">
      <p className="text-xl font-semibold">{text}</p>
      {children}
      <div className="flex gap-2">
        {retry && (
          <button type="button" onClick={retry.onRetry} className="min-h-14 flex-1 rounded-xl bg-marigold text-lg font-bold text-ink">
            {retry.label}
          </button>
        )}
        <button type="button" onClick={onDismiss} className="min-h-14 flex-1 rounded-xl border-2 border-paper text-lg font-bold">
          {ok}
        </button>
      </div>
    </section>
  );
}
