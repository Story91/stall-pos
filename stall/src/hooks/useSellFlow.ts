"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { TipPct } from "@/components/sell/TipToggle";
import type { MicState } from "@/components/sell/MicButton";
import type { Language } from "@/lib/parse/schema";
import { sellApi, type BusinessInfo, type ChargeResponse, type FailureKind, type LastSale } from "@/lib/sell/api";
import { isCancelIntent } from "@/lib/sell/cancelIntent";
import { confirmationText } from "@/lib/sell/confirmationText";
import { messagesFor } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useT";
import { writeLanguage } from "@/lib/sell/languageStore";
import { canCharge, rowsToLines, toRows, type ItemRow } from "@/lib/sell/rows";
import { speak } from "@/lib/voice/speak";
import {
  isRecognitionSupported,
  startTranscription,
  type TranscriptionHandle,
} from "@/lib/voice/transcribe";

export type Notice =
  | { kind: "mic-denied" }
  | { kind: "no-speech" }
  | { kind: "no-order"; transcript: string }
  | { kind: "retry"; cause: Exclude<FailureKind, "no-order">; action: "parse" | "charge" };

export type QrStage = { sale: ChargeResponse; language: Language };

/** "Cancel that sale": find today's last sale, confirm, then cancel it. */
export type CancelStage =
  | { step: "finding" }
  | { step: "none" }
  | { step: "confirm"; sale: LastSale }
  | { step: "working"; sale: LastSale }
  | { step: "done"; sale: LastSale; was: "awaiting" | "paid_cash" | "draft" }
  /** Paid through PayPal: refunded from PayPal, not from here. */
  | { step: "paypal"; sale: LastSale }
  | { step: "failed"; sale: LastSale; reason: "changed" | "gone" | "paypal" | "network" };

const noopSubscribe = () => () => {};

