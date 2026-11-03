import { afterEach, describe, expect, it, vi } from "vitest";
import { createEventStream } from "@/lib/eventStream";
import type { StallEvent } from "@/lib/events";

const decoder = new TextDecoder();

async function readText(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { done, value } = await reader.read();
  return done ? "<done>" : decoder.decode(value);
}

describe("createEventStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the connected preamble and one data frame per event", async () => {
    let listener: (event: StallEvent) => void = () => {};
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((fn: (event: StallEvent) => void) => {
      listener = fn;
      return unsubscribe;
    });
    const controller = new AbortController();
    const reader = createEventStream(controller.signal, {
      subscribe,
      intervalMs: 15_000,
    }).getReader();

    expect(await readText(reader)).toBe(": connected\n\n");

    listener({ type: "sale.paid", saleId: "s1" });
    expect(await readText(reader)).toBe(
      'data: {"type":"sale.paid","saleId":"s1"}\n\n',
    );
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("sends a keep-alive comment every 15 seconds", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reader = createEventStream(controller.signal, {
      subscribe: () => () => {},
    }).getReader();

    expect(await readText(reader)).toBe(": connected\n\n");
    vi.advanceTimersByTime(15_000);
    expect(await readText(reader)).toBe(": ping\n\n");
    vi.advanceTimersByTime(15_000);
    expect(await readText(reader)).toBe(": ping\n\n");
  });

  it("unsubscribes, stops pinging and closes the stream when the request aborts", async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const controller = new AbortController();
    const reader = createEventStream(controller.signal, {
      subscribe: () => unsubscribe,
      intervalMs: 15_000,
    }).getReader();

    expect(await readText(reader)).toBe(": connected\n\n");
    controller.abort();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(await readText(reader)).toBe("<done>");
    vi.advanceTimersByTime(60_000);
    expect(await readText(reader)).toBe("<done>");
  });
});
