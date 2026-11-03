import { z } from "zod";

export const LANGUAGES = ["en", "es", "pl"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * What the model must return. Deliberately lenient (no min/max, nullable qty):
 * out-of-range values are dropped or clamped in post-processing so one bad
 * item never throws away the whole sale.
 */
export const llmOutputSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe("The item as the vendor said it, in the spoken language"),
      qty: z.number().nullish().describe("Quantity sold; use 1 if not stated"),
      unitPrice: z
        .number()
        .nullable()
        .describe("Price of ONE unit in dollars, or null if no price was spoken"),
      confidence: z.number().describe("0 to 1: how sure you are about this item"),
    }),
  ),
  spokenConfirmation: z
    .string()
    .describe("Short summary of the items in the spoken language, without a total"),
});

export type LlmOutput = z.infer<typeof llmOutputSchema>;

export type ParsedItem = {
  name: string;
  qty: number;
  /** Integer cents per unit; null when neither the vendor nor the catalog gave a price. */
  unitCents: number | null;
  /** 0..1 */
  confidence: number;
  catalogItemId?: string;
  /** From the matched catalog item; true when unmatched. */
  taxable: boolean;
};

export type ParsedSale = {
  items: ParsedItem[];
  spokenConfirmation: string;
  language: Language;
};
