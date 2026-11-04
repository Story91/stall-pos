import type { Language } from "@/lib/parse/schema";

export const LANG_TAGS: Record<Language, string> = { en: "en-US", es: "es-US", pl: "pl-PL" };

/** How long to wait for a browser that loads its voice list late (Chrome does). */
const VOICES_TIMEOUT_MS = 1000;

export function isSpeechSupported(): boolean {
  return typeof speechSynthesis !== "undefined";
}

/** Android reports "pl_PL"; browsers report "pl-PL". Compare both as "pl-pl". */
function normalizeTag(tag: string): string {
  return tag.replace("_", "-").toLowerCase();
}

/** The exact locale first (es-US over es-ES), then any voice of the same language. */
function pickVoice(voices: SpeechSynthesisVoice[], tag: string): SpeechSynthesisVoice | null {
  const wanted = normalizeTag(tag);
  const prefix = wanted.slice(0, 2);
  return (
    voices.find((v) => normalizeTag(v.lang) === wanted) ??
    voices.find((v) => normalizeTag(v.lang).startsWith(prefix)) ??
    null
  );
}

function say(text: string, tag: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = tag;
  utterance.voice = pickVoice(speechSynthesis.getVoices(), tag);
  utterance.rate = 1;

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

/**
 * Speaks `text` aloud in `language`, interrupting anything already being spoken.
 * No-op without speechSynthesis. When the browser has not loaded its voices yet,
 * waits briefly for them: speaking at once would use the default voice, which
 * reads Polish or Spanish text with an English voice.
 */
export function speak(text: string, language: Language): void {
  if (typeof speechSynthesis === "undefined") return;
  const tag = LANG_TAGS[language];

  if (speechSynthesis.getVoices().length > 0 || typeof speechSynthesis.addEventListener !== "function") {
    say(text, tag);
    return;
  }

  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    speechSynthesis.removeEventListener("voiceschanged", go);
    say(text, tag);
  };
  const timer = setTimeout(go, VOICES_TIMEOUT_MS);
  speechSynthesis.addEventListener("voiceschanged", go);
}