export function useSellFlow() {
  const language = useLanguage();
  const micSupported = useSyncExternalStore(noopSubscribe, isRecognitionSupported, () => true);

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [rows, setRowsState] = useState<ItemRow[]>([]);
  const [tipPct, setTipState] = useState<TipPct>(null);
  const [transcript, setTranscript] = useState("");
  const [saleLanguage, setSaleLanguage] = useState<Language>(language);
  const [mic, setMic] = useState<MicState>("idle");
  const [parsing, setParsing] = useState(false);
  const [charging, setCharging] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [qr, setQr] = useState<QrStage | null>(null);
  const [cashPending, setCashPending] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [paidCash, setPaidCash] = useState(false);
  const [cancel, setCancel] = useState<CancelStage | null>(null);

  // One draftId per sale: every Charge retry of the same ticket reuses it, so
  // the server and PayPal dedupe. Editing the ticket after an attempt makes it
  // a different charge body, so it gets a fresh id.
  const draftId = useRef<string | null>(null);
  const attempted = useRef(false);
  const chargingNow = useRef(false);
  const handle = useRef<TranscriptionHandle | null>(null);
  const parseSeq = useRef(0);
  const lastParse = useRef<{ transcript: string; language: Language } | null>(null);

  useEffect(() => {
    let live = true;
    void sellApi.business().then((result) => {
      if (live && result.ok) setBusiness(result.data);
    });
    return () => {
      live = false;
      handle.current?.stop();
    };
  }, []);

  // Accepted for the hackathon: if a charge's response was lost ("network") and
  // the owner then edits, the new draftId can create a second invoice; the Day
  // view will show the orphan as awaiting.
  const touchTicket = () => {
    if (attempted.current) {
      draftId.current = crypto.randomUUID();
      attempted.current = false;
    }
  };
  const setRows = (next: ItemRow[]) => {
    touchTicket();
    // A "try again" for the old ticket no longer applies to the edited one.
    setNotice((current) => (current?.kind === "retry" ? null : current));
    setRowsState(next);
  };
  const setTip = (next: TipPct) => {
    touchTicket();
    setTipState(next);
  };

  const findLastSale = useCallback(async () => {
    setCancel({ step: "finding" });
    const result = await sellApi.lastSale();
    if (!result.ok) return setCancel({ step: "none" });
    const sale = result.data.sale;
    if (!sale) return setCancel({ step: "none" });
    setCancel(sale.status === "paid" ? { step: "paypal", sale } : { step: "confirm", sale });
  }, []);

  const parse = useCallback(async (text: string, lang: Language) => {
    if (isCancelIntent(text)) {
      // A command, not an order: nothing is sent to the parser.
      ++parseSeq.current;
      setTranscript(text);
      setNotice(null);
      setRowsState([]);
      void findLastSale();
      return;
    }
    setCancel(null);
    const seq = ++parseSeq.current;
    lastParse.current = { transcript: text, language: lang };
    setTranscript(text);
    setNotice(null);
    setParsing(true);
    const result = await sellApi.parse(text, lang);
    if (seq !== parseSeq.current) return; // a newer order replaced this one
    setParsing(false);
    if (!result.ok) {
      setNotice(
        result.kind === "no-order"
          ? { kind: "no-order", transcript: text }
          : { kind: "retry", cause: result.kind, action: "parse" },
      );
      return;
    }
    if (result.data.items.length === 0) {
      setNotice({ kind: "no-order", transcript: text });
      return;
    }
    draftId.current = crypto.randomUUID();
    attempted.current = false;
    setRowsState(toRows(result.data.items));
    setSaleLanguage(result.data.language);
  }, [findLastSale]);

  const runCancel = async (sale: LastSale): Promise<boolean> => {
    setCancel({ step: "working", sale });
    const result = await sellApi.cancel(sale.saleId);
    if (result.ok) {
      setCancel({ step: "done", sale, was: result.was });
      return true;
    }
    if (result.kind === "paid_paypal") setCancel({ step: "paypal", sale });
    else if (result.kind === "changed" || result.kind === "already_cancelled") setCancel({ step: "failed", sale, reason: "changed" });
    else if (result.kind === "not_found") setCancel({ step: "failed", sale, reason: "gone" });
    else if (result.kind === "network") setCancel({ step: "failed", sale, reason: "network" });
    else setCancel({ step: "failed", sale, reason: "paypal" });
    return false;
  };

  const confirmCancel = () => {
    if (cancel?.step === "confirm" || cancel?.step === "failed") void runCancel(cancel.sale);
  };

  /** From the QR screen: the customer walked away before paying. */
  const cancelCurrent = async () => {
    if (!qr) return;
    const sale: LastSale = {
      saleId: qr.sale.saleId,
      invoiceNumber: null,
      totalCents: qr.sale.totalCents,
      status: "awaiting",
      items: rows.map((r) => `${r.qty} ${r.name}`).join(", "),
      createdAt: new Date().toISOString(),
    };
    // Start clean (the ticket is gone either way); the cancel card says what happened.
    newSale();
    await runCancel(sale);
  };

  const pressStart = () => {
    handle.current?.stop();
    setNotice(null);
    setMic("listening");
    const lang = language;
    handle.current = startTranscription({
      language: lang,
      onResult(text) {
        handle.current = null;
        setMic("idle");
        if (text) void parse(text, lang);
        else setNotice({ kind: "no-speech" });
      },
      onError(error) {
        handle.current = null;
        setMic("idle");
        setNotice(error === "denied" ? { kind: "mic-denied" } : { kind: "no-speech" });
      },
    });
  };

  const pressEnd = () => {
    handle.current?.finish();
  };

  const charge = async () => {
    // Ref, not state: two taps in the same frame both see charging === false.
    if (chargingNow.current || !canCharge(rows)) return;
    const lines = rowsToLines(rows);
    draftId.current ??= crypto.randomUUID();
    attempted.current = true;
    chargingNow.current = true;
    setCharging(true);
    setNotice(null);
    const result = await sellApi.charge({
      draftId: draftId.current,
      lines,
      tipPct,
      language: saleLanguage,
      transcript,
    });
    chargingNow.current = false;
    setCharging(false);
    if (!result.ok) {
      setNotice({
        kind: "retry",
        cause: result.kind === "no-order" ? "server" : result.kind,
        action: "charge",
      });
      return;
    }
    setQr({ sale: result.data, language: saleLanguage });
  };

  const retry = () => {
    if (notice?.kind !== "retry") return;
    if (notice.action === "charge") void charge();
    else if (lastParse.current) void parse(lastParse.current.transcript, lastParse.current.language);
  };

  const payCash = async () => {
    if (!qr || cashPending) return;
    setCashPending(true);
    setCashError(null);
    const result = await sellApi.cash(qr.sale.saleId);
    setCashPending(false);
    const t = messagesFor(language);
    if (result.ok) setPaidCash(true);
    else if (result.kind === "conflict") setCashError(t.sell.cashConflict);
    else if (result.kind === "network") setCashError(t.common.noConnection);
    else setCashError(t.sell.cashFailed);
  };

  // "Paid" is said in the language the screen is in now, so text and voice never disagree
  // (the sale keeps the language its order was spoken in, for the record).
  const announcePaid = useCallback(() => {
    if (!qr) return;
    speak(confirmationText(language, qr.sale.totalCents), language);
    navigator.vibrate?.(200);
  }, [qr, language]);

  const newSale = () => {
    handle.current?.stop();
    handle.current = null;
    parseSeq.current++;
    draftId.current = null;
    attempted.current = false;
    lastParse.current = null;
    setRowsState([]);
    setTipState(null);
    setTranscript("");
    setMic("idle");
    setParsing(false);
    chargingNow.current = false;
    setCharging(false);
    setNotice(null);
    setQr(null);
    setCashPending(false);
    setCashError(null);
    setPaidCash(false);
    setCancel(null);
  };

  return {
    language,
    setLanguage: writeLanguage,
    micSupported,
    business,
    rows,
    setRows,
    tipPct,
    setTip,
    transcript,
    mic: parsing ? ("busy" as const) : mic,
    parsing,
    charging,
    notice,
    pressStart,
    pressEnd,
    submitText: (text: string) => void parse(text.trim(), language),
    charge: () => void charge(),
    retry,
    qr,
    cashPending,
    cashError,
    paidCash,
    payCash: () => void payCash(),
    announcePaid,
    newSale,
    cancel,
    confirmCancel,
    cancelCurrent: () => void cancelCurrent(),
    dismissCancel: () => setCancel(null),
  };
}
