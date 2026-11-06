"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { useLanguage, useT } from "@/lib/i18n/useT";
import { ownerCall } from "@/lib/owner/api";
import { clockTime, formatCents } from "@/lib/sell/format";
import type { ReconcileResponse } from "@/lib/closeApi";

type State = { kind: "loading" } | { kind: "error" } | { kind: "done"; report: ReconcileResponse };

/**
 * The day's ledger checked against PayPal Transaction Search: money in, money out,
 * and anything Stall recorded that PayPal does not show. Read-only.
 * The parent remounts it (via `key`) when the close or a payout status changes.
 */
export function MoneyCheck({ date, tz }: { date: string; tz?: string }) {
  const t = useT();
  const m = t.moneyCheck;
  const language = useLanguage();
  const [state, setState] = useState<State>({ kind: "loading" });

  const fetchReport = useCallback(
    () =>
      ownerCall<ReconcileResponse>(`/api/close/${date}/reconcile`).then(
        (r): State => (r.ok ? { kind: "done", report: r.data } : { kind: "error" }),
      ),
    [date],
  );

  useEffect(() => {
    let alive = true;
    void fetchReport().then((next) => alive && setState(next));
    return () => {
      alive = false;
    };
  }, [fetchReport]);

  const load = () => {
    setState({ kind: "loading" });
    void fetchReport().then(setState);
  };

  const report = state.kind === "done" && state.report.available ? state.report : null;
  const unavailable = state.kind === "error" || (state.kind === "done" && !state.report.available);
  const total = report ? report.matched + report.missing.length : 0;
  const waiting = report?.missing.filter((i) => i.recent) ?? [];
  const gaps = report?.missing.filter((i) => !i.recent) ?? [];

  return (
    <section aria-labelledby="money-check" aria-busy={state.kind === "loading"} className="flex flex-col gap-3 rounded-2xl border-2 border-ink p-4">
      <div>
        <h2 id="money-check" className="font-display text-2xl font-bold leading-tight">
          {m.title}
        </h2>
        <p className="text-base text-graphite">{m.intro}</p>
      </div>

      {state.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 text-lg">
          <Spinner /> {m.checking}
        </p>
      )}
      {unavailable && <p role="alert" className="text-lg font-semibold">{m.unavailable}</p>}

      {report && (
        <>
          <table className="w-full text-lg">
            <thead>
              <tr className="text-left text-base text-graphite">
                <th className="font-normal" />
                <th className="text-right font-semibold">{m.stall}</th>
                <th className="text-right font-semibold">{m.paypal}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-left font-normal">{m.moneyIn}</th>
                <td className="money text-right font-bold">{formatCents(report.stall.inCents)}</td>
                <td className="money text-right font-bold">{formatCents(report.paypal.inCents)}</td>
              </tr>
              <tr>
                <th scope="row" className="text-left font-normal">{m.moneyOut}</th>
                <td className="money text-right font-bold">{formatCents(report.stall.outCents)}</td>
                <td className="money text-right font-bold">{formatCents(report.paypal.outCents)}</td>
              </tr>
            </tbody>
          </table>
          {report.cashCents > 0 && <p className="text-base text-graphite">{m.cash(formatCents(report.cashCents))}</p>}
          {report.demoSales > 0 && <p className="text-base text-graphite">{m.demo(report.demoSales)}</p>}

          {report.status === "match" && (
            <p role="status" className="flex items-start gap-2 text-lg font-semibold">
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-paper">✓</span>
              {m.match(total)}
            </p>
          )}
          {gaps.length > 0 && (
            <div role="alert" className="flex flex-col gap-1">
              <p className="text-lg font-semibold">{m.gaps(gaps.length)}</p>
              <ItemList items={gaps} sale={m.sale} payout={m.payout} />
            </div>
          )}
          {waiting.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-lg">{m.waiting(waiting.length)}</p>
              <ItemList items={waiting} sale={m.sale} payout={m.payout} />
            </div>
          )}
          {report.other.length > 0 && <p className="text-base text-graphite">{m.other(report.other.length)}</p>}
          <p className="text-sm text-graphite">{m.asOf(clockTime(report.asOf, tz, language))}</p>
        </>
      )}

      {state.kind !== "loading" && (
        <button
          type="button"
          onClick={load}
          className="min-h-12 self-start rounded-xl border-2 border-ink px-4 text-lg font-semibold"
        >
          {m.again}
        </button>
      )}
    </section>
  );
}

function ItemList({
  items,
  sale,
  payout,
}: {
  items: { id: string; kind: "sale" | "payout"; label: string; cents: number }[];
  sale: string;
  payout: string;
}) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id} className="flex items-baseline gap-2 border-b border-rule py-1 text-base">
          <span className="font-semibold">{item.kind === "sale" ? sale : payout}</span>
          <span className="min-w-0 flex-1 truncate text-graphite">{item.label}</span>
          <span className="money font-bold">{formatCents(item.cents)}</span>
        </li>
      ))}
    </ul>
  );
}
