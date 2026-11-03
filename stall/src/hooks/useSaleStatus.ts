"use client";

import { useEffect, useState } from "react";

// Spike findings are not in yet; tune here.
export const POLL_MS = 3000;

export type SaleStatus = "draft" | "awaiting" | "paid" | "paid_cash" | "cancelled";
export type ShownStatus = SaleStatus | "unknown";

const TERMINAL: ReadonlySet<string> = new Set(["paid", "paid_cash", "cancelled"]);
const SALE_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "awaiting",
  "paid",
  "paid_cash",
  "cancelled",
]);

export type UseSaleStatusDeps = {
  fetchImpl?: typeof fetch;
  EventSourceImpl?: typeof EventSource;
};

function isSaleStatus(value: unknown): value is SaleStatus {
  return typeof value === "string" && SALE_STATUSES.has(value);
}

// Live updates come from /api/events (SSE); polling of /api/sales/:id is the
// fallback and also the source of truth for the final status.
export function useSaleStatus(
  saleId: string,
  deps: UseSaleStatusDeps = {},
): { status: ShownStatus } {
  const [status, setStatus] = useState<ShownStatus>("unknown");
  const { fetchImpl, EventSourceImpl } = deps;

  useEffect(() => {
    const fetchSale = fetchImpl ?? fetch;
    const EventSourceCtor =
      EventSourceImpl ??
      (typeof EventSource === "undefined" ? undefined : EventSource);
    const url = `/api/sales/${encodeURIComponent(saleId)}`;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | undefined;
    // Once the live event said paid, a lagging poll must not flip back to awaiting.
    let paidByEvent = false;

    const stop = () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      source?.close();
      source = undefined;
    };

    const refresh = async (): Promise<void> => {
      try {
        const response = await fetchSale(url);
        if (!response.ok || stopped) return;
        const body = (await response.json()) as { status?: unknown };
        if (stopped || !isSaleStatus(body.status)) return;
        if (paidByEvent && !TERMINAL.has(body.status)) return;
        setStatus(body.status);
        if (TERMINAL.has(body.status)) stop();
      } catch {
        // Transient network error: the next poll tick retries.
      }
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, POLL_MS);
    };

    if (EventSourceCtor) {
      source = new EventSourceCtor("/api/events");
      source.onmessage = (message) => {
        if (stopped) return;
        let event: unknown;
        try {
          event = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const isMatch =
          typeof event === "object" &&
          event !== null &&
          (event as { type?: unknown }).type === "sale.paid" &&
          (event as { saleId?: unknown }).saleId === saleId;
        if (!isMatch) return;
        paidByEvent = true;
        setStatus("paid");
        void refresh();
      };
    }

    void refresh().then(schedule);

    return stop;
  }, [saleId, fetchImpl, EventSourceImpl]);

  return { status };
}
