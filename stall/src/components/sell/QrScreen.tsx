"use client";

import { useEffect, useRef, useState } from "react";
import type { ShownStatus } from "@/hooks/useSaleStatus";
import { formatCents } from "@/lib/sell/format";

export type QrScreenProps = {
  /** Base64 PNG from PayPal's invoice QR endpoint. */
  qrPng: string;
  payLink: string;
  totalCents: number;
  status: ShownStatus;
  cashPending: boolean;
  cashError: string | null;
  onCash(): void;
  /** Called once, when the sale first shows as paid (sound and vibration live here). */
  onPaid(): void;
  onNewSale(): void;
};

export function QrScreen(props: QrScreenProps) {
  const { status, onPaid } = props;
  const paid = status === "paid" || status === "paid_cash";
  const announced = useRef(false);

  useEffect(() => {
    if (paid && !announced.current) {
      announced.current = true;
      onPaid();
    }
  }, [paid, onPaid]);

  return paid ? <PaidView {...props} /> : <WaitingView {...props} />;
}

function WaitingView({
  qrPng,
  payLink,
  totalCents,
  status,
  cashPending,
  cashError,
  onCash,
  onNewSale,
}: QrScreenProps) {
  const [confirmingCash, setConfirmingCash] = useState(false);
  const [copied, setCopied] = useState(false);
  const total = formatCents(totalCents);
  const cancelled = status === "cancelled";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-label="Payment" className="flex flex-col items-center gap-5 text-center">
      <div>
        <p className="text-lg text-graphite">Total</p>
        <p className="money text-7xl font-extrabold leading-none">{total}</p>
      </div>

      {/* Plain <img>: a data URL needs no optimisation and must not leave the device. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${qrPng}`}
        alt={`Scan to pay ${total} with PayPal`}
        className="aspect-square w-full max-w-72 rounded-2xl border-[6px] border-ink bg-paper p-2 [image-rendering:pixelated]"
      />

      <p role="status" className="flex items-center gap-3 text-2xl font-semibold">
        {cancelled ? (
          "This invoice was cancelled."
        ) : (
          <>
            <span aria-hidden className="listening-ring size-3 rounded-full bg-marigold" />
            Waiting for payment…
          </>
        )}
      </p>

      <button
        type="button"
        onClick={copy}
        className="flex min-h-14 w-full max-w-sm flex-col items-center justify-center rounded-xl border-2 border-ink px-4 py-2"
      >
        <span className="text-lg font-semibold">{copied ? "Pay link copied" : "Copy pay link"}</span>
        <span className="w-full truncate text-sm text-graphite">{payLink}</span>
      </button>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {confirmingCash ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-wash p-3">
            <p className="text-lg font-medium">Did the customer hand you {total} in cash?</p>
            <button
              type="button"
              disabled={cashPending}
              onClick={onCash}
              className="min-h-14 rounded-xl bg-ink px-4 text-xl font-semibold text-paper disabled:opacity-60"
            >
              {cashPending ? "Recording cash…" : `Yes, got ${total} cash`}
            </button>
            <button
              type="button"
              disabled={cashPending}
              onClick={() => setConfirmingCash(false)}
              className="min-h-14 rounded-xl px-4 text-lg font-medium"
            >
              Not yet
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCash(true)}
            className="min-h-14 rounded-xl border-2 border-ink px-4 text-xl font-semibold"
          >
            Paid in cash
          </button>
        )}
        {cashError && (
          <p role="alert" className="rounded-xl bg-ink px-4 py-3 text-left text-lg text-paper">
            {cashError}
          </p>
        )}
        <button
          type="button"
          onClick={onNewSale}
          className="min-h-14 rounded-xl px-4 text-lg font-medium text-graphite underline underline-offset-4"
        >
          Start a different sale
        </button>
      </div>
    </section>
  );
}

function PaidView({ totalCents, status, onNewSale }: QrScreenProps) {
  return (
    <section
      aria-label="Paid"
      className="paid-in fixed inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-marigold px-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
    >
      <svg aria-hidden viewBox="0 0 96 96" className="size-28">
        <circle cx="48" cy="48" r="44" fill="var(--color-ink)" />
        <path
          d="M28 50 L42 64 L70 34"
          fill="none"
          stroke="var(--color-marigold)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h1 className="money text-6xl font-extrabold">Paid</h1>
      <p className="money text-8xl font-extrabold leading-none">{formatCents(totalCents)}</p>
      <p className="text-2xl font-semibold">{status === "paid_cash" ? "Cash" : "PayPal"}</p>
      <button
        type="button"
        onClick={onNewSale}
        autoFocus
        className="mt-4 min-h-20 w-full max-w-sm rounded-2xl bg-ink px-6 text-3xl font-bold text-paper"
      >
        New sale
      </button>
    </section>
  );
}
