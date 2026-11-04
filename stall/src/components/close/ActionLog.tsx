"use client";

import type { LogEntry } from "@/lib/owner/types";
import { clockTime } from "@/lib/sell/format";

const TOOL_LABEL: Record<string, string> = {
  pay_obligation: "Paid",
  hold_obligation: "Held for you",
  write_summary: "Wrote a note",
  auto_pay: "Paid by the rules",
  auto_hold: "Held by the rules",
  model_text: "Agent said",
  model_error: "Agent unavailable, rules finished the day",
};

type Props = {
  log: LogEntry[];
  /** Payee name by obligation id, to say who each step was about. */
  names: Map<string, string>;
};

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/** One line: the agent's rationale or text, or who the rules acted on. */
export function describeInput(entry: LogEntry, names: Map<string, string>): string {
  const id = field(entry.input, "obligationId");
  const who = typeof id === "string" ? names.get(id) : undefined;
  const words = field(entry.input, "rationale") ?? field(entry.input, "text");
  const text = typeof words === "string" ? words : typeof entry.result === "string" ? entry.result : "";
  const line = [who, text].filter(Boolean).join(": ");
  return line.replace(/\s+/g, " ").trim();
}

/** The audit trail of the close, step by step: what each tool did and whether code allowed it. */
export function ActionLog({ log, names }: Props) {
  if (log.length === 0) return <p className="text-lg text-graphite">Nothing was logged for this close.</p>;
  return (
    <ol className="flex flex-col">
      {log.map((entry) => {
        const ok = field(entry.result, "ok");
        const error = field(entry.result, "error");
        const line = describeInput(entry, names);
        return (
          <li key={entry.step} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
            <span aria-hidden className="absolute top-8 bottom-0 left-[1.15rem] w-0.5 bg-rule" />
            <span
              className={`money relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                ok === false ? "hazard text-paper" : "bg-ink text-paper"
              }`}
            >
              <span className={ok === false ? "rounded bg-ink px-1" : undefined}>{entry.step}</span>
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                {TOOL_LABEL[entry.tool] ?? entry.tool}
                {ok === true && <span className="rounded-md bg-wash px-2 text-base font-bold">ok</span>}
                {ok === false && (
                  <span className="rounded-md bg-ink px-2 text-base font-bold text-marigold">refused</span>
                )}
                <span className="ml-auto text-base font-normal text-graphite">{clockTime(entry.at)}</span>
              </p>
              {line && <p className="truncate text-base text-graphite">{line}</p>}
              {ok === false && typeof error === "string" && (
                <p className="text-base">Code said: {error}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
