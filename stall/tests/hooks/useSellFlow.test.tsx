// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  business: vi.fn(),
  parse: vi.fn(),
  charge: vi.fn(),
  cash: vi.fn(),
}));
vi.mock("@/lib/sell/api", () => ({ sellApi: api }));

import { useSellFlow } from "@/hooks/useSellFlow";
import { canCharge } from "@/lib/sell/rows";

beforeEach(() => {
  api.business.mockResolvedValue({ ok: true, data: { name: "La Esquina", taxRate: 0.0825, currency: "USD" } });
  api.parse.mockResolvedValue({
    ok: true,
    data: {
      language: "en",
      spokenConfirmation: "",
      items: [
        { name: "Taco al pastor", qty: 2, unitCents: 450, confidence: 0.9, taxable: true },
        { name: "Agua fresca", qty: 1, unitCents: 300, confidence: 0.9, taxable: false },
      ],
    },
  });
  api.charge.mockResolvedValue({ ok: false, kind: "paypal" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function ticketThatFailedToCharge() {
  const hook = renderHook(() => useSellFlow());
  await act(async () => {
    hook.result.current.submitText("two tacos al pastor and an agua fresca");
  });
  await act(async () => {
    hook.result.current.charge();
  });
  expect(hook.result.current.notice).toMatchObject({ kind: "retry", action: "charge" });
  return hook;
}

describe("useSellFlow charge", () => {
  it("clearing a price after a failed charge clears the retry and never wedges charging", async () => {
    const { result } = await ticketThatFailedToCharge();

    const cleared = result.current.rows.map((row, i) => (i === 1 ? { ...row, unitCents: null } : row));
    act(() => result.current.setRows(cleared));
    expect(result.current.notice).toBeNull();

    await act(async () => {
      expect(() => result.current.retry()).not.toThrow();
      expect(() => result.current.charge()).not.toThrow();
    });

    expect(result.current.charging).toBe(false);
    expect(canCharge(result.current.rows)).toBe(false);
    expect(api.charge).toHaveBeenCalledTimes(1);
  });

  it("ignores a second Charge while the first is in flight", async () => {
    let resolve: (value: unknown) => void = () => {};
    api.charge.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useSellFlow());
    await act(async () => {
      result.current.submitText("two tacos al pastor and an agua fresca");
    });

    await act(async () => {
      result.current.charge();
      result.current.charge();
    });
    expect(api.charge).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ ok: false, kind: "network" }));
    expect(result.current.charging).toBe(false);
  });
});
