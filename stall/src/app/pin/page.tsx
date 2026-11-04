"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui";
import { safeNext } from "@/lib/access";

const MIN = 4;
const MAX = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export default function PinPage() {
  const [digits, setDigits] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "wrong" | "offline">("idle");
  const checking = useRef(false);

  const submit = useCallback(async (pin: string) => {
    if (checking.current || pin.length < MIN) return;
    checking.current = true;
    setState("checking");
    let response: Response | null = null;
    try {
      response = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
    } catch {
      // No connection: say so below.
    }
    checking.current = false;
    if (response?.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      // A full load, so the proxy sees the new cookie.
      window.location.assign(safeNext(next));
      return;
    }
    setDigits("");
    setState(response ? "wrong" : "offline");
  }, []);

  const press = useCallback(
    (key: string) => {
      if (checking.current) return;
      setState("idle");
      if (key === "back") return setDigits(digits.slice(0, -1));
      if (digits.length >= MAX) return;
      const next = digits + key;
      setDigits(next);
      // Four digits is the usual PIN: check it without waiting for Unlock.
      if (next.length === MIN) void submit(next);
    },
    [submit, digits],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") void submit(digits);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, submit, digits]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-8">
      <header className="text-center">
        <p className="money text-5xl font-extrabold leading-none">Stall</p>
        <h1 className="mt-2 text-2xl font-semibold">Enter your owner PIN</h1>
      </header>

      <div className="flex flex-col items-center gap-3">
        <div aria-hidden className="flex gap-3">
          {Array.from({ length: Math.max(MIN, digits.length) }, (_, i) => (
            <span
              key={i}
              className={`size-5 rounded-full border-[3px] border-ink ${i < digits.length ? "bg-ink" : ""}`}
            />
          ))}
        </div>
        <p role="status" className="flex min-h-8 items-center gap-2 text-xl font-bold">
          {state === "checking" && (
            <>
              <Spinner /> Checking
            </>
          )}
          {state === "wrong" && "Wrong PIN"}
          {state === "offline" && "No connection. Try again."}
          {state === "idle" && <span className="sr-only">{digits.length} digits entered</span>}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <Key key={key} label={key} onPress={() => press(key)} />
        ))}
        <button
          type="button"
          onClick={() => void submit(digits)}
          disabled={digits.length < MIN || state === "checking"}
          className="min-h-20 rounded-2xl bg-marigold text-xl font-bold text-ink disabled:opacity-40"
        >
          Unlock
        </button>
        <Key label="0" onPress={() => press("0")} />
        <button
          type="button"
          aria-label="Delete last digit"
          onClick={() => press("back")}
          className="flex min-h-20 items-center justify-center rounded-2xl border-2 border-ink text-ink active:bg-wash"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5h11v14H9l-6-7zM13 9.5l5 5M18 9.5l-5 5" />
          </svg>
        </button>
      </div>
    </main>
  );
}

function Key({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="money min-h-20 rounded-2xl bg-ink text-4xl font-bold text-paper active:bg-graphite"
    >
      {label}
    </button>
  );
}
