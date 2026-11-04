"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BillDraft, BillInput } from "@/components/day/BillLogger";
import type { MicState } from "@/components/sell/MicButton";
import { failureText, ownerCall, send } from "@/lib/owner/api";
import type { BusinessView, DayView, PayeeRow } from "@/lib/owner/types";
import { readLanguage, subscribeLanguage } from "@/lib/sell/languageStore";
import { isRecognitionSupported, startTranscription, type TranscriptionHandle } from "@/lib/voice/transcribe";

type Parsed =
  | { kind: "shift"; payeeId: string }
  | { kind: "bill"; payeeId: string; amountCents?: number; note?: string }
  | { kind: "none"; reason?: string };

export type ShiftSuggestion = { payeeId: string; name: string };

const noopSubscribe = () => () => {};

type Loaded =
  | { ok: true; business: BusinessView; payees: PayeeRow[]; day: DayView }
  | { ok: false; message: string };

async function fetchDayScreen(): Promise<Loaded> {
  const [biz, people] = await Promise.all([
    ownerCall<BusinessView>("/api/business"),
    ownerCall<PayeeRow[]>("/api/payees"),
  ]);
  if (!biz.ok) return { ok: false, message: failureText(biz) };
  if (!people.ok) return { ok: false, message: failureText(people) };
  const day = await ownerCall<DayView>(`/api/day/${biz.data.today}`);
  if (!day.ok) return { ok: false, message: failureText(day) };
  return { ok: true, business: biz.data, payees: people.data, day: day.data };
}

/** Everything the Day screen reads and does: today's sales, shifts, bills, payouts, decisions. */
export function useDay() {
  const language = useSyncExternalStore(subscribeLanguage, readLanguage, () => "en" as const);
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

  const refreshDay = useCallback(async (date: string) => {
    const result = await ownerCall<DayView>(`/api/day/${date}`);
    if (result.ok) {
      setDay(result.data);
      setLoadError(null);
    } else setLoadError(failureText(result));
  }, []);

  const apply = useCallback((loaded: Loaded) => {
    if (!loaded.ok) return setLoadError(loaded.message);
    setBusiness(loaded.business);
    setPayees(loaded.payees);
    setDay(loaded.day);
    setLoadError(null);
  }, []);

  useEffect(() => {
    void fetchDayScreen().then(apply);
    return () => handle.current?.stop();
  }, [apply]);

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
    if (!result.ok) setShiftMessages((m) => ({ ...m, [payeeId]: failureText(result) }));
    await refreshDay(date);
    mark(payeeId, false);
  };

  const saveBill = async (input: BillInput) => {
    if (!business) return { ok: false as const, message: "Still loading. Try again in a moment." };
    const result = await ownerCall("/api/bills", send("POST", { ...input, date: business.today }));
    if (!result.ok) return { ok: false as const, message: failureText(result) };
    setHeard(null);
    await refreshDay(business.today);
    return { ok: true as const };
  };

  const applyParsed = (parsed: Parsed, transcript: string) => {
    if (parsed.kind === "none") {
      setVoiceNotice(`Didn't catch a bill or a shift in "${transcript}". Say it again or fill in the form.`);
      return;
    }
    if (parsed.kind === "shift") {
      const name = payees.find((p) => p.id === parsed.payeeId)?.name ?? "This helper";
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
          setVoiceNotice("Didn't hear anything. Hold the button the whole time you talk.");
          return;
        }
        setMic("busy");
        const result = await ownerCall<Parsed>(
          "/api/obligations/parse",
          send("POST", { transcript: text, language }),
        );
        setMic("idle");
        if (result.ok) applyParsed(result.data, text);
        else setVoiceNotice(failureText(result));
      },
      onError(error) {
        handle.current = null;
        setMic("idle");
        setVoiceNotice(
          error === "denied"
            ? "The microphone is blocked. Fill in the form, or allow the microphone for this site."
            : "Didn't hear anything. Hold the button the whole time you talk.",
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
