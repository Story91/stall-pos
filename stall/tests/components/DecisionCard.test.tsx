// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionCard } from "@/components/close/DecisionCard";
import type { DecisionRow } from "@/lib/owner/types";

afterEach(cleanup);

const duplicate: DecisionRow = {
  id: "dec-1",
  date: "2026-11-04",
  type: "duplicate_bill",
  reason: "Possible duplicate: a $240.00 bill for Tortillería Rosa was already paid on 2026-11-02.",
  status: "open",
  shiftId: null,
  billId: "bill-new",
  source: {
    obligation: {
      kind: "bill",
      id: "bill-new",
      payee: { name: "Tortillería Rosa" },
      amountCents: 24000,
      note: "Tortillas, 40 dozen",
      date: "2026-11-04",
    },
    evidence: {
      paidBillId: "bill-old",
      payoutBatchId: "st-b-a1b2c3d4e5f60718293a4b5c6",
      amountCents: 23500,
      note: "tortillas",
      date: "2026-11-02",
    },
  },
};

describe("DecisionCard", () => {
  it("shows the new bill and the already-paid bill side by side for a duplicate", () => {
    render(<DecisionCard decision={duplicate} onAction={vi.fn()} />);

    const fresh = screen.getByRole("group", { name: "This bill" });
    expect(fresh.textContent).toContain("$240.00");
    expect(fresh.textContent).toContain("Tortillas, 40 dozen");
    expect(fresh.textContent).toContain("Nov 4");

    const paid = screen.getByRole("group", { name: "Already paid" });
    expect(paid.textContent).toContain("$235.00");
    expect(paid.textContent).toContain("tortillas");
    expect(paid.textContent).toContain("Nov 2");
    expect(paid.textContent).toContain("st-b-a1b2c3d4e5f60718293a4b5c6");

    expect(screen.getByText("Possible duplicate")).toBeTruthy(); // the type badge
    expect(screen.getByText(/already paid on 2026-11-02/)).toBeTruthy(); // the reason
  });

  it("shows the agent's rationale beneath the rules reason when it adds something", () => {
    const decision: DecisionRow = {
      ...duplicate,
      source: { ...duplicate.source, rulesReason: duplicate.reason, agentRationale: "Amounts differ by $5, so I stopped." },
    };
    render(<DecisionCard decision={decision} onAction={vi.fn()} />);
    expect(screen.getByText(duplicate.reason)).toBeTruthy();
    expect(screen.getByText(/Amounts differ by \$5/)).toBeTruthy();
  });

  it("hides the agent's rationale when it echoes the rules reason", () => {
    const decision: DecisionRow = {
      ...duplicate,
      source: {
        ...duplicate.source,
        rulesReason: duplicate.reason,
        agentRationale: "possible duplicate: a $240.00 bill for Tortillería Rosa was already paid on 2026-11-02",
      },
    };
    render(<DecisionCard decision={decision} onAction={vi.fn()} />);
    expect(screen.getAllByText(/already paid on 2026-11-02/)).toHaveLength(1);

    const contained: DecisionRow = {
      ...duplicate,
      source: { ...duplicate.source, rulesReason: duplicate.reason, agentRationale: "Possible duplicate" },
    };
    cleanup();
    render(<DecisionCard decision={contained} onAction={vi.fn()} />);
    expect(screen.queryByTestId("agent-rationale")).toBeNull();
  });

  it("asks to confirm before approving, then calls onAction('approve')", async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true });
    render(<DecisionCard decision={duplicate} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yes, pay $240.00" }));
    expect(onAction).toHaveBeenCalledWith("approve", 24000);
    await screen.findByRole("button", { name: "Approve" });
  });

  it("lets the owner back out of a confirm step", () => {
    const onAction = vi.fn();
    render(<DecisionCard decision={duplicate} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as already paid" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it("shows the server's message and disables the actions after a 409", async () => {
    const onAction = vi.fn().mockResolvedValue({
      ok: false,
      message: "This was already decided. The card shows the outcome.",
      conflict: true,
    });
    render(<DecisionCard decision={duplicate} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, decline" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("already decided");
    for (const name of ["Approve", "Decline", "Mark as already paid"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("pays and shows the current amount from the API, not the one stored when the card was made", async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true });
    render(<DecisionCard decision={{ ...duplicate, currentAmountCents: 25000 }} onAction={onAction} />);
    expect(screen.getByRole("article").querySelector("header")!.textContent).toContain("$250.00");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, pay $250.00" }));
    expect(onAction).toHaveBeenCalledWith("approve", 25000);
    await screen.findByRole("button", { name: "Approve" });
  });

  it("offers no Approve on an escalated card whose PayPal batch is already used, only the hand-pay path", () => {
    const escalated: DecisionRow = {
      ...duplicate,
      type: "escalated",
      reason: "previous payout FAILED; check before paying again",
      payoutBlocked: true,
    };
    render(<DecisionCard decision={escalated} onAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText("Pay by hand in PayPal, then tap Mark as already paid")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark as already paid" })).toBeTruthy();
  });

  it("keeps Approve on an escalated card when no payout was ever sent for it", () => {
    render(
      <DecisionCard decision={{ ...duplicate, type: "escalated", payoutBlocked: false }} onAction={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.queryByText(/Pay by hand in PayPal/)).toBeNull();
  });

  it("shows the outcome instead of buttons once resolved", () => {
    render(<DecisionCard decision={{ ...duplicate, status: "marked_paid" }} onAction={vi.fn()} />);
    expect(screen.getByText("Marked as already paid")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
