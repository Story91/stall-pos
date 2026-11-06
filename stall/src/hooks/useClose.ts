"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionOutcome } from "@/components/close/DecisionCard";
import { failureText, ownerCall, send } from "@/lib/owner/api";
import type {
  BusinessView,
  CloseView,
  DayView,
  DecisionAction,
  RunCloseResult,
} from "@/lib/owner/types";
import { messagesFor } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useT";
import { everyDecisionHandled } from "@/lib/owner/closeIssues";
import type { Language } from "@/lib/parse/schema";
import { readLanguage } from "@/lib/sell/languageStore";
import { speak } from "@/lib/voice/speak";

/** Sandbox payouts settle in about 18 s; check every 5 s while any is still sending. */
export const PAYOUT_POLL_MS = 5000;

export type RunNotice = { kind: "nothing-new" } | { kind: "acted"; paid: number; held: number; failed: number };

export function useClose() {
  // The owner's language: sent with the close so the summary and reasons come back in it.
  const language = useLanguage();
  const [business, setBusiness] = useState<BusinessView | null>(null);
  const [view, setView] = useState<CloseView | null>(null);
  const [day, setDay] = useState<DayView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runNotice, setRunNotice] = useState<RunNotice | null>(null);
  // The language the server worded `view` in; lags `language` until the refetch lands.
  const [viewLanguage, setViewLanguage] = useState<Language>(language);
  const spoken = useRef<string | null>(null);
  const latest = useRef(0);
  const wanted = useRef(language);
  useEffect(() => {
    wanted.current = language;
  }, [language]);

  // Depends on `language`, so switching language refetches the close worded in it.
  const refresh = useCallback(async (date: string) => {
    const request = ++latest.current;
    const [close, dayView] = await Promise.all([
      ownerCall<CloseView>(`/api/close/${date}?language=${language}`),
      ownerCall<DayView>(`/api/day/${date}?language=${language}`),
    ]);
    // A slower, older response (say, from before a language switch) must not win.
    if (request !== latest.current || language !== wanted.current) return;
    if (!close.ok) return setLoadError(failureText(close, readLanguage()));
    setView(close.data);
    setViewLanguage(language);
    if (dayView.ok) setDay(dayView.data);
    setLoadError(null);
  }, [language]);

  const load = useCallback(() => {
    void ownerCall<BusinessView>("/api/business").then((biz) => {
      if (!biz.ok) return setLoadError(failureText(biz, readLanguage()));
      setBusiness(biz.data);
      return refresh(biz.data.today);
    });
  }, [refresh]);

  useEffect(load, [load]);

  // Read the summary aloud once when a close lands (and again when a later run acts
  // or the language changes), in the language it is worded in. It says what is true
  // now, so it changes as payouts settle and decisions are answered: those changes
  // update the screen, but do not start reading it out again. Replay reads exactly what is shown.
  const closeRun = view?.run ?? null;
  const summary = closeRun?.summary ?? null;
  const handled = everyDecisionHandled(view?.decisions ?? []);
  const spokenText = summary && handled ? `${summary} ${messagesFor(viewLanguage).close.allHandled}` : summary;
  const speakKey = closeRun ? `${closeRun.createdAt}|${closeRun.log.length}|${viewLanguage}` : null;
  useEffect(() => {
    if (!speakKey || !spokenText || spoken.current === speakKey) return;
    spoken.current = speakKey;
    speak(spokenText, viewLanguage);
  }, [speakKey, spokenText, viewLanguage]);

  const date = business?.today ?? null;
  const sending = view?.payouts.some((p) => p.status === "PENDING") ?? false;
  useEffect(() => {
    if (!sending || !date) return;
    const timer = setInterval(() => void refresh(date), PAYOUT_POLL_MS);
    return () => clearInterval(timer);
  }, [sending, date, refresh]);

  const run = async () => {
    if (!date || running) return;
    setRunning(true);
    setRunError(null);
    setRunNotice(null);
    const result = await ownerCall<RunCloseResult>("/api/close", send("POST", { date, language }));
    if (result.ok) {
      const { paid, held } = result.data;
      const failed = result.data.failed?.length ?? 0;
      setRunNotice(
        paid.length === 0 && held.length === 0 && failed === 0
          ? { kind: "nothing-new" }
          : { kind: "acted", paid: paid.length, held: held.length, failed },
      );
    } else setRunError(failureText(result, language));
    await refresh(date);
    setRunning(false);
  };

  const resolve = async (
    decisionId: string,
    action: DecisionAction,
    expectedCents?: number,
  ): Promise<ActionOutcome> => {
    const result = await ownerCall(`/api/decisions/${decisionId}`, send("POST", { action, expectedCents, language }));
    if (date) await refresh(date);
    if (result.ok) return { ok: true };
    return { ok: false, message: failureText(result, language), conflict: result.status === 409 };
  };

  return {
    business,
    view,
    day,
    loadError,
    reload: load,
    running,
    runError,
    runNotice,
    run: () => void run(),
    resolve,
    replaySummary: () => spokenText && speak(spokenText, viewLanguage),
  };
}
