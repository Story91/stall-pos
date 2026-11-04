// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PayeeChips } from "@/components/day/PayeeChips";
import type { PayeeRow } from "@/lib/owner/types";

afterEach(cleanup);

const helper = (id: string, name: string): PayeeRow => ({
  id,
  name,
  email: `${name.toLowerCase()}@stall.example`,
  role: "helper",
  dailyRateCents: 12000,
  maxPerDayCents: 15000,
  autoPay: true,
  enabled: true,
});

const payees = [helper("p-maria", "Maria"), helper("p-luis", "Luis")];

describe("PayeeChips", () => {
  it("toggles a shift on and off through onToggle", () => {
    const onToggle = vi.fn();
    render(
      <PayeeChips
        payees={payees}
        worked={new Set(["p-maria"])}
        busy={new Set()}
        messages={{}}
        onToggle={onToggle}
      />,
    );

    const maria = screen.getByRole("button", { name: /Maria/ });
    const luis = screen.getByRole("button", { name: /Luis/ });
    expect(maria.getAttribute("aria-pressed")).toBe("true");
    expect(luis.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(luis);
    expect(onToggle).toHaveBeenCalledWith("p-luis", false);
    fireEvent.click(maria);
    expect(onToggle).toHaveBeenCalledWith("p-maria", true);
  });

  it("shows a per-person message and blocks taps while saving", () => {
    const onToggle = vi.fn();
    render(
      <PayeeChips
        payees={payees}
        worked={new Set(["p-maria"])}
        busy={new Set(["p-luis"])}
        messages={{ "p-maria": "Already paid" }}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText("Already paid")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Luis/ }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("explains what to do when there are no helpers", () => {
    render(<PayeeChips payees={[]} worked={new Set()} busy={new Set()} messages={{}} onToggle={vi.fn()} />);
    expect(screen.getByText(/No helpers yet/)).toBeTruthy();
  });
});
