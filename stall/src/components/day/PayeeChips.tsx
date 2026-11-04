"use client";

import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n/useT";
import type { PayeeRow } from "@/lib/owner/types";
import { formatCents } from "@/lib/sell/format";

type Props = {
  /** Helpers only; suppliers are paid by bill, not by shift. */
  payees: PayeeRow[];
  worked: ReadonlySet<string>;
  busy: ReadonlySet<string>;
  messages: Record<string, string>;
  /** `worked` is the state before the tap: true means remove the shift. */
  onToggle(payeeId: string, worked: boolean): void;
};

export function PayeeChips({ payees: all, worked, busy, messages, onToggle }: Props) {
  const t = useT();
  if (all.length === 0) {
    return (
      <p className="text-lg text-graphite">{t.payees.noHelpers}</p>
    );
  }
  // A shift without a daily rate could never be paid, so there is no chip to log one;
  // a shift already logged stays visible so it can be removed.
  const payees = all.filter((p) => p.dailyRateCents !== null || worked.has(p.id));
  if (payees.length === 0) {
    return (
      <p className="text-lg text-graphite">{t.payees.noRates}</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {payees.map((payee) => {
        const on = worked.has(payee.id);
        const saving = busy.has(payee.id);
        const message = messages[payee.id];
        return (
          <li key={payee.id} className="flex flex-col gap-1">
            <button
              type="button"
              aria-pressed={on}
              aria-busy={saving || undefined}
              onClick={() => {
                if (!saving) onToggle(payee.id, on);
              }}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 border-ink px-4 text-left ${
                on ? "bg-ink text-paper" : "bg-paper text-ink active:bg-wash"
              }`}
            >
              <span
                aria-hidden
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  on ? "border-marigold bg-marigold text-ink" : "border-ink"
                }`}
              >
                {saving ? (
                  <Spinner className="size-4 border-2" />
                ) : on ? (
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
              <span className="flex-1 text-xl font-semibold">{payee.name}</span>
              <span className={`money text-lg ${on ? "text-marigold" : "text-graphite"}`}>
                {payee.dailyRateCents === null ? t.payees.noRate : t.payees.perDay(formatCents(payee.dailyRateCents))}
              </span>
            </button>
            {message && (
              <p role="status" className="px-1 text-base font-semibold">
                {message}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
