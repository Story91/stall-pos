// The close summary as it stands now. The run stored what it did (facts); this
// says where each item is at the moment the owner looks: a payout still on its
// way, one that did not go through, a held item the owner has since answered.
// Pure: no DB, no I/O. Every sentence is built by code from those facts.
import { closeMessages } from "@/lib/i18n/close";
import type { Language } from "@/lib/parse/schema";
import { formatCents } from "./agent";
import type { CloseFact, CloseFacts, InEveryLanguage } from "./logText";

export type CurrentState = {
  /** The current status of the payout made for each obligation id. */
  payoutStatus: ReadonlyMap<string, string>;
  /** The current status and stored reason of each decision, by decision id. */
  decisions: ReadonlyMap<string, { status: string; reason: string }>;
  /** Obligation id -> the rules' reason in every language. */
  reasons: ReadonlyMap<string, InEveryLanguage>;
};

/**
 * What all of a day's runs did together: a later run that paid or held an item
 * supersedes an earlier one that could not, and "already handled" only counts
 * items no run of the day acted on.
 */
export function mergeFacts(runs: CloseFacts[]): CloseFacts {
  const paid = new Map<string, CloseFact>();
  const held = new Map<string, CloseFacts["held"][number]>();
  const failed = new Map<string, CloseFact>();
  const skipped = new Set<string>();
  for (const run of runs) {
    for (const item of run.paid) paid.set(item.id, item);
    for (const item of run.held) held.set(item.decisionId, item);
    for (const item of run.failed) failed.set(item.id, item);
    for (const id of run.skipped) skipped.add(id);
  }
  const acted = new Set([...paid.keys(), ...[...held.values()].map((h) => h.id)]);
  return {
    paid: [...paid.values()],
    held: [...held.values()],
    failed: [...failed.values()].filter((f) => !acted.has(f.id)),
    skipped: [...skipped].filter((id) => !acted.has(id) && !failed.has(id)),
  };
}

const sum = (items: CloseFact[]) => formatCents(items.reduce((total, f) => total + f.cents, 0));

export function liveSummary(date: string, facts: CloseFacts, now: CurrentState, language: Language): string {
  const m = closeMessages(language);
  const label = (f: CloseFact) => `${f.name} ${formatCents(f.cents)}`;
  const names = (items: CloseFact[]) => items.map(label).join(", ");
  const parts: string[] = [m.summary.closed(date)];

  // A payout without a row (should not happen) is reported as the run saw it: paid.
  const status = (f: CloseFact) => now.payoutStatus.get(f.id) ?? "SUCCESS";
  const sent = facts.paid.filter((f) => status(f) === "SUCCESS");
  const sending = facts.paid.filter((f) => status(f) === "PENDING");
  const unclaimed = facts.paid.filter((f) => status(f) === "UNCLAIMED");
  const notThrough = facts.paid.filter((f) => !["SUCCESS", "PENDING", "UNCLAIMED"].includes(status(f)));
  if (sent.length > 0) parts.push(m.summary.paid(sent.length, sum(sent), names(sent)));
  if (sending.length > 0) parts.push(m.live.sending(sending.length, sum(sending), names(sending)));
  if (unclaimed.length > 0) parts.push(m.live.unclaimed(unclaimed.length, names(unclaimed)));
  if (notThrough.length > 0) parts.push(m.live.notThrough(notThrough.length, names(notThrough)));

  const decision = (h: CloseFacts["held"][number]) => now.decisions.get(h.decisionId);
  const open = facts.held.filter((h) => (decision(h)?.status ?? "open") === "open");
  const answered = facts.held.filter((h) => (decision(h)?.status ?? "open") !== "open");
  if (open.length > 0) {
    const withReasons = open
      .map((h) => {
        const reason = now.reasons.get(h.id)?.[language] ?? decision(h)?.reason ?? "";
        return reason ? `${label(h)} (${reason.replace(/[.\s]+$/, "")})` : label(h);
      })
      .join("; ");
    parts.push(m.summary.needDecision(open.length, withReasons));
  }
  if (answered.length > 0) {
    const outcomes = m.live.outcome as Record<string, string>;
    const withOutcome = answered
      .map((h) => {
        const outcome = outcomes[decision(h)!.status];
        return outcome ? `${label(h)} (${outcome})` : label(h);
      })
      .join("; ");
    parts.push(m.live.decided(answered.length, withOutcome));
  }

  if (facts.failed.length > 0) parts.push(m.summary.failed(facts.failed.length, names(facts.failed)));
  if (facts.skipped.length > 0) parts.push(m.summary.skipped(facts.skipped.length));
  if (parts.length === 1) parts.push(m.summary.nothing);
  return parts.join(" ");
}
