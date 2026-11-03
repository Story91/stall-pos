import { describe, expect, it, vi } from "vitest";
import { emit, subscribe } from "@/lib/events";

describe("events", () => {
  it("delivers to subscribers until they unsubscribe", () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    emit({ type: "sale.paid", saleId: "s1" });
    off();
    emit({ type: "sale.paid", saleId: "s2" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ type: "sale.paid", saleId: "s1" });
  });

  it("a throwing subscriber does not stop the others", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();
    const offBad = subscribe(() => {
      throw new Error("boom");
    });
    const offGood = subscribe(good);
    emit({ type: "payout.updated", payoutId: "p1" });
    offBad();
    offGood();
    spy.mockRestore();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
