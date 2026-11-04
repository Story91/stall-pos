"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";

type Props = { onReset(): Promise<{ ok: true } | { ok: false; message: string }> };

/** Puts the demo back to its starting day. Two taps: the second one wipes data. */
export function ResetDemo({ onReset }: Props) {
  const [stage, setStage] = useState<"idle" | "confirm" | "working">("idle");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = async () => {
    setStage("working");
    setResult(null);
    const outcome = await onReset();
    setStage("idle");
    setResult(
      outcome.ok
        ? { ok: true, text: "Demo data is back to the start of the day." }
        : { ok: false, text: outcome.message },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg text-graphite">
        Deletes every sale, shift, bill, payout and decision, then loads the demo day again. Payouts
        already sent in the PayPal sandbox stay there.
      </p>
      {stage === "confirm" ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-marigold-soft p-3">
          <p className="text-lg font-semibold">Erase everything and start the demo over?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStage("idle")}
              className="min-h-14 rounded-xl border-2 border-ink bg-paper text-lg font-bold"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void reset()}
              className="min-h-14 rounded-xl bg-ink text-lg font-bold text-paper"
            >
              Yes, reset
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={stage === "working"}
          onClick={() => setStage("confirm")}
          className="hazard flex min-h-16 items-center justify-center rounded-2xl p-1.5 disabled:opacity-60"
        >
          <span className="flex h-full w-full items-center justify-center gap-2 rounded-xl bg-paper text-xl font-extrabold">
            {stage === "working" && <Spinner />}
            {stage === "working" ? "Resetting…" : "Reset demo data"}
          </span>
        </button>
      )}
      {result && (
        <p role={result.ok ? "status" : "alert"} className="text-lg font-semibold">
          {result.text}
        </p>
      )}
    </div>
  );
}
