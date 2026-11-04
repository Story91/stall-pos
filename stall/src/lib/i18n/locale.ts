import type { Language } from "@/lib/parse/schema";

/** BCP 47 locale for dates and times in each language. Money stays US dollars, "$4.50". */
export const LOCALES: Record<Language, string> = { en: "en-US", es: "es-US", pl: "pl-PL" };
