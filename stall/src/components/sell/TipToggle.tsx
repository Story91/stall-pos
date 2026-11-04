"use client";

import { useT } from "@/lib/i18n/useT";
import { formatCents } from "@/lib/sell/format";

export type TipPct = 0 | 15 | 18 | 20 | null;

const OPTIONS = [0, 15, 18, 20] as const;

type Props = {
  value: TipPct;
  onChange(value: Exclude<TipPct, null>): void;
  /** Shows what each percentage adds, so the customer can pick by amount. */
  subtotalCents?: number;
};

export function TipToggle({ value, onChange, subtotalCents }: Props) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t.tip.label} className="grid grid-cols-4 gap-2">
      {OPTIONS.map((pct) => {
        const checked = value === pct;
        const amount =
          pct > 0 && subtotalCents !== undefined
            ? formatCents(Math.floor((subtotalCents * pct) / 100 + 0.5))
            : null;
        return (
          <button
            key={pct}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(pct)}
            className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-1 leading-tight ${
              checked
                ? "border-ink bg-ink text-paper"
                : "border-ink bg-paper text-ink active:bg-wash"
            }`}
          >
            {pct === 0 ? (
              <span className="text-lg font-semibold">{t.tip.none}</span>
            ) : (
              <>
                <span className="money text-2xl font-bold">{pct}%</span>
                {amount && (
                  <span className={`money text-sm ${checked ? "text-marigold" : "text-graphite"}`}>
                    {amount}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
