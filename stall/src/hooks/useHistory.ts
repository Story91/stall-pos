"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MicState } from "@/components/sell/MicButton";
import { rangeDates, type HistoryRange, type HistoryResponse, type HistoryView } from "@/lib/historyView";
import { messagesFor } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useT";
import { failureText, ownerCall, send } from "@/lib/owner/api";
import type { BusinessView } from "@/lib/owner/types";
import { readLanguage } from "@/lib/sell/languageStore";
import { isRecognitionSupported, startTranscription, type TranscriptionHandle } from "@/lib/voice/transcribe";

const noopSubscribe = () => () => {};

/** Everything the History screen reads and does: the ledger for a range, and the AI question box. */
export function useHistory() {
  const language = useLanguage();
  const micSupported = useSyncExternalStore(noopSubscribe, isRecognitionSupported, () => true);

  const [business, setBusiness] = useState<BusinessView | null>(null);
  const [range, setRange] = useState<HistoryRange>("7d");
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<HistoryView | null>(null);
  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [mic, setMic] = useState<MicState>("idle");
  const handle = useRef<TranscriptionHandle | null>(null);
  // Only the latest ledger request may land: a slow answer for an older range is dropped.
  const latest = useRef(0);

  const loadBusiness = useCallback(async () => {
    const result = await ownerCall<BusinessView>("/api/business");
    if (result.ok) setBusiness(result.data);
    else {
      setLoadError(failureText(result, readLanguage()));
      setLoading(false);
    }
  }, []);

  const loadRange = useCallback(async (today: string, which: HistoryRange) => {
    const ticket = ++latest.current;
    setLoading(true);
    const { from, to } = rangeDates(which, today);
    // The payout reasons come back in the owner's language; a switch reloads the range.
    const result = await ownerCall<HistoryResponse>(`/api/history?from=${from}&to=${to}&language=${language}`);
    if (ticket !== latest.current) return;
    setLoading(false);
    if (result.ok) {
      setData(result.data);
      setLoadError(null);
    } else setLoadError(failureText(result, readLanguage()));
  }, [language]);

  useEffect(() => {
    // Deferred a tick so the first fetch never sets state during the effect itself.
    const timer = setTimeout(() => void loadBusiness(), 0);
    return () => {
      clearTimeout(timer);
      handle.current?.stop();
    };
  }, [loadBusiness]);

  useEffect(() => {
    if (!business) return;
    const timer = setTimeout(() => void loadRange(business.today, range), 0);
    return () => clearTimeout(timer);
  }, [business, range, loadRange]);

  const reload = () => {
    setLoadError(null);
    if (!business) {
      setLoading(true);
      void loadBusiness();
    } else void loadRange(business.today, range);
  };

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed === "" || asking) return;
    setAsking(true);
    setAskError(null);
    const result = await ownerCall<{ view: HistoryView }>(
      "/api/history/ask",
      send("POST", { question: trimmed, language }),
    );
    setAsking(false);
    const t = messagesFor(language);
    if (!result.ok) {
      setAskError(result.status === 422 || result.status === 400 ? t.history.ask.notUnderstood : failureText(result, language));
      return;
    }
    // A fresh answer starts from a clean list: the hand-typed search would hide part of it.
    setSearch("");
    setView(result.data.view);
    setRange(result.data.view.range);
  };

  const pressStart = () => {
    handle.current?.stop();
    setAskError(null);
    setMic("listening");
    handle.current = startTranscription({
      language,
      async onResult(text) {
        handle.current = null;
        const t = messagesFor(language);
        if (!text) {
          setMic("idle");
          setAskError(t.sell.noSpeech);
          return;
        }
        setQuestion(text);
        setMic("busy");
        await ask(text);
        setMic("idle");
      },
      onError(error) {
        handle.current = null;
        setMic("idle");
        const t = messagesFor(language);
        setAskError(error === "denied" ? t.history.ask.micDenied : t.sell.noSpeech);
      },
    });
  };

  return {
    business,
    range,
    pickRange: (next: HistoryRange) => {
      setRange(next);
      // An AI view keeps its filters on the new dates.
      setView((current) => (current ? { ...current, range: next } : current));
    },
    data,
    loading,
    loadError,
    reload,
    view,
    clearView: () => {
      setView(null);
      setAskError(null);
    },
    question,
    setQuestion,
    search,
    setSearch,
    asking,
    askError,
    ask: (text: string) => void ask(text),
    voice: {
      mic,
      micSupported,
      pressStart,
      pressEnd: () => handle.current?.finish(),
    },
  };
}
