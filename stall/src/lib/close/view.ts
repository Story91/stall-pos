// The close screen in the owner's current language, whatever language the close
// ran in (the nightly cron closes in English). Code-built text comes from the
// wording the run stored for every language; model-written text is translated
// on demand, once per language per run, and cached in the run's own log.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { agentRuns, type AgentRun } from "@/db/schema";
import { closeMessages } from "@/lib/i18n/close";
import type { DecisionView, PayoutWithPayee } from "@/lib/obligations";
import { LANGUAGES, type Language } from "@/lib/parse/schema";
import { MAX_RATIONALE, type LogEntry } from "./agent";
import {
  INTERNAL_LOG_TOOLS,
  inEveryLanguageSchema,
  SUMMARIES_TOOL,
  summariesInput,
  TRANSLATIONS_TOOL,
  translationsInput,
  type CloseFacts,
  type InEveryLanguage,
} from "./logText";
import { liveSummary, mergeFacts } from "./liveSummary";
import { translateTexts, type TranslateDeps } from "./translate";

export type CloseViewData = {
  run: AgentRun | null;
  decisions: DecisionView[];
  payouts: PayoutWithPayee[];
};

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function isLogEntry(value: unknown): value is LogEntry {
  return typeof field(value, "tool") === "string" && typeof field(value, "step") === "number";
}

const MODEL_RATIONALE_TOOLS = new Set(["pay_obligation", "hold_obligation"]);

/** The model's own words in one log entry: a rationale, its note, or a plain text turn. */
function modelTexts(entry: LogEntry): string[] {
  const found: unknown[] = [];
  if (MODEL_RATIONALE_TOOLS.has(entry.tool)) found.push(field(entry.input, "rationale"));
  if (entry.tool === "write_summary" || entry.tool === "model_text") found.push(field(entry.input, "text"));
  if (entry.tool === "model_text") found.push(entry.result);
  return found.filter((t): t is string => typeof t === "string" && t.trim() !== "");
}

/** Rewrites the model's own words in one entry; facts (ids, results, errors) stay as recorded. */
function translateEntry(entry: LogEntry, tr: (text: string) => string): LogEntry {
  const input = entry.input;
  let next: LogEntry = entry;
  for (const key of ["rationale", "text"]) {
    const value = field(input, key);
    if (typeof value === "string") next = { ...next, input: { ...(next.input as object), [key]: tr(value) } };
  }
  if (entry.tool === "model_text" && typeof entry.result === "string") next = { ...next, result: tr(entry.result) };
  return next;
}

type RunText = {
  /** The audit trail without the bookkeeping entries, numbered 1..n again. */
  log: LogEntry[];
  /** The code-built summary in the requested language; null for runs written before it was stored. */
  summary: string | null;
  /** Obligation id -> the rules' reason in every language. */
  reasons: Map<string, InEveryLanguage>;
  /** Model-written text -> the language it was written in (unknown for older runs). */
  writtenIn: Map<string, Language>;
  /** Cached translations into the requested language. */
  cache: Map<string, string>;
  /** What the day's runs did, merged; null when no run stored its facts (older runs). */
  facts: CloseFacts | null;
};

function readRun(run: AgentRun, language: Language): RunText {
  const entries = run.log.filter(isLogEntry);
  const segments: { from: number; to: number; language: Language }[] = [];
  const reasons = new Map<string, InEveryLanguage>();
  const cache = new Map<string, string>();
  const facts: CloseFacts[] = [];
  let summary: string | null = null;

  for (const entry of entries) {
    if (entry.tool === SUMMARIES_TOOL) {
      const parsed = summariesInput.safeParse(entry.input);
      if (!parsed.success) continue;
      const s = parsed.data;
      for (const [id, worded] of Object.entries(s.reasons)) reasons.set(id, worded);
      if (s.facts) facts.push(s.facts);
      // The latest run that acted wrote the stored summary; use its wording only if it is that summary.
      summary = s[s.language] === run.summary ? s[language] : null;
      segments.push({ from: s.firstStep ?? entry.step, to: entry.step, language: s.language });
    } else if (entry.tool === TRANSLATIONS_TOOL) {
      const parsed = translationsInput.safeParse(entry.input);
      if (!parsed.success) continue;
      for (const [original, translated] of Object.entries(parsed.data[language] ?? {})) cache.set(original, translated);
    }
  }

  const writtenIn = new Map<string, Language>();
  const log: LogEntry[] = [];
  for (const entry of entries) {
    if (INTERNAL_LOG_TOOLS.has(entry.tool)) continue;
    log.push({ ...entry, step: log.length + 1 });
    const segment = segments.find((s) => entry.step >= s.from && entry.step < s.to);
    if (!segment) continue;
    for (const text of modelTexts(entry)) {
      // Payouts and decisions keep a bounded copy of the rationale; it is the same words.
      writtenIn.set(text, segment.language);
      writtenIn.set(text.slice(0, MAX_RATIONALE), segment.language);
    }
  }
  return { log, summary, reasons, writtenIn, cache, facts: facts.length > 0 ? mergeFacts(facts) : null };
}

