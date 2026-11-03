import type { Language } from "@/lib/parse/schema";

export const LANG_TAGS: Record<Language, string> = { en: "en-US", es: "es-US", pl: "pl-PL" };

export function isSpeechSupported(): boolean {
  return typeof speechSynthesis !== "undefined";
}

/** Speaks `text` aloud, interrupting anything already being spoken. No-op without speechSynthesis. */
export function speak(text: string, language: Language): void {
  if (typeof speechSynthesis === "undefined") return;

  const tag = LANG_TAGS[language];
  const prefix = tag.slice(0, 2);
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(prefix)) ?? null;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = tag;
  utterance.voice = voice;
  utterance.rate = 1;

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}
