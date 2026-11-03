import type { Language } from "@/lib/parse/schema";
import { LANG_TAGS } from "@/lib/voice/speak";

export type TranscriptionError = "unsupported" | "denied" | "no-speech";

export type TranscriptionOptions = {
  language: Language;
  onResult(text: string): void;
  onError(e: TranscriptionError): void;
};

export type TranscriptionHandle = { stop(): void };

/** Minimal shape of the Web Speech recognition API we rely on. */
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = { 0: SpeechRecognitionAlternativeLike; length: number };
type SpeechRecognitionEventLike = {
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
};
type SpeechRecognitionErrorEventLike = { error: string };

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((ev: unknown) => void) | null;
  start(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function mapErrorCode(code: string): TranscriptionError {
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "no-speech") return "no-speech";
  return "unsupported";
}

/**
 * Listens once for a single spoken phrase in the given language.
 * Reports exactly one terminal outcome: a result, or one error.
 */
export function startTranscription(opts: TranscriptionOptions): TranscriptionHandle {
  const Ctor = getRecognitionConstructor();
  if (!Ctor) {
    opts.onError("unsupported");
    return { stop() {} };
  }

  const recognition = new Ctor();
  recognition.lang = LANG_TAGS[opts.language];
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  // Guards against reporting twice: a recognition error is often followed by onend.
  let settled = false;

  recognition.onresult = (ev) => {
    if (settled) return;
    const alternative = ev.results[ev.results.length - 1]?.[0];
    if (!alternative) return;
    settled = true;
    opts.onResult(alternative.transcript.trim());
  };

  recognition.onerror = (ev) => {
    if (settled) return;
    settled = true;
    // Chrome fires "aborted" when we cancel on purpose; that is not a failure.
    if (ev.error === "aborted") return;
    opts.onError(mapErrorCode(ev.error));
  };

  recognition.onend = () => {
    if (settled) return;
    settled = true;
    opts.onError("no-speech");
  };

  recognition.start();

  return {
    stop() {
      // Mark settled first so the "aborted" error and onend that follow are silent.
      settled = true;
      recognition.abort();
    },
  };
}
