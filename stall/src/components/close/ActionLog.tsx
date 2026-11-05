"use client";

import type { LogEntry } from "@/lib/owner/types";
import { agentNote, nearDuplicate, plainText } from "@/lib/owner/text";
import { useLanguage, useT } from "@/lib/i18n/useT";
import { clockTime } from "@/lib/sell/format";
import { errorKind } from "@/lib/owner/closeIssues";

type Props = {
  log: LogEntry[];
  /** Payee name by obligation id, to say who each step was about. */
  names: Map<string, string>;
  /** The business's timezone, so step times match the Day screen. */
  tz?: string;
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
export function ActionLog({ log, names, tz }: Props) {
  const t = useT();
  const language = useLanguage();
  const toolLabels: Record<string, string> = t.actionLog.tools;
  if (log.length === 0) return <p className="text-lg text-graphite">{t.actionLog.empty}</p>;
  const note = agentNote(log);
  // The note is shown once, above; its log entry and a repeat of it as the final text add nothing.
  const shown = log.filter((entry) => {
    if (entry.tool !== "model_text") return true;
    const text = field(entry.input, "text");
    return !(note && typeof text === "string" && nearDuplicate(text, note));
  });
  return (
    <ol className="flex flex-col">
      {shown.map((entry) => {
        const ok = field(entry.result, "ok");
        const error = field(entry.result, "error");
        const isNote = entry.tool === "write_summary";
        const isSaid = entry.tool === "model_text";
        // The model's own words: recorded as input.text, or as the result for a plain text turn.
        const saidText = field(entry.input, "text") ?? (typeof entry.result === "string" ? entry.result : undefined);
        const isAgentDown = entry.tool === "model_error";
        // A raw error (from code, PayPal or the model API) is shown in plain words; the original stays under Details.
        const raw = isAgentDown ? (typeof entry.result === "string" ? entry.result : "") : typeof error === "string" ? error : null;
        const invoices = field(entry.result, "invoices");
        const invoiceLine =
          entry.tool === "check_unpaid_invoices" && ok === true && Array.isArray(invoices)
            ? t.actionLog.unpaid(
                invoices.length,
                invoices.map((i) => String(field(i, "number") ?? "")).filter(Boolean).join(", "),
              )
            : null;
        const line = invoiceLine ?? (isNote || isAgentDown
          ? ""
          : isSaid && typeof saidText === "string"
            ? plainText(saidText)
            : describeInput(entry, names));
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
                {toolLabels[entry.tool] ?? entry.tool}
                {ok === true && <span className="rounded-md bg-wash px-2 text-base font-bold">{t.actionLog.ok}</span>}
                {ok === false && (
                  <span className="rounded-md bg-ink px-2 text-base font-bold text-marigold">{t.actionLog.refused}</span>
                )}
                <span className="ml-auto text-base font-normal text-graphite">{clockTime(entry.at, tz, language)}</span>
              </p>
              {line && (
                <p className={`text-base text-graphite ${isSaid ? "whitespace-pre-line" : "truncate"}`}>{line}</p>
              )}
              {raw !== null && (ok === false || isAgentDown) && (
                <>
                  <p className="text-base">{t.actionLog.errors[errorKind(raw, entry.tool)]}</p>
                  {raw && (
                    <details className="text-sm text-graphite">
                      <summary className="cursor-pointer">{t.actionLog.details}</summary>
                      <p className="break-words">{raw}</p>
                    </details>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
