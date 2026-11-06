// "Cancel that sale" in any of the app's languages. Decided by code, not the model:
// it leads to a money action, and the owner still confirms on screen before anything happens.
const WORDS = [
  // English
  "cancel", "void", "undo", "scrap",
  // Spanish
  "cancela", "cancelar", "cancélala", "cancelala", "anula", "anular", "anúlala", "anulala",
  // Polish
  "anuluj", "anulować", "anulowac", "cofnij", "skasuj",
];

// A whole word, letters on neither side (\b does not see accented letters as word characters).
const CANCEL = new RegExp(`(?<!\\p{L})(${WORDS.join("|")})(?!\\p{L})`, "iu");

/** Short commands only: an order is never a cancel, and a long sentence is not a command. */
const MAX_WORDS = 8;

export function isCancelIntent(transcript: string): boolean {
  const text = transcript.trim();
  if (text === "" || text.split(/\s+/).length > MAX_WORDS) return false;
  return CANCEL.test(text);
}
