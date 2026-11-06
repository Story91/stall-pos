// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QrScreen, type QrScreenProps } from "@/components/sell/QrScreen";

afterEach(cleanup);

function props(overrides: Partial<QrScreenProps> = {}): QrScreenProps {
  return {
    qrPng: "iVBORw0KGgo=",
    payLink: "https://www.sandbox.paypal.com/invoice/p/#INV2-TEST",
    totalCents: 1840,
    status: "awaiting",
    cashPending: false,
    cashError: null,
    onCash: () => {},
    onPaid: () => {},
    onNewSale: () => {},
    cancelPending: false,
    onCancelSale: () => {},
    ...overrides,
  };
}

describe("QrScreen", () => {
  it("shows the QR image, the total and the waiting status", () => {
    render(<QrScreen {...props()} />);

    const img = screen.getByRole("img", { name: /scan to pay/i }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(screen.getByText("$18.40")).toBeTruthy();
    expect(screen.getByText("Waiting for payment…")).toBeTruthy();
  });

  it("shows the confirmation and calls onPaid once when the status becomes paid", () => {
    const onPaid = vi.fn();
    const { rerender } = render(<QrScreen {...props({ onPaid })} />);
    expect(onPaid).not.toHaveBeenCalled();

    rerender(<QrScreen {...props({ onPaid, status: "paid" })} />);

    expect(screen.getByRole("heading", { name: /paid/i })).toBeTruthy();
    expect(screen.queryByText("Waiting for payment…")).toBeNull();
    expect(onPaid).toHaveBeenCalledTimes(1);

    rerender(<QrScreen {...props({ onPaid, status: "paid" })} />);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it("asks before recording cash, then calls onCash", () => {
    const onCash = vi.fn();
    render(<QrScreen {...props({ onCash })} />);

    fireEvent.click(screen.getByRole("button", { name: "Paid in cash" }));
    expect(onCash).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, got $18.40 cash" }));

    expect(onCash).toHaveBeenCalledTimes(1);
  });

  it("labels a cash payment and offers a new sale", () => {
    const onNewSale = vi.fn();
    render(<QrScreen {...props({ status: "paid_cash", onNewSale })} />);

    expect(screen.getByText("Cash")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New sale" }));
    expect(onNewSale).toHaveBeenCalledTimes(1);
  });

  it("asks before cancelling the open invoice, and only then cancels", () => {
    const onCancelSale = vi.fn();
    const onNewSale = vi.fn();
    render(<QrScreen {...props({ onCancelSale, onNewSale })} />);

    fireEvent.click(screen.getByRole("button", { name: "Start a different sale" }));
    expect(onCancelSale).not.toHaveBeenCalled();
    expect(screen.getByText(/Cancel this invoice?/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep waiting" }));
    expect(screen.queryByText(/Cancel this invoice?/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start a different sale" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(onCancelSale).toHaveBeenCalledTimes(1);
    expect(onNewSale).not.toHaveBeenCalled();
  });

  it("a cancelled invoice just starts a new sale", () => {
    const onNewSale = vi.fn();
    render(<QrScreen {...props({ status: "cancelled", onNewSale })} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a different sale" }));
    expect(onNewSale).toHaveBeenCalledTimes(1);
  });
});
