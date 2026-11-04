import type { LogEntry } from "./types";

/** Lowercase, letters and digits only, single spaces: for comparing two phrasings of one thing. */
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when one text contains the other once normalized. */
export function nearDuplicate(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  return x !== "" && y !== "" && (x.includes(y) || y.includes(x));
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
