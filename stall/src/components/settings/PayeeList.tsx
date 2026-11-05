"use client";

import { useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n/useT";
import type { PayeeRow } from "@/lib/owner/types";
import { formatCents, parseDollars, plainAmount } from "@/lib/sell/format";

/** The ceiling the server enforces for one person in a day ($1,000). */
const MAX_DAY_CENTS = 100_000;

export type PayeePatch = { dailyRateCents?: number | null; maxPerDayCents?: number; autoPay?: boolean };
type Save = (id: string, patch: PayeePatch) => Promise<{ ok: true } | { ok: false; message: string }>;

const field =
  "money min-h-14 w-full rounded-xl border-2 border-ink bg-paper px-3 text-xl focus:bg-marigold-soft focus:outline-none";

/** People and suppliers as stacked cards: readable at 390px, each editable in place. */
export function PayeeList({ payees, onSave }: { payees: PayeeRow[]; onSave: Save }) {
  const t = useT();
  if (payees.length === 0) return <p className="text-lg">{t.settings.people.empty}</p>;
  return (
    <ul className="flex flex-col border-t-2 border-ink">
      {payees.map((p) => (
        <PayeeCard key={`${p.id}-${p.dailyRateCents}-${p.maxPerDayCents}-${p.autoPay}`} payee={p} onSave={onSave} />
      ))}
    </ul>
  );
}

function PayeeCard({ payee, onSave }: { payee: PayeeRow; onSave: Save }) {
  const t = useT();
  const c = t.settings.people;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const helper = payee.role === "helper";

  return (
    <li className="flex flex-col gap-2 border-b border-rule py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold">
            {payee.name}
            <span className="ml-2 text-base font-normal text-graphite">{helper ? t.common.helper : t.common.supplier}</span>
          </p>
          <p className="truncate text-base text-graphite">{payee.email}</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
            aria-label={c.editTitle(payee.name)}
            className="min-h-12 shrink-0 rounded-xl border-2 border-ink px-4 text-lg font-semibold"
          >
            {c.edit}
          </button>
        )}
      </div>

      {editing ? (
        <PayeeForm
          payee={payee}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            const outcome = await onSave(payee.id, patch);
            if (outcome.ok) {
              setEditing(false);
              setSaved(true);
            }
            return outcome;
          }}
        />
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-base">
          <Fact label={c.dayRate} value={payee.dailyRateCents === null ? c.byBill : formatCents(payee.dailyRateCents)} />
          <Fact label={c.maxDay} value={formatCents(payee.maxPerDayCents)} />
          <Fact label={c.autoPay} value={payee.autoPay ? t.common.yes : c.asksYou} />
        </dl>
      )}
      {saved && (
        <p role="status" className="text-base font-semibold">
          {c.saved}
        </p>
      )}
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-wash px-3 py-2">
      <dt className="truncate text-sm text-graphite">{label}</dt>
      <dd className="money truncate text-lg font-bold">{value}</dd>
    </div>
  );
}

function PayeeForm({
  payee,
  onCancel,
  onSave,
}: {
  payee: PayeeRow;
  onCancel(): void;
  onSave(patch: PayeePatch): Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const t = useT();
  const c = t.settings.people;
  const helper = payee.role === "helper";
  const [rate, setRate] = useState(payee.dailyRateCents === null ? "" : plainAmount(payee.dailyRateCents));
  const [max, setMax] = useState(plainAmount(payee.maxPerDayCents));
  const [autoPay, setAutoPay] = useState(payee.autoPay);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rateCents = rate.trim() === "" ? null : parseDollars(rate);
  const maxCents = parseDollars(max);
  const rateOk = rate.trim() === "" || rateCents !== null;
  const maxOk = maxCents !== null && maxCents <= MAX_DAY_CENTS;
  const fits = rateCents === null || maxCents === null || rateCents <= maxCents;
  const ready = rateOk && maxOk && fits && !saving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || maxCents === null) return;
    setSaving(true);
    setError(null);
    const patch: PayeePatch = { maxPerDayCents: maxCents, autoPay };
    if (helper) patch.dailyRateCents = rateCents;
    const outcome = await onSave(patch);
    setSaving(false);
    if (!outcome.ok) setError(outcome.message);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-wash p-3">
      {helper && (
        <label className="flex flex-col gap-1 text-base font-medium">
          {c.dayRate}
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder={c.byBill}
            aria-invalid={!rateOk}
            className={field}
          />
          <span className="text-sm text-graphite">{c.rateHint}</span>
        </label>
      )}
      <label className="flex flex-col gap-1 text-base font-medium">
        {c.maxDay}
        <input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          inputMode="decimal"
          aria-invalid={!maxOk}
          className={field}
        />
        <span className="text-sm text-graphite">{c.maxHint}</span>
      </label>
      <label className="flex min-h-14 items-center gap-3 text-lg font-medium">
        <input
          type="checkbox"
          checked={autoPay}
          onChange={(e) => setAutoPay(e.target.checked)}
          className="size-7 shrink-0 accent-ink"
        />
        <span>
          {c.autoPay}
          <span className="block text-sm font-normal text-graphite">{c.autoPayHelp}</span>
        </span>
      </label>
      {!fits && <p className="text-base font-semibold">{t.errors.rateOverLimit}</p>}
      {error && (
        <p role="alert" className="text-base font-semibold">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold"
        >
          {c.cancel}
        </button>
        <button
          type="submit"
          disabled={!ready}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ink text-lg font-bold text-paper disabled:opacity-40"
        >
          {saving && <Spinner />}
          {c.save}
        </button>
      </div>
    </form>
  );
}
