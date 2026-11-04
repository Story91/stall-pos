"use client";

import { useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import type { BusinessView } from "@/lib/owner/types";

type Props = {
  business: BusinessView;
  onSave(patch: { name: string; taxRate: number }): Promise<{ ok: true } | { ok: false; message: string }>;
};

const field =
  "min-h-14 w-full rounded-xl border-2 border-ink bg-paper px-3 text-lg focus:bg-marigold-soft focus:outline-none";

/** "8.25" -> 0.0825, or null when it is not a percentage from 0 to 25. */
export function parsePercent(text: string): number | null {
  const cleaned = text.replace(/[%\s]/g, "").replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,4})?$/.test(cleaned)) return null;
  const pct = Number(cleaned);
  return pct <= 25 ? Number((pct / 100).toFixed(6)) : null;
}

function percentText(rate: number): string {
  return String(Number((rate * 100).toFixed(4)));
}

export function BusinessForm({ business, onSave }: Props) {
  const [name, setName] = useState(business.name);
  const [tax, setTax] = useState(percentText(business.taxRate));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const rate = parsePercent(tax);
  const changed = name.trim() !== business.name || rate !== business.taxRate;
  const ready = name.trim() !== "" && rate !== null && changed && !saving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || rate === null) return;
    setSaving(true);
    setResult(null);
    const outcome = await onSave({ name: name.trim(), taxRate: rate });
    setSaving(false);
    setResult(outcome.ok ? { ok: true, text: "Saved. New sales use these." } : { ok: false, text: outcome.message });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-base font-medium">
        Business name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-base font-medium">
        Sales tax, percent
        <input
          value={tax}
          onChange={(e) => setTax(e.target.value)}
          inputMode="decimal"
          aria-invalid={rate === null}
          className={`money text-xl ${field}`}
        />
      </label>
      {rate === null && <p className="text-base font-semibold">Enter a percentage from 0 to 25, like 8.25.</p>}
      <button
        type="submit"
        disabled={!ready}
        className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ink text-xl font-bold text-paper disabled:opacity-40"
      >
        {saving && <Spinner />}
        Save changes
      </button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className="text-lg font-semibold">
          {result.text}
        </p>
      )}
    </form>
  );
}