/** Identical requests in flight share one model call (the payouts poll can overlap a language switch). */
const inFlight = new Map<string, Promise<string[]>>();

function translateOnce(key: string, texts: string[], language: Language, deps: TranslateDeps): Promise<string[]> {
  const running = inFlight.get(key);
  if (running) return running;
  const call = translateTexts(texts, language, deps).finally(() => inFlight.delete(key));
  inFlight.set(key, call);
  return call;
}

/** Appends one cache entry atomically, so a concurrent view or close never loses the other's writes. */
async function appendTranslations(db: Db, runId: string, language: Language, fresh: Map<string, string>) {
  const input = JSON.stringify({ [language]: Object.fromEntries(fresh) });
  const at = new Date().toISOString();
  await db
    .update(agentRuns)
    .set({
      log: sql`${agentRuns.log} || jsonb_build_array(jsonb_build_object(
        'step', jsonb_array_length(${agentRuns.log}) + 1,
        'tool', ${TRANSLATIONS_TOOL}::text,
        'input', ${input}::jsonb,
        'result', null::jsonb,
        'at', ${at}::text))`,
    })
    .where(eq(agentRuns.id, runId));
}

/** Cached translations plus any missing ones; on any failure the missing ones stay untranslated. */
async function translationsFor(
  db: Db,
  run: AgentRun,
  language: Language,
  wanted: string[],
  cache: Map<string, string>,
  deps: TranslateDeps,
): Promise<Map<string, string>> {
  const missing = wanted.filter((text) => !cache.has(text));
  if (missing.length === 0) return cache;
  let translated: string[];
  try {
    translated = await translateOnce(`${run.id}|${language}|${missing.join("\u0001")}`, missing, language, deps);
  } catch (error) {
    // The originals are shown instead; the page never fails over a translation.
    console.warn("close view: translation unavailable, showing the original text", error instanceof Error ? error.name : "");
    return cache;
  }
  const fresh = new Map(missing.map((text, i) => [text, translated[i]!]));
  try {
    await appendTranslations(db, run.id, language, fresh);
  } catch (error) {
    console.warn("close view: could not cache translations", error instanceof Error ? error.name : "");
  }
  return new Map([...cache, ...fresh]);
}

const APPROVED_BY_OWNER = new Set(LANGUAGES.map((l) => closeMessages(l).approvedByOwner));

/** A payout rationale code wrote (the rules' reason, or the owner's approval), in `language`; null if the model wrote it. */
function codeRationale(
  payout: Pick<PayoutWithPayee, "rationale" | "shiftId" | "billId">,
  reasons: ReadonlyMap<string, InEveryLanguage> | undefined,
  language: Language,
): string | null {
  if (APPROVED_BY_OWNER.has(payout.rationale)) return closeMessages(language).approvedByOwner;
  const worded = reasons?.get(payout.shiftId ?? payout.billId ?? "");
  if (!worded) return null;
  const isRules = LANGUAGES.some(
    (l) => worded[l] === payout.rationale || worded[l].slice(0, MAX_RATIONALE) === payout.rationale,
  );
  return isRules ? worded[language] : null;
}

/** The summary as things stand now, or what the run stored for runs that kept no facts. */
function currentSummary(view: CloseViewData, text: RunText, language: Language): string {
  const run = view.run!;
  if (!text.facts) return text.summary ?? run.summary;
  return liveSummary(
    run.date,
    text.facts,
    {
      payoutStatus: new Map(
        view.payouts.flatMap((p) => [p.shiftId, p.billId].filter((id): id is string => Boolean(id)).map((id) => [id, p.status])),
      ),
      decisions: new Map(view.decisions.map((d) => [d.id, { status: d.status, reason: d.reason }])),
      reasons: text.reasons,
    },
    language,
  );
}

