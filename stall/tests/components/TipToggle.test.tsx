// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TipToggle } from "@/components/sell/TipToggle";

afterEach(cleanup);

describe("TipToggle", () => {
  it("selects 18% and reports it", () => {
    const onChange = vi.fn();
    render(<TipToggle value={null} onChange={onChange} subtotalCents={1000} />);

    fireEvent.click(screen.getByRole("radio", { name: /18%/ }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(18);
  });

  it("marks the current choice as checked and shows the tip amount", () => {
    render(<TipToggle value={15} onChange={() => {}} subtotalCents={1000} />);

    const fifteen = screen.getByRole("radio", { name: /15%/ });
    expect(fifteen.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /18%/ }).getAttribute("aria-checked")).toBe("false");
    expect(fifteen.textContent).toContain("$1.50");
  });

  it("reports 0 for no tip", () => {
    const onChange = vi.fn();
    render(<TipToggle value={18} onChange={onChange} subtotalCents={1000} />);

    fireEvent.click(screen.getByRole("radio", { name: "No tip" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(0);
  });
});
