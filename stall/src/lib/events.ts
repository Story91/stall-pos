// Tiny in-process pub/sub so the webhook handler can tell live screens a sale
// was paid. No external deps; single-process only.

export type StallEvent =
  | { type: "sale.paid"; saleId: string }
  | { type: "payout.updated"; payoutId: string };

type Listener = (event: StallEvent) => void;

const listeners = new Set<Listener>();

export function emit(event: StallEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(event);
    } catch (error) {
      // One bad subscriber must not break the others or the webhook.
      console.error("event listener failed", error);
    }
  }
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
