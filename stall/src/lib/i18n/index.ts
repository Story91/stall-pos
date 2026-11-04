// The owner's language for the whole app. Client screens read it through
// `useT()` (see ./useT); plain functions take a `Language` and call `messagesFor`.
import type { Language } from "@/lib/parse/schema";
import { en, type Messages } from "./en";
import { es } from "./es";
import { pl } from "./pl";

export type { Messages };

export const MESSAGES: Record<Language, Messages> = { en, es, pl };

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}
