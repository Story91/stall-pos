// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloseView, DecisionRow, DecisionStatus } from "@/lib/owner/types";
import { everyDecisionHandled } from "@/lib/owner/closeIssues";
import { MESSAGES } from "@/lib/i18n";

const state = vi.hoisted(() => ({ view: null as unknown }));
vi.mock("@/hooks/useClose", () => ({
  useClose: () => ({
    business: null,
    view: state.view,
    day: null,
    loadError: null,
    reload: vi.fn(),
    running: false,
    runError: null,
    runNotice: null,
    run: vi.fn(),
    resolve: vi.fn(),
    replaySummary: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/close", useRouter: () => ({ push: vi.fn() }) }));

import ClosePage from "@/app/close/page";

afterEach(cleanup);

const decision = (id: string, status: DecisionStatus): DecisionRow => ({
  id,
  date: "2026-11-05",
  type: "manual_payee",
  reason: "Tortillería Rosa is not on auto-pay, so this payment needs your approval.",
  status,
  shiftId: null,
  billId: `bill-${id}`,
  source: { obligation: { kind: "bill", id: `bill-${id}`, payee: { name: "Tortillería Rosa" }, amountCents: 5000, date: "2026-11-05" } },
});

function viewWith(decisions: DecisionRow[]): CloseView {
  return {
    run: {
      summary: "Closed November 5. You decided 1: Tortillería Rosa $50.00 (declined).",
      log: [],
      createdAt: "2026-11-05T20:00:00Z",
    },
    decisions,
    payouts: [],
  };
}

describe("Close screen once the owner has answered", () => {
  it("says nothing waits and titles the section as decisions taken", () => {
    state.view = viewWith([decision("a", "declined"), decision("b", "marked_paid")]);
    render(<ClosePage />);
    expect(screen.getByText(MESSAGES.en.close.allHandled)).toBeTruthy();
    expect(screen.getByRole("heading", { name: MESSAGES.en.close.decided })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: MESSAGES.en.close.needsYou })).toBeNull();
  });

  it("still asks while any decision is open", () => {
    state.view = viewWith([decision("a", "declined"), decision("b", "open")]);
    render(<ClosePage />);
    expect(screen.queryByText(MESSAGES.en.close.allHandled)).toBeNull();
    expect(screen.getByRole("heading", { name: MESSAGES.en.close.needsYou })).toBeTruthy();
  });

  it("has the line in every language", () => {
    for (const messages of Object.values(MESSAGES)) {
      expect(messages.close.allHandled.length).toBeGreaterThan(10);
      expect(messages.close.decided.length).toBeGreaterThan(3);
    }
    expect(everyDecisionHandled([])).toBe(false);
    expect(everyDecisionHandled([{ status: "approved" }])).toBe(true);
  });
});
