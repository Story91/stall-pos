// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startTranscription } from "@/lib/voice/transcribe";

type Handler = ((ev: unknown) => void) | null;

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = true;
  continuous = true;
  maxAlternatives = 0;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: Handler = null;
  start = vi.fn();
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }
}

const w = window as unknown as Record<string, unknown>;

function lastInstance(): FakeRecognition {
  const inst = FakeRecognition.instances.at(-1);
  if (!inst) throw new Error("no recognition instance created");
  return inst;
}

function resultEvent(transcript: string) {
  return {
    results: {
      length: 1,
      0: { length: 1, 0: { transcript, confidence: 0.9 }, isFinal: true },
    },
  };
}

beforeEach(() => {
  FakeRecognition.instances = [];
  w.SpeechRecognition = FakeRecognition;
});

afterEach(() => {
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
});

describe("startTranscription", () => {
  it("reports unsupported when no recognition constructor exists", () => {
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
    const onError = vi.fn();
    const onResult = vi.fn();

    const handle = startTranscription({ language: "en", onResult, onError });

    expect(onError).toHaveBeenCalledWith("unsupported");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
    expect(() => handle.stop()).not.toThrow();
  });

  it("falls back to webkitSpeechRecognition", () => {
    delete w.SpeechRecognition;
    w.webkitSpeechRecognition = FakeRecognition;

    startTranscription({ language: "pl", onResult: vi.fn(), onError: vi.fn() });

    expect(lastInstance().start).toHaveBeenCalledTimes(1);
  });

  it("configures the language and starts recognition", () => {
    startTranscription({ language: "es", onResult: vi.fn(), onError: vi.fn() });

    const rec = lastInstance();
    expect(rec.lang).toBe("es-US");
    expect(rec.interimResults).toBe(false);
    expect(rec.continuous).toBe(false);
    expect(rec.maxAlternatives).toBe(1);
    expect(rec.start).toHaveBeenCalledTimes(1);
  });

  it("maps en and pl to their locale tags", () => {
    startTranscription({ language: "en", onResult: vi.fn(), onError: vi.fn() });
    expect(lastInstance().lang).toBe("en-US");

    startTranscription({ language: "pl", onResult: vi.fn(), onError: vi.fn() });
    expect(lastInstance().lang).toBe("pl-PL");
  });

  it("stop() aborts the recognition", () => {
    const handle = startTranscription({ language: "en", onResult: vi.fn(), onError: vi.fn() });

    handle.stop();

    expect(lastInstance().abort).toHaveBeenCalledTimes(1);
  });

  it("delivers the trimmed final transcript", () => {
    const onResult = vi.fn();
    startTranscription({ language: "en", onResult, onError: vi.fn() });

    lastInstance().onresult?.(resultEvent("  two flat whites  "));

    expect(onResult).toHaveBeenCalledWith("two flat whites");
  });

  it("maps not-allowed and service-not-allowed to denied", () => {
    for (const error of ["not-allowed", "service-not-allowed"]) {
      const onError = vi.fn();
      startTranscription({ language: "en", onResult: vi.fn(), onError });
      lastInstance().onerror?.({ error });
      expect(onError).toHaveBeenCalledExactlyOnceWith("denied");
    }
  });

  it("maps no-speech to no-speech and other errors to unsupported", () => {
    const onError = vi.fn();
    startTranscription({ language: "en", onResult: vi.fn(), onError });
    lastInstance().onerror?.({ error: "no-speech" });
    expect(onError).toHaveBeenCalledExactlyOnceWith("no-speech");

    const onNetwork = vi.fn();
    startTranscription({ language: "en", onResult: vi.fn(), onError: onNetwork });
    lastInstance().onerror?.({ error: "network" });
    expect(onNetwork).toHaveBeenCalledExactlyOnceWith("unsupported");
  });

  it("does not report no-speech after an error already ended the session", () => {
    const onError = vi.fn();
    startTranscription({ language: "en", onResult: vi.fn(), onError });

    lastInstance().onerror?.({ error: "no-speech" });
    lastInstance().onend?.({});

    expect(onError).toHaveBeenCalledExactlyOnceWith("no-speech");
  });

  it("reports a single no-speech when the session ends without a result", () => {
    const onError = vi.fn();
    const onResult = vi.fn();
    startTranscription({ language: "en", onResult, onError });

    lastInstance().onend?.({});
    lastInstance().onend?.({});

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("no-speech");
    expect(onResult).not.toHaveBeenCalled();
  });

  it("does not report no-speech when a result arrived before end", () => {
    const onError = vi.fn();
    const onResult = vi.fn();
    startTranscription({ language: "en", onResult, onError });

    lastInstance().onresult?.(resultEvent("water"));
    lastInstance().onend?.({});

    expect(onResult).toHaveBeenCalledWith("water");
    expect(onError).not.toHaveBeenCalled();
  });
});
