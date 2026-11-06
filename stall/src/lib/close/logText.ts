// Bookkeeping entries the close keeps in agent_runs.log next to the audit trail,
// so wording can follow the owner's current language without a schema change.
// They are not steps of the agent: the close view strips them before showing the log.
import { z } from "zod";
import { LANGUAGES, type Language } from "@/lib/parse/schema";

/** Written once per close run that acted: the code-built summary and the rules' reasons, in every language. */
export const SUMMARIES_TOOL = "summaries";
/** Appended by the close view: model-written text translated on demand, cached per language. */
export const TRANSLATIONS_TOOL = "translations";

export const INTERNAL_LOG_TOOLS: ReadonlySet<string> = new Set([SUMMARIES_TOOL, TRANSLATIONS_TOOL]);

const language = z.enum(LANGUAGES);
const inEveryLanguage = z.object({ en: z.string(), es: z.string(), pl: z.string() });

/** One obligation the run acted on: its id, who it was for and how much. */
const factItem = z.object({ id: z.string(), name: z.string(), cents: z.number().int() });
export type CloseFact = z.infer<typeof factItem>;
export type CloseFacts = NonNullable<SummariesInput["facts"]>;

export const summariesInput = inEveryLanguage.extend({
  /** The language the run itself spoke: its model-written text is in it. */
  language,
  /** Obligation id -> the rules' reason for it, in every language. */
  reasons: z.record(z.string(), inEveryLanguage).default({}),
  /** The step of the run's first entry: entries from here up to this one are the run's own. */
  firstStep: z.number().int().positive().optional(),
  /** What the run did, so the view can say where each item stands now. */
  facts: z
    .object({
      paid: z.array(factItem),
      held: z.array(factItem.extend({ decisionId: z.string() })),
      failed: z.array(factItem),
      /** Obligations the run found already handled. */
      skipped: z.array(z.string()),
    })
    .optional(),
});
export type SummariesInput = z.infer<typeof summariesInput>;

/** Language -> original text -> translated text. */
export const translationsInput = z.partialRecord(language, z.record(z.string(), z.string()));
export type TranslationsInput = z.infer<typeof translationsInput>;

/** A text worded in every language, as stored for a held decision's reason. */
export const inEveryLanguageSchema = inEveryLanguage;
export type InEveryLanguage = Record<Language, string>;
