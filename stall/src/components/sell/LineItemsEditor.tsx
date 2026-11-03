"use client";

import { useRef, useState, type ReactNode } from "react";
import type { TipPct } from "@/components/sell/TipToggle";
import { computeTotals } from "@/lib/money";
import { formatCents, MAX_PRICE_CENTS, parseDollars } from "@/lib/sell/format";
import { canCharge, LOW_CONFIDENCE, type ItemRow } from "@/lib/sell/rows";

const MAX_QTY = 999;
const SWIPE_DELETE_PX = 96;

type Props = {
  rows: ItemRow[];
  onRowsChange(rows: ItemRow[]): void;
  /** null while the business settings load: tax is then left to the server. */
  taxRate: number | null;
  tipPct: TipPct;
  charging: boolean;
  onCharge(): void;
  /** Rendered between the items and the totals (the tip choice). */
  tip?: ReactNode;
};

export function totalsFor(rows: ItemRow[], taxRate: number | null, tipPct: TipPct) {
  const lines = rows.map((row) => ({
    name: row.name,
    qty: row.qty,
    unitCents: row.unitCents ?? 0,
    taxable: row.taxable,
  }));
  return computeTotals(lines, taxRate ?? 0, tipPct);
}

export function LineItemsEditor({
  rows,
  onRowsChange,
  taxRate,
  tipPct,
  charging,
  onCharge,
  tip,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const totals = totalsFor(rows, taxRate, tipPct);
  const ready = canCharge(rows);
  const missingPrice = rows.some((row) => row.unitCents === null);

  const update = (id: string, patch: Partial<ItemRow>) =>
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const remove = (id: string) => onRowsChange(rows.filter((row) => row.id !== id));

  return (
    <section aria-label="Order" className="flex flex-col gap-5">
      {rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-rule px-4 py-6 text-lg text-graphite">
          The ticket is empty. Hold the mic and say the order again.
        </p>
      ) : (
        <ul className="border-t-2 border-ink">
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              open={editingId === row.id || row.unitCents === null}
              onToggle={() => setEditingId((id) => (id === row.id ? null : row.id))}
              onFocusEditor={() => setEditingId(row.id)}
              onChange={(patch) => update(row.id, patch)}
              onRemove={() => remove(row.id)}
            />
          ))}
        </ul>
      )}

      {tip}

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-lg text-graphite">
        <dt>Subtotal</dt>
        <dd className="money text-right text-xl">{formatCents(totals.subtotalCents)}</dd>
        <dt>Tax</dt>
        <dd className="money text-right text-xl">
          {taxRate === null ? "added at charge" : formatCents(totals.taxCents)}
        </dd>
        {totals.tipCents > 0 && (
          <>
            <dt>Tip</dt>
            <dd className="money text-right text-xl">{formatCents(totals.tipCents)}</dd>
          </>
        )}
      </dl>

      <button
        type="button"
        onClick={onCharge}
        disabled={!ready || charging}
        aria-busy={charging}
        className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-marigold px-6 text-ink shadow-[0_4px_0_0_var(--color-ink)] active:translate-y-1 active:shadow-none disabled:bg-wash disabled:text-graphite disabled:shadow-none"
      >
        {charging ? (
          <>
            <span
              aria-hidden
              className="size-6 animate-spin rounded-full border-4 border-ink border-t-transparent motion-reduce:animate-none"
            />
            <span className="text-2xl font-semibold">Creating PayPal invoice…</span>
          </>
        ) : (
          <span className="money text-4xl font-bold">Charge {formatCents(totals.totalCents)}</span>
        )}
      </button>
      {missingPrice && (
        <p className="-mt-2 text-center text-base font-medium">
          Add a price to every item to charge.
        </p>
      )}
    </section>
  );
}

type RowProps = {
  row: ItemRow;
  open: boolean;
  onToggle(): void;
  onFocusEditor(): void;
  onChange(patch: Partial<ItemRow>): void;
  onRemove(): void;
};

