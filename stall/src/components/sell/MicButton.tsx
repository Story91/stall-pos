"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { useT } from "@/lib/i18n/useT";

export type MicState = "idle" | "listening" | "busy";

type Props = {
  state: MicState;
  /** False when the browser cannot listen; the button then explains instead. */
  supported: boolean;
  size: "hero" | "compact";
  idleLabel: string;
  /** Shown while the transcript is being read; defaults to the sell wording. */
  busyLabel?: string;
  onPressStart(): void;
  onPressEnd(): void;
};

/**
 * Push-to-talk: press and hold, speak, let go. Pointer capture keeps the
 * release on this button even if the thumb slides off it. Space or Enter
 * held down does the same from a keyboard.
 */
export function MicButton({
  state,
  supported,
  size,
  idleLabel,
  busyLabel,
  onPressStart,
  onPressEnd,
}: Props) {
  const t = useT();
  const listening = state === "listening";
  const disabled = !supported || state === "busy";
  // The accessible name stays put while the state changes; state is announced
  // through the live region below instead of by renaming the button.
  const name = supported ? idleLabel : t.mic.unavailable;
  const labels: Record<Exclude<MicState, "idle">, string> = {
    listening: t.mic.listening,
    busy: busyLabel ?? t.mic.readingOrder,
  };
  const label = !supported || state === "idle" ? name : labels[state];

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onPressStart();
  };
  const up = () => {
    if (listening) onPressEnd();
  };
  const keyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat && !disabled && !listening) {
      e.preventDefault();
      onPressStart();
    }
  };
  const keyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      up();
    }
  };

  const hero = size === "hero";
  return (
    <>
      <button
        type="button"
        aria-pressed={listening}
        aria-label={name}
        disabled={disabled}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`press-target flex items-center disabled:opacity-50 ${
          hero ? "flex-col gap-4" : "min-h-16 w-full gap-4 rounded-2xl border-2 border-ink px-3"
        }`}
      >
        <span
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-full transition-colors ${
            hero ? "size-40" : "size-12"
          } ${listening ? "listening-ring bg-marigold text-ink" : "bg-ink text-marigold"}`}
        >
          {state === "busy" ? (
            <span
              className={`animate-spin rounded-full border-marigold border-t-transparent motion-reduce:animate-none ${
                hero ? "size-14 border-[6px]" : "size-6 border-4"
              }`}
            />
          ) : (
            <MicGlyph className={hero ? "size-20" : "size-7"} />
          )}
        </span>
        <span
          aria-hidden
          className={hero ? "text-2xl font-semibold" : "text-left text-xl font-semibold"}
        >
          {label}
        </span>
      </button>
      <span role="status" className="sr-only">
        {state === "idle" ? "" : labels[state]}
      </span>
    </>
  );
}

function MicGlyph({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
    >
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" stroke="none" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
    </svg>
  );
}
