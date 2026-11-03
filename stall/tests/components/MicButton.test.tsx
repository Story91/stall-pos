// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MicButton } from "@/components/sell/MicButton";

afterEach(cleanup);

const base = {
  supported: true,
  size: "hero" as const,
  idleLabel: "Hold to talk",
  onPressStart: () => {},
  onPressEnd: () => {},
};

describe("MicButton", () => {
  it("keeps its name while listening and announces the state in a live region", () => {
    const { rerender } = render(<MicButton {...base} state="idle" />);
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");

    rerender(<MicButton {...base} state="listening" />);

    const button = screen.getByRole("button", { name: "Hold to talk" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Listening… let go when done");
  });

  it("starts on press and finishes on release", () => {
    const onPressStart = vi.fn();
    const onPressEnd = vi.fn();
    const { rerender } = render(
      <MicButton {...base} state="idle" onPressStart={onPressStart} onPressEnd={onPressEnd} />,
    );

    fireEvent.pointerDown(screen.getByRole("button"), { button: 0, pointerId: 1 });
    expect(onPressStart).toHaveBeenCalledTimes(1);

    rerender(
      <MicButton {...base} state="listening" onPressStart={onPressStart} onPressEnd={onPressEnd} />,
    );
    fireEvent.pointerUp(screen.getByRole("button"), { pointerId: 1 });
    expect(onPressEnd).toHaveBeenCalledTimes(1);
  });
});
