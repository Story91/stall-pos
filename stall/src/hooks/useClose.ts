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
import { useLanguage } from "@/lib/i18n/useT";
import { readLanguage } from "@/lib/sell/languageStore";
import { speak } from "@/lib/voice/speak";

/** Sandbox payouts settle in about 18 s; check every 5 s while any is still sending. */
export const PAYOUT_POLL_MS = 5000;

export type RunNotice = { kind: "nothing-new" } | { kind: "acted"; paid: number; held: number };

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
  const spoken = useRef<string | null>(null);

  const refresh = useCallback(async (date: string) => {
    const [close, dayView] = await Promise.all([
      ownerCall<CloseView>(`/api/close/${date}`),
      ownerCall<DayView>(`/api/day/${date}`),
    ]);
    if (!close.ok) return setLoadError(failureText(close, readLanguage()));
    setView(close.data);
    if (dayView.ok) setDay(dayView.data);
    setLoadError(null);
  }, []);

  const load = useCallback(() => {
    void ownerCall<BusinessView>("/api/business").then((biz) => {
      if (!biz.ok) return setLoadError(failureText(biz, readLanguage()));
      setBusiness(biz.data);
      return refresh(biz.data.today);
    });
  }, [refresh]);

  useEffect(load, [load]);

  // Read the summary aloud once when it arrives (and again only if it changes).
  const summary = view?.run?.summary ?? null;
  useEffect(() => {
    if (!summary || spoken.current === summary) return;
    spoken.current = summary;
    speak(summary, language);
  }, [summary, language]);

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
      setRunNotice(
        paid.length === 0 && held.length === 0
          ? { kind: "nothing-new" }
          : { kind: "acted", paid: paid.length, held: held.length },
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
    replaySummary: () => summary && speak(summary, language),
  };
}
