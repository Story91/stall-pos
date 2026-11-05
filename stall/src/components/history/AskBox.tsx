"use client";

import type { FormEvent } from "react";
import { MicButton, type MicState } from "@/components/sell/MicButton";
import { Spinner } from "@/components/ui";
import { MAX_QUESTION_LENGTH } from "@/lib/historyView";
import { useT } from "@/lib/i18n/useT";

type Props = {
  question: string;
  onQuestion(text: string): void;
  onAsk(text: string): void;
  asking: boolean;
  error: string | null;
  mic: MicState;
  micSupported: boolean;
  onPressStart(): void;
  onPressEnd(): void;
};

/** Say or type a question; the answer is a filtered grid, never a number the model made up. */
export function AskBox(props: Props) {
  const t = useT();
  const a = t.history.ask;
  const ready = props.question.trim() !== "" && !props.asking;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) props.onAsk(props.question);
  };

  return (
    <section aria-labelledby="ask" className="flex flex-col gap-3 rounded-2xl bg-marigold-soft p-3">
      <h2 id="ask" className="flex items-center gap-2 font-display text-2xl font-bold leading-tight">
        <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
        </svg>
        {a.title}
      </h2>
      <MicButton
        state={props.mic}
        supported={props.micSupported}
        size="compact"
        idleLabel={a.hold}
        busyLabel={a.asking}
        onPressStart={props.onPressStart}
        onPressEnd={props.onPressEnd}
      />
      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="ask-question">
          {a.label}
        </label>
        <input
          id="ask-question"
          value={props.question}
          onChange={(e) => props.onQuestion(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder={a.placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-ink bg-paper px-3 text-lg focus:outline-none focus-visible:outline-3 focus-visible:outline-ink"
        />
        <button
          type="submit"
          disabled={!ready}
          className="flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-xl font-bold text-paper disabled:opacity-40"
        >
          {props.asking && props.mic !== "busy" && <Spinner />}
          {a.submit}
        </button>
      </form>
      {props.asking && (
        <p role="status" className="text-lg text-graphite">
          {a.asking}
        </p>
      )}
      {props.error && (
        <p role="alert" className="rounded-xl bg-ink p-3 text-lg text-paper">
          {props.error}
        </p>
      )}
    </section>
  );
}
