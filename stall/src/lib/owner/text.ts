import type { LogEntry } from "./types";

/** Lowercase, letters and digits only, single spaces: for comparing two phrasings of one thing. */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const MIN_CONTAINED_CHARS = 20;

/** True when the texts match once normalized, or one contains the other (and is not trivially short). */
export function nearDuplicate(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (x === "" || y === "") return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= MIN_CONTAINED_CHARS && long.includes(short);
}

/** Minimal markdown to plain text: no bold markers, bullets as dots. */
export function plainText(text: string): string {
  return text
    .replace(/\*\*|__/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}

/** The model's own words come from its write_summary call. */
export function agentNote(log: LogEntry[]): string | null {
  const entry = [...log].reverse().find((e) => e.tool === "write_summary");
  const text = (entry?.input as { text?: unknown } | undefined)?.text;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

/**
 * The summary is code-built from sentences joined by spaces; split it back so the
 * first ("Closed November 4.") is the heading and each fact is its own line.
 */
export function summarySentences(summary: string): string[] {
  return summary.split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u).filter((s) => s.trim() !== "");
}
