"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PAYOUT_POLL_MS } from "@/hooks/useClose";
import type { BillDraft, BillInput } from "@/components/day/BillLogger";
import type { MicState } from "@/components/sell/MicButton";
import { failureText, ownerCall, send } from "@/lib/owner/api";
import type { BusinessView, DayView, PayeeRow } from "@/lib/owner/types";
import { messagesFor } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useT";
import type { Language } from "@/lib/parse/schema";
import { readLanguage } from "@/lib/sell/languageStore";
import { isRecognitionSupported, startTranscription, type TranscriptionHandle } from "@/lib/voice/transcribe";

type Parsed =
  | { kind: "shift"; payeeId: string }
  | { kind: "bill"; payeeId: string; amountCents?: number; note?: string }
  | { kind: "none"; reason?: string };

export type ShiftSuggestion = { payeeId: string; name: string };

const noopSubscribe = () => () => {};

type Loaded =
  | { ok: true; business: BusinessView; payees: PayeeRow[]; day: DayView; language: Language }
  | { ok: false; message: string };

/** The day, with payout reasons worded in `language`. */
const dayUrl = (date: string, language: Language) => `/api/day/${date}?language=${language}`;

async function fetchDayScreen(): Promise<Loaded> {
  const [biz, people] = await Promise.all([
    ownerCall<BusinessView>("/api/business"),
    ownerCall<PayeeRow[]>("/api/payees"),
  ]);
  // Read at call time: this runs outside render, after the owner's language is known.
  const language = readLanguage();
  if (!biz.ok) return { ok: false, message: failureText(biz, language) };
  if (!people.ok) return { ok: false, message: failureText(people, language) };
  const day = await ownerCall<DayView>(dayUrl(biz.data.today, language));
  if (!day.ok) return { ok: false, message: failureText(day, language) };
  return { ok: true, business: biz.data, payees: people.data, day: day.data, language };
}

/** Everything the Day screen reads and does: today's sales, shifts, bills, payouts, decisions. */
export function useDay() {
  const language = useLanguage();
  const t = messagesFor(language);
  // Errors are worded when they happen, in the language chosen at that moment.
  const failed = (failure: { status: number; code: string }) => failureText(failure, language);
  const micSupported = useSyncExternalStore(noopSubscribe, isRecognitionSupported, () => true);

  const [business, setBusiness] = useState<BusinessView | null>(null);
  const [day, setDay] = useState<DayView | null>(null);
  const [payees, setPayees] = useState<PayeeRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [shiftMessages, setShiftMessages] = useState<Record<string, string>>({});

  const [mic, setMic] = useState<MicState>("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ key: number; value: BillDraft | null }>({ key: 0, value: null });
  const [suggestion, setSuggestion] = useState<ShiftSuggestion | null>(null);
  const handle = useRef<TranscriptionHandle | null>(null);

  // The language the shown day was worded in; a switch refetches it.
  const shownLanguage = useRef<Language | null>(null);

  const refreshDay = useCallback(async (date: string) => {
    const wanted = readLanguage();
    const result = await ownerCall<DayView>(dayUrl(date, wanted));
    if (result.ok) {
      shownLanguage.current = wanted;
      setDay(result.data);
      setLoadError(null);
    } else setLoadError(failureText(result, readLanguage()));
  }, []);

  const apply = useCallback((loaded: Loaded) => {
    if (!loaded.ok) return setLoadError(loaded.message);
    shownLanguage.current = loaded.language;
    setBusiness(loaded.business);
    setPayees(loaded.payees);
    setDay(loaded.day);
    setLoadError(null);
  }, []);

  useEffect(() => {
    void fetchDayScreen().then(apply);
    return () => handle.current?.stop();
  }, [apply]);

  useEffect(() => {
    if (!business || shownLanguage.current === null || shownLanguage.current === language) return;
    void refreshDay(business.today);
  }, [language, business, refreshDay]);

  // While a payout is still sending, ask again every few seconds (the day view
  // asks PayPal for its status), so "Sending" turns into "Paid" without a reload.
  const today = business?.today ?? null;
  const sending = day?.payouts.some((p) => p.status === "PENDING") ?? false;
  useEffect(() => {
    if (!sending || !today) return;
    const timer = setInterval(() => void refreshDay(today), PAYOUT_POLL_MS);
    return () => clearInterval(timer);
  }, [sending, today, refreshDay]);

  const mark = (payeeId: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(payeeId);
      else next.delete(payeeId);
      return next;
    });

  const toggleShift = async (payeeId: string, worked: boolean) => {
    if (!business) return;
    mark(payeeId, true);
    setShiftMessages((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== payeeId)));
    const date = business.today;
    const result = worked
      ? await ownerCall(`/api/shifts?payeeId=${payeeId}&date=${date}`, { method: "DELETE" })
      : await ownerCall("/api/shifts", send("POST", { payeeId, date }));
    if (!result.ok) setShiftMessages((m) => ({ ...m, [payeeId]: failed(result) }));
    await refreshDay(date);
    mark(payeeId, false);
  };

  const saveBill = async (input: BillInput) => {
    if (!business) return { ok: false as const, message: t.day.stillLoading };
    const result = await ownerCall("/api/bills", send("POST", { ...input, date: business.today }));
    if (!result.ok) return { ok: false as const, message: failed(result) };
    setHeard(null);
    await refreshDay(business.today);
    return { ok: true as const };
  };

  const applyParsed = (parsed: Parsed, transcript: string) => {
    if (parsed.kind === "none") {
      setVoiceNotice(t.day.noBillOrShift(transcript));
      return;
    }
    if (parsed.kind === "shift") {
      const name = payees.find((p) => p.id === parsed.payeeId)?.name ?? t.day.thisHelper;
      setSuggestion({ payeeId: parsed.payeeId, name });
      return;
    }
    setHeard(transcript);
    setDraft((d) => ({
      key: d.key + 1,
      value: { payeeId: parsed.payeeId, amountCents: parsed.amountCents, note: parsed.note },
    }));
  };

  const pressStart = () => {
    handle.current?.stop();
    setVoiceNotice(null);
    setSuggestion(null);
    setMic("listening");
    handle.current = startTranscription({
      language,
      async onResult(text) {
        handle.current = null;
        if (!text) {
          setMic("idle");
          setVoiceNotice(t.sell.noSpeech);
          return;
        }
        setMic("busy");
        const result = await ownerCall<Parsed>(
          "/api/obligations/parse",
          send("POST", { transcript: text, language }),
        );
        setMic("idle");
        if (result.ok) applyParsed(result.data, text);
        else setVoiceNotice(failed(result));
      },
      onError(error) {
        handle.current = null;
        setMic("idle");
        setVoiceNotice(
          error === "denied" ? t.day.micDenied : t.sell.noSpeech,
        );
      },
    });
  };

  const confirmShift = async () => {
    if (!suggestion) return;
    const { payeeId } = suggestion;
    setSuggestion(null);
    await toggleShift(payeeId, false);
  };

  return {
    business,
    day,
    payees,
    loadError,
    reload: () => void fetchDayScreen().then(apply),
    busy,
    shiftMessages,
    toggleShift: (payeeId: string, worked: boolean) => void toggleShift(payeeId, worked),
    saveBill,
    voice: {
      mic,
      micSupported,
      heard,
      notice: voiceNotice,
      draft,
      suggestion,
      pressStart,
      pressEnd: () => handle.current?.finish(),
      confirmShift: () => void confirmShift(),
      dismissShift: () => setSuggestion(null),
    },
  };
}
