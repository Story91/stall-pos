"use client";

import { useState, type FormEvent } from "react";
import { MicButton, type MicState } from "@/components/sell/MicButton";
import { Spinner } from "@/components/ui";
import type { PayeeRow } from "@/lib/owner/types";
import { formatCents, parseDollars, plainAmount } from "@/lib/sell/format";

export type BillDraft = { payeeId?: string; amountCents?: number; note?: string };
export type BillInput = { payeeId: string; amountCents: number; note: string };

type Props = {
  payees: PayeeRow[];
  mic: MicState;
  micSupported: boolean;
  onPressStart(): void;
  onPressEnd(): void;
  /** The last transcript, when the form was filled from voice. */
  heard: string | null;
  voiceNotice: string | null;
  /** Prefill. The parent remounts the logger (new `key`) for each new draft. */
  draft: BillDraft | null;
  onSave(input: BillInput): Promise<{ ok: true } | { ok: false; message: string }>;
};

const field =
  "min-h-14 w-full rounded-xl border-2 border-ink bg-paper px-3 text-lg focus:bg-marigold-soft focus:outline-none";

export function BillLogger(props: Props) {
  const { payees, draft, heard, voiceNotice, onSave } = props;
  const [payeeId, setPayeeId] = useState(draft?.payeeId ?? "");
  const [amount, setAmount] = useState(draft?.amountCents ? plainAmount(draft.amountCents) : "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const cents = parseDollars(amount);
  const ready = payeeId !== "" && cents !== null && note.trim() !== "" && !saving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || cents === null) return;
    setSaving(true);
    setResult(null);
    const outcome = await onSave({ payeeId, amountCents: cents, note: note.trim() });
    setSaving(false);
    if (!outcome.ok) {
      setResult({ ok: false, text: outcome.message });
      return;
    }
    const name = payees.find((p) => p.id === payeeId)?.name ?? "Bill";
    setResult({ ok: true, text: `Saved: ${name} ${formatCents(cents)} for ${note.trim()}.` });
    setAmount("");
    setNote("");
  };

  return (
    <div className="flex flex-col gap-4">
      <MicButton
        state={props.mic}
        supported={props.micSupported}
        size="compact"
        idleLabel="Hold and say the bill"
        busyLabel="Reading the bill…"
        onPressStart={props.onPressStart}
        onPressEnd={props.onPressEnd}
      />
      {voiceNotice && (
        <p role="alert" className="rounded-xl bg-ink p-3 text-lg text-paper">
          {voiceNotice}
        </p>
      )}

      <form
        onSubmit={submit}
        className={`flex flex-col gap-3 rounded-2xl p-3 ${heard ? "bg-marigold-soft" : "bg-wash"}`}
      >
        {heard ? (
          <p className="text-lg">
            Heard <q className="font-semibold">{heard}</q>. Check it, then save.
          </p>
        ) : (
          <p className="text-lg text-graphite">
            Or fill it in, like <q className="text-ink">Rosa, 240 dollars for tortillas</q>.
          </p>
        )}
        <label className="flex flex-col gap-1 text-base font-medium">
          Who
          <select value={payeeId} onChange={(e) => setPayeeId(e.target.value)} className={field}>
            <option value="">Pick a person or supplier</option>
            {payees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <label className="flex flex-col gap-1 text-base font-medium">
            Amount
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              className={`money text-xl ${field}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-base font-medium">
            What for
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={140}
              placeholder="Tortillas"
              autoComplete="off"
              className={field}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={!ready}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ink text-xl font-bold text-paper disabled:opacity-40"
        >
          {saving && <Spinner />}
          Save bill
        </button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className="text-lg font-semibold">
            {result.text}
          </p>
        )}
      </form>
    </div>
  );
}
