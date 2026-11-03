"use client";

import { useState, type FormEvent } from "react";
import { LanguagePicker } from "@/components/sell/LanguagePicker";
import { LineItemsEditor } from "@/components/sell/LineItemsEditor";
import { MicButton } from "@/components/sell/MicButton";
import { QrScreen } from "@/components/sell/QrScreen";
import { TipToggle } from "@/components/sell/TipToggle";
import { useSaleStatus } from "@/hooks/useSaleStatus";
import { useSellFlow, type Notice, type QrStage } from "@/hooks/useSellFlow";
import type { Language } from "@/lib/parse/schema";
import { computeTotals } from "@/lib/money";

const EXAMPLES: Record<Language, string> = {
  en: "Two tacos al pastor and an agua fresca",
  es: "Dos tacos al pastor y un agua fresca",
  pl: "Dwa tacos al pastor i agua fresca",
};

export default function SellPage() {
  const flow = useSellFlow();
  const hasTicket = flow.rows.length > 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pb-8">
      <header className="flex items-center justify-between gap-3 pt-3">
        <div className="min-w-0">
          <p className="money text-4xl font-extrabold leading-none">Stall</p>
          <p className="truncate text-base text-graphite">{flow.business?.name ?? " "}</p>
        </div>
        <LanguagePicker
          value={flow.language}
          onChange={flow.setLanguage}
          disabled={flow.mic === "listening"}
        />
      </header>

      {flow.qr ? (
        <PaymentStage
          stage={flow.qr}
          paidCash={flow.paidCash}
          cashPending={flow.cashPending}
          cashError={flow.cashError}
          onCash={flow.payCash}
          onPaid={flow.announcePaid}
          onNewSale={flow.newSale}
        />
      ) : (
        <>
          {flow.parsing ? (
            <TicketSkeleton transcript={flow.transcript} />
          ) : hasTicket ? (
            <>
              {flow.transcript && (
                <p className="text-lg text-graphite">
                  Heard <q className="text-ink">{flow.transcript}</q>
                </p>
              )}
              <LineItemsEditor
                rows={flow.rows}
                onRowsChange={flow.setRows}
                taxRate={flow.business?.taxRate ?? null}
                tipPct={flow.tipPct}
                charging={flow.charging}
                onCharge={flow.charge}
                tip={
                  <TipToggle
                    value={flow.tipPct}
                    onChange={flow.setTip}
                    subtotalCents={subtotal(flow.rows)}
                  />
                }
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
              <MicButton
                state={flow.mic}
                supported={flow.micSupported}
                size="hero"
                idleLabel="Hold to talk"
                onPressStart={flow.pressStart}
                onPressEnd={flow.pressEnd}
              />
              <p className="max-w-xs text-xl text-graphite">
                Say the order, like <q className="text-ink">{EXAMPLES[flow.language]}</q>
              </p>
            </div>
          )}

          {flow.notice && <NoticeBox notice={flow.notice} onRetry={flow.retry} />}

          {hasTicket && !flow.parsing && (
            <MicButton
              state={flow.mic}
              supported={flow.micSupported}
              size="compact"
              idleLabel="Say again: hold to talk"
              onPressStart={flow.pressStart}
              onPressEnd={flow.pressEnd}
            />
          )}

          <TypedOrder
            disabled={flow.parsing || flow.charging}
            placeholder={EXAMPLES[flow.language]}
            onSubmit={flow.submitText}
          />
        </>
      )}
    </main>
  );
}

function subtotal(rows: ReturnType<typeof useSellFlow>["rows"]): number {
  return computeTotals(
    rows.map((r) => ({ name: r.name, qty: r.qty, unitCents: r.unitCents ?? 0, taxable: r.taxable })),
    0,
    null,
  ).subtotalCents;
}

function PaymentStage({
  stage,
  paidCash,
  ...rest
}: {
  stage: QrStage;
  paidCash: boolean;
  cashPending: boolean;
  cashError: string | null;
  onCash(): void;
  onPaid(): void;
  onNewSale(): void;
}) {
  const { status } = useSaleStatus(stage.sale.saleId);
  return (
    <QrScreen
      qrPng={stage.sale.qrPng}
      payLink={stage.sale.payLink}
      totalCents={stage.sale.totalCents}
      status={paidCash ? "paid_cash" : status}
      {...rest}
    />
  );
}

function TicketSkeleton({ transcript }: { transcript: string }) {
  return (
    <section aria-label="Reading the order" aria-busy className="flex flex-col gap-4">
      <p className="text-lg text-graphite">
        Reading <q className="text-ink">{transcript}</q>
      </p>
      <ul aria-hidden className="border-t-2 border-ink">
        {[70, 55, 40].map((width) => (
          <li key={width} className="flex min-h-16 items-center gap-3 border-b border-rule">
            <span className="skeleton h-7 w-10 rounded-md bg-wash" />
            <span className="skeleton h-6 rounded-md bg-wash" style={{ width: `${width}%` }} />
            <span className="skeleton ml-auto h-7 w-16 rounded-md bg-wash" />
          </li>
        ))}
      </ul>
    </section>
  );
}

const RETRY_TEXT: Record<Extract<Notice, { kind: "retry" }>["cause"], string> = {
  paypal: "PayPal is not responding, try again.",
  network: "No connection. Check your signal and try again.",
  server: "Something went wrong on the server. Try again.",
  conflict: "Something went wrong on the server. Try again.",
  invalid: "The order was rejected. Check each item's quantity and price, then try again.",
};

function NoticeBox({ notice, onRetry }: { notice: Notice; onRetry(): void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-ink p-4 text-paper">
      {notice.kind === "mic-denied" && (
        <p className="text-lg">
          The microphone is blocked. Type the order in the box below, or allow the microphone for
          this site in your browser settings.
        </p>
      )}
      {notice.kind === "no-speech" && (
        <p className="text-lg">Didn&apos;t hear anything. Hold the button the whole time you talk.</p>
      )}
      {notice.kind === "no-order" && (
        <>
          <p className="text-xl font-semibold">I didn&apos;t catch an order.</p>
          <p className="text-lg">
            Heard <q className="text-marigold">{notice.transcript}</q>. Say it again or type it below.
          </p>
        </>
      )}
      {notice.kind === "retry" && (
        <>
          <p className="text-xl font-semibold">{RETRY_TEXT[notice.cause]}</p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-14 rounded-xl bg-marigold px-4 text-xl font-bold text-ink"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}

function TypedOrder({
  disabled,
  placeholder,
  onSubmit,
}: {
  disabled: boolean;
  placeholder: string;
  onSubmit(text: string): void;
}) {
  const [text, setText] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSubmit(text);
    setText("");
  };
  return (
    <form onSubmit={submit} className="mt-auto flex flex-col gap-2">
      <label htmlFor="typed-order" className="text-base font-medium text-graphite">
        Or type the order
      </label>
      <div className="flex gap-2">
        <input
          id="typed-order"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-ink px-3 text-lg placeholder:text-graphite/60 focus:bg-marigold-soft focus:outline-none"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="min-h-14 rounded-xl bg-ink px-5 text-lg font-bold text-paper disabled:opacity-40"
        >
          Read order
        </button>
      </div>
    </form>
  );
}
