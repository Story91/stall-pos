// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSpeechSupported, LANG_TAGS, speak } from "@/lib/voice/speak";

class FakeUtterance {
  text: string;
  lang = "";
  voice: unknown = null;
  rate = 0;
  constructor(text: string) {
    this.text = text;
  }
}

const w = window as unknown as Record<string, unknown>;

const voices = [
  { name: "US English", lang: "en-US" },
  { name: "Polish Zosia", lang: "pl-PL" },
  { name: "Polish Other", lang: "pl-PL" },
];

let synth: {
  getVoices: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
};

function firstUtterance(): FakeUtterance {
  const call = synth.speak.mock.calls[0];
  if (!call) throw new Error("speechSynthesis.speak was not called");
  return call[0] as FakeUtterance;
}

beforeEach(() => {
  synth = {
    getVoices: vi.fn(() => voices),
    cancel: vi.fn(),
    speak: vi.fn(),
  };
  w.speechSynthesis = synth;
  w.SpeechSynthesisUtterance = FakeUtterance;
});

afterEach(() => {
  delete w.speechSynthesis;
  delete w.SpeechSynthesisUtterance;
});

describe("speech output", () => {
  it("maps languages to locale tags", () => {
    expect(LANG_TAGS).toEqual({ en: "en-US", es: "es-US", pl: "pl-PL" });
  });

  it("reports support based on speechSynthesis", () => {
    expect(isSpeechSupported()).toBe(true);
    delete w.speechSynthesis;
    expect(isSpeechSupported()).toBe(false);
  });

  it("is a no-op when speechSynthesis is missing", () => {
    delete w.speechSynthesis;
    expect(() => speak("hello", "en")).not.toThrow();
  });

  it("picks a voice whose lang starts with the language code, cancels, then speaks", () => {
    speak("Dwie kawy", "pl");

    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.cancel.mock.invocationCallOrder[0]!).toBeLessThan(
      synth.speak.mock.invocationCallOrder[0]!,
    );

    const utterance = firstUtterance();
    expect(utterance.text).toBe("Dwie kawy");
    expect(utterance.lang).toBe("pl-PL");
    expect(utterance.voice).toBe(voices[1]);
    expect(utterance.rate).toBe(1);
  });

  it("speaks without a voice when none matches", () => {
    speak("Hola", "es");

    const utterance = firstUtterance();
    expect(utterance.lang).toBe("es-US");
    expect(utterance.voice).toBeNull();
  });
});
