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
      payoutBatchId: "stall-b1-bill-bill-old",
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
    expect(paid.textContent).toContain("stall-b1-bill-bill-old");

    expect(screen.getByText("Possible duplicate")).toBeTruthy(); // the type badge
    expect(screen.getByText(/already paid on 2026-11-02/)).toBeTruthy(); // the reason
  });

  it("asks to confirm before approving, then calls onAction('approve')", async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true });
    render(<DecisionCard decision={duplicate} onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yes, pay $240.00" }));
    expect(onAction).toHaveBeenCalledWith("approve");
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

  it("shows the outcome instead of buttons once resolved", () => {
    render(<DecisionCard decision={{ ...duplicate, status: "marked_paid" }} onAction={vi.fn()} />);
    expect(screen.getByText("Marked as already paid")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
