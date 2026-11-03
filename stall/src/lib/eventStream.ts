import { type StallEvent, subscribe as subscribeToEvents } from "@/lib/events";

export const PING_MS = 15_000;

export type EventStreamDeps = {
  subscribe?: (listener: (event: StallEvent) => void) => () => void;
  intervalMs?: number;
};

// Server-Sent Events stream: a connected preamble, one `data:` frame per
// StallEvent, and a keep-alive comment so proxies keep the connection open.
export function createEventStream(
  signal: AbortSignal,
  deps: EventStreamDeps = {},
): ReadableStream<Uint8Array> {
  const subscribe = deps.subscribe ?? subscribeToEvents;
  const intervalMs = deps.intervalMs ?? PING_MS;
  const encoder = new TextEncoder();

  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let onAbort: (() => void) | undefined;

  const teardown = () => {
    closed = true;
    unsubscribe?.();
    unsubscribe = undefined;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (onAbort) signal.removeEventListener("abort", onAbort);
    onAbort = undefined;
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        teardown();
        controller.close();
      };

      send(": connected\n\n");
      unsubscribe = subscribe((event) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });
      timer = setInterval(() => send(": ping\n\n"), intervalMs);

      if (signal.aborted) {
        close();
      } else {
        onAbort = close;
        signal.addEventListener("abort", onAbort, { once: true });
      }
    },
    cancel() {
      teardown();
    },
  });
}