/**
 * Words the close view for `language`. Facts never change: amounts, statuses,
 * ids and verdicts are passed through; only the text around them is localized.
 * The summary is rebuilt from the run's facts and the current payout and decision
 * statuses, so it never contradicts the rest of the screen.
 */
export async function localizeCloseView(
  db: Db,
  view: CloseViewData,
  language: Language,
  deps: TranslateDeps = {},
): Promise<CloseViewData> {
  const text = view.run ? readRun(view.run, language) : null;
  const agentRationale = (decision: DecisionView): string | null => {
    const value = field(decision.source, "agentRationale");
    return typeof value === "string" && value.trim() !== "" ? value : null;
  };

  // Model-written text not already in the owner's language; unknown counts as not.
  let tr = (original: string) => original;
  if (view.run && text) {
    const needs = (original: string) => text.writtenIn.get(original) !== language;
    const wanted = new Set<string>();
    for (const entry of text.log) for (const t of modelTexts(entry)) if (needs(t)) wanted.add(t);
    for (const decision of view.decisions) {
      const rationale = agentRationale(decision);
      if (rationale && needs(rationale)) wanted.add(rationale);
    }
    for (const payout of view.payouts) {
      if (payout.rationale.trim() !== "" && codeRationale(payout, text.reasons, language) === null && needs(payout.rationale)) {
        wanted.add(payout.rationale);
      }
    }
    const translations = await translationsFor(db, view.run, language, [...wanted], text.cache, deps);
    tr = (original) => (wanted.has(original) ? translations.get(original) ?? original : original);
  }

  const decisions = view.decisions.map((decision) => {
    const worded = inEveryLanguageSchema.safeParse(field(decision.source, "reasons"));
    // Decisions held before reasons were stored in every language keep their original wording.
    const reason = worded.success ? worded.data[language] : decision.reason;
    const rationale = agentRationale(decision);
    return {
      ...decision,
      reason,
      source: {
        ...decision.source,
        ...(worded.success ? { rulesReason: reason } : {}),
        ...(rationale ? { agentRationale: tr(rationale) } : {}),
      },
    };
  });
  return {
    run:
      view.run && text
        ? {
            ...view.run,
            summary: currentSummary({ ...view, decisions }, text, language),
            log: text.log.map((e) => translateEntry(e, tr)),
          }
        : view.run,
    decisions,
    payouts: view.payouts.map((payout) => ({
      ...payout,
      rationale: codeRationale(payout, text?.reasons, language) ?? tr(payout.rationale),
    })),
  };
}

export type PayoutTextInput = Pick<PayoutWithPayee, "id" | "shiftId" | "billId" | "rationale"> & {
  /** The business date whose close made this payout (the shift's or bill's date). */
  runDate: string;
  /** The bill's note, for a bill payout. */
  billNote?: string | null;
};

/**
 * Payout rationales for screens other than Close (Today, History), in `language`,
 * by payout id. Never calls the model: code-written reasons are reworded, the
 * agent's words come from the Close screen's translation cache, and anything else
 * not known to be in `language` becomes a code-built label ("Shift, November 5").
 * Text from runs that predate this is taken as English, the nightly close's language.
 */
export async function localPayoutTexts(
  db: Db,
  businessId: string,
  items: PayoutTextInput[],
  language: Language,
): Promise<Map<string, string>> {
  const dates = [...new Set(items.map((i) => i.runDate))];
  const runs =
    dates.length === 0
      ? []
      : await db
          .select()
          .from(agentRuns)
          .where(and(eq(agentRuns.businessId, businessId), inArray(agentRuns.date, dates)));
  const texts = new Map(runs.map((run) => [run.date, readRun(run, language)]));
  const labels = closeMessages(language).payoutLabel;

  const out = new Map<string, string>();
  for (const item of items) {
    const text = texts.get(item.runDate);
    const code = codeRationale(item, text?.reasons, language);
    const cached = text?.cache.get(item.rationale);
    const writtenIn = text?.writtenIn.get(item.rationale) ?? "en";
    const label = item.shiftId
      ? labels.shift(item.runDate)
      : item.billNote
        ? labels.bill(item.billNote)
        : labels.billNoNote;
    out.set(item.id, code ?? (writtenIn === language ? item.rationale : cached ?? label));
  }
  return out;
}
