"use client";

import { useEffect, useRef, useState } from "react";
import type { ShownStatus } from "@/hooks/useSaleStatus";
import { useT } from "@/lib/i18n/useT";
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
  cancelPending: boolean;
  /** Cancels the open invoice, then starts a new sale. */
  onCancelSale(): void;
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
  cancelPending,
  onCancelSale,
}: QrScreenProps) {
  const t = useT();
  const [confirmingCash, setConfirmingCash] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
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
    <section aria-label={t.qr.label} className="flex flex-col items-center gap-5 text-center">
      <div>
        <p className="text-lg text-graphite">{t.qr.total}</p>
        <p className="money text-7xl font-extrabold leading-none">{total}</p>
      </div>

      {/* Plain <img>: a data URL needs no optimisation and must not leave the device. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${qrPng}`}
        alt={t.qr.scanAlt(total)}
        className="aspect-square w-full max-w-72 rounded-2xl border-[6px] border-ink bg-paper p-2 [image-rendering:pixelated]"
      />

      <p role="status" className="flex items-center gap-3 text-2xl font-semibold">
        {cancelled ? (
          t.qr.cancelled
        ) : (
          <>
            <span aria-hidden className="listening-ring size-3 rounded-full bg-marigold" />
            {t.qr.waiting}
          </>
        )}
      </p>

      <button
        type="button"
        onClick={copy}
        className="flex min-h-14 w-full max-w-sm flex-col items-center justify-center rounded-xl border-2 border-ink px-4 py-2"
      >
        <span className="text-lg font-semibold">{copied ? t.qr.copied : t.qr.copy}</span>
        <span className="w-full truncate text-sm text-graphite">{payLink}</span>
      </button>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {confirmingCash ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-wash p-3">
            <p className="text-lg font-medium">{t.qr.cashQuestion(total)}</p>
            <button
              type="button"
              disabled={cashPending}
              onClick={onCash}
              className="min-h-14 rounded-xl bg-ink px-4 text-xl font-semibold text-paper disabled:opacity-60"
            >
              {cashPending ? t.qr.recordingCash : t.qr.yesCash(total)}
            </button>
            <button
              type="button"
              disabled={cashPending}
              onClick={() => setConfirmingCash(false)}
              className="min-h-14 rounded-xl px-4 text-lg font-medium"
            >
              {t.qr.notYet}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCash(true)}
            className="min-h-14 rounded-xl border-2 border-ink px-4 text-xl font-semibold"
          >
            {t.qr.paidInCash}
          </button>
        )}
        {cashError && (
          <p role="alert" className="rounded-xl bg-ink px-4 py-3 text-left text-lg text-paper">
            {cashError}
          </p>
        )}
        {cancelled ? (
          <button
            type="button"
            onClick={onNewSale}
            className="min-h-14 rounded-xl px-4 text-lg font-medium text-graphite underline underline-offset-4"
          >
            {t.qr.differentSale}
          </button>
        ) : confirmingCancel ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-wash p-3">
            <p className="text-lg font-medium">{t.qr.cancelQuestion}</p>
            <button
              type="button"
              disabled={cancelPending}
              onClick={onCancelSale}
              className="min-h-14 rounded-xl bg-ink px-4 text-xl font-semibold text-paper disabled:opacity-60"
            >
              {cancelPending ? t.qr.cancelling : t.qr.cancelYes}
            </button>
            <button
              type="button"
              disabled={cancelPending}
              onClick={() => setConfirmingCancel(false)}
              className="min-h-14 rounded-xl px-4 text-lg font-medium"
            >
              {t.qr.keepWaiting}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmingCash(false);
              setConfirmingCancel(true);
            }}
            className="min-h-14 rounded-xl px-4 text-lg font-medium text-graphite underline underline-offset-4"
          >
            {t.qr.differentSale}
          </button>
        )}
      </div>
    </section>
  );
}

function PaidView({ totalCents, status, onNewSale }: QrScreenProps) {
  const t = useT();
  return (
    <section
      aria-label={t.qr.paid}
      className="paid-in fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-marigold px-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
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
      <h1 className="money text-6xl font-extrabold">{t.qr.paid}</h1>
      <p className="money text-8xl font-extrabold leading-none">{formatCents(totalCents)}</p>
      <p className="text-2xl font-semibold">{status === "paid_cash" ? t.qr.cash : "PayPal"}</p>
      <button
        type="button"
        onClick={onNewSale}
        autoFocus
        className="mt-4 min-h-20 w-full max-w-sm rounded-2xl bg-ink px-6 text-3xl font-bold text-paper"
      >
        {t.qr.newSale}
      </button>
    </section>
  );
}