function Row({ row, open, onToggle, onFocusEditor, onChange, onRemove }: RowProps) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const needsPrice = row.unitCents === null;
  const unsure = row.confidence < LOW_CONFIDENCE;

  return (
    <li
      className="relative overflow-hidden border-b border-rule"
      onPointerDown={(e) => {
        // Dragging across the price field selects text; it must never delete the row.
        if ((e.target as HTMLElement).closest("input")) return;
        start.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const moveX = e.clientX - start.current.x;
        if (moveX < -12 && Math.abs(moveX) > Math.abs(e.clientY - start.current.y)) {
          swiped.current = true;
          setDx(Math.max(moveX, -160));
        }
      }}
      onPointerUp={() => {
        if (dx <= -SWIPE_DELETE_PX) onRemove();
        start.current = null;
        setDx(0);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
      style={{ touchAction: "pan-y" }}
    >
      {dx < 0 && (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-end bg-ink pr-5 text-lg font-semibold text-paper"
        >
          {dx <= -SWIPE_DELETE_PX ? "Let go to remove" : "Remove"}
        </div>
      )}
      <div
        className={`relative bg-paper ${needsPrice ? "pl-3" : ""}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      >
        {needsPrice && <span aria-hidden className="hazard absolute inset-y-0 left-0 w-2" />}
        <div className="flex items-stretch">
          <button
            type="button"
            aria-label={`Edit ${row.name}`}
            aria-expanded={open}
            onClick={() => {
              if (swiped.current) return;
              onToggle();
            }}
            className="flex min-h-16 flex-1 items-center gap-3 py-2 pr-2 text-left"
          >
            <span className="money w-12 shrink-0 text-3xl font-bold">{row.qty}×</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={`text-xl font-semibold leading-tight ${
                  unsure ? "underline decoration-marigold decoration-4 underline-offset-4" : ""
                }`}
              >
                {row.name}
              </span>
              {needsPrice && (
                <span className="mt-1 self-start rounded-md bg-marigold px-2 py-0.5 text-base font-bold">
                  Needs a price
                </span>
              )}
              {unsure && <span className="text-sm text-graphite">Check this one</span>}
            </span>
            {!needsPrice && (
              <span className="money shrink-0 text-2xl font-semibold">
                {formatCents(row.qty * (row.unitCents ?? 0))}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label={`Remove ${row.name}`}
            onClick={onRemove}
            className="flex w-14 shrink-0 items-center justify-center text-2xl text-graphite active:text-ink"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        {open && (
          <div className="flex flex-wrap items-center gap-3 pb-4">
            <div className="flex items-center rounded-xl border-2 border-ink">
              <button
                type="button"
                aria-label={`One less ${row.name}`}
                disabled={row.qty <= 1}
                onClick={() => onChange({ qty: row.qty - 1 })}
                className="size-14 text-3xl font-bold disabled:text-rule"
              >
                −
              </button>
              <span className="money w-12 text-center text-3xl font-bold" aria-live="polite">
                {row.qty}
              </span>
              <button
                type="button"
                aria-label={`One more ${row.name}`}
                disabled={row.qty >= MAX_QTY}
                onClick={() => onChange({ qty: row.qty + 1 })}
                className="size-14 text-3xl font-bold disabled:text-rule"
              >
                +
              </button>
            </div>
            <PriceField
              name={row.name}
              cents={row.unitCents}
              onFocus={onFocusEditor}
              onPrice={(unitCents) => onChange({ unitCents })}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function PriceField({
  name,
  cents,
  onFocus,
  onPrice,
}: {
  name: string;
  cents: number | null;
  onFocus(): void;
  onPrice(cents: number | null): void;
}) {
  // Local text so a half-typed "4." is not reformatted under the owner's thumb.
  const [text, setText] = useState(cents === null ? "" : (cents / 100).toFixed(2));
  const tooHigh = Number(text.replace(/[$\s]/g, "").replace(",", ".")) * 100 > MAX_PRICE_CENTS;
  return (
    <div className="flex flex-1 flex-col gap-1">
      <label className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-ink px-3 focus-within:bg-marigold-soft">
        <span className="money text-2xl" aria-hidden>
          $
        </span>
        <input
          aria-label={`Price for ${name}`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={text}
          onFocus={onFocus}
          onChange={(e) => {
            setText(e.target.value);
            onPrice(parseDollars(e.target.value));
          }}
          className="money w-full min-w-0 bg-transparent text-2xl font-semibold outline-none placeholder:text-rule"
        />
        <span className="text-base text-graphite">each</span>
      </label>
      {tooHigh && (
        <p role="alert" className="text-base font-semibold">
          A price can be at most {formatCents(MAX_PRICE_CENTS)}.
        </p>
      )}
    </div>
  );
}
