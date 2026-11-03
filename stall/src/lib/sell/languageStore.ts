// The vendor's language, remembered on this device. Read through
// useSyncExternalStore so the server render and hydration agree ("en").
import { LANGUAGES, type Language } from "@/lib/parse/schema";

const KEY = "stall.language";
const CHANGE = "stall:language";

// Survives blocked storage (private mode): the choice then lasts for this page.
let chosen: Language | null = null;

export function readLanguage(): Language {
  if (chosen) return chosen;
  try {
    const stored = localStorage.getItem(KEY);
    return (LANGUAGES as readonly string[]).includes(stored ?? "") ? (stored as Language) : "en";
  } catch {
    return "en";
  }
}

export function writeLanguage(language: Language): void {
  chosen = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    // Blocked storage: `chosen` still holds it for this page.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeLanguage(onChange: () => void): () => void {
  window.addEventListener(CHANGE, onChange);
  const onStorage = () => {
    chosen = null; // another tab changed it; re-read storage
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
