// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_MS, useSaleStatus } from "@/hooks/useSaleStatus";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;
  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  send(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function jsonResponse(status: string) {
  return { ok: true, json: async () => ({ status, totalCents: 1000 }) };
}

function Probe({
  saleId,
  deps,
}: {
  saleId: string;
  deps: Parameters<typeof useSaleStatus>[1];
}) {
  const { status } = useSaleStatus(saleId, deps);
  return <output data-testid="status">{status}</output>;
}

const shown = () => screen.getByTestId("status").textContent;

// Lets timers run and pending fetch promises settle inside act().
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useSaleStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("polls the sale until it is paid, then stops polling", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse("awaiting"))
      .mockResolvedValueOnce(jsonResponse("awaiting"))
      .mockResolvedValueOnce(jsonResponse("paid"));

    await act(async () => {
      render(<Probe saleId="s1" deps={{ fetchImpl: fetchImpl as never }} />);
    });
    expect(shown()).toBe("awaiting");
    expect(fetchImpl).toHaveBeenCalledWith("/api/sales/s1");

    await advance(POLL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(shown()).toBe("awaiting");

    await advance(POLL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(shown()).toBe("paid");

    await advance(POLL_MS * 5);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("refetches once and shows paid when a sale.paid event matches the saleId", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse("awaiting"))
      .mockResolvedValueOnce(jsonResponse("paid"));

    await act(async () => {
      render(
        <Probe
          saleId="s1"
          deps={{
            fetchImpl: fetchImpl as never,
            EventSourceImpl: FakeEventSource as never,
          }}
        />,
      );
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.url).toBe("/api/events");

    await act(async () => {
      FakeEventSource.instances[0]?.send({ type: "sale.paid", saleId: "s1" });
    });
    expect(shown()).toBe("paid");
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await advance(POLL_MS * 2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("ignores sale.paid events for other sales", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse("awaiting"));

    await act(async () => {
      render(
        <Probe
          saleId="s1"
          deps={{
            fetchImpl: fetchImpl as never,
            EventSourceImpl: FakeEventSource as never,
          }}
        />,
      );
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await act(async () => {
      FakeEventSource.instances[0]?.send({ type: "sale.paid", saleId: "other" });
    });
    expect(shown()).toBe("awaiting");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("closes the EventSource and stops polling on unmount", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse("awaiting"));

    const { unmount } = await act(async () =>
      render(
        <Probe
          saleId="s1"
          deps={{
            fetchImpl: fetchImpl as never,
            EventSourceImpl: FakeEventSource as never,
          }}
        />,
      ),
    );
    unmount();

    expect(FakeEventSource.instances[0]?.closed).toBe(true);
    await advance(POLL_MS * 3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
