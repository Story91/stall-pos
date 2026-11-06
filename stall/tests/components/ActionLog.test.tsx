// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActionLog } from "@/components/close/ActionLog";
import type { LogEntry } from "@/lib/owner/types";

afterEach(cleanup);

const NOTE = "Paid Maria $120.00 for the day. Held Rosa's $240.00 bill as a possible duplicate.";
const at = "2026-11-04T22:00:00Z";
const names = new Map([["ob-1", "Maria"]]);

const paid: LogEntry = {
  step: 1,
  tool: "pay_obligation",
  input: { obligationId: "ob-1", rationale: "Worked the full day" },
  result: { ok: true },
  at,
};
const summary: LogEntry = { step: 2, tool: "write_summary", input: { text: NOTE }, result: { ok: true }, at };
const said = (text: string): LogEntry => ({ step: 3, tool: "model_text", input: { text }, result: null, at });

describe("ActionLog", () => {
  it("shows write_summary as one line without repeating the note", () => {
    render(<ActionLog log={[paid, summary]} names={names} />);
    expect(screen.getByText("Wrote the end-of-day note")).toBeTruthy();
    expect(screen.queryByText(/Held Rosa/)).toBeNull();
  });

  it("drops the Agent said entry when it repeats the note", () => {
    render(<ActionLog log={[paid, summary, said(`**${NOTE}**`)]} names={names} />);
    expect(screen.queryByText("Agent said")).toBeNull();
  });

  it("renders an Agent said entry as plain text when there is no note", () => {
    render(
      <ActionLog
        log={[paid, said("**Paid:** Maria\n- one bill held\n- nothing else")]}
        names={names}
      />,
    );
    expect(screen.getByText("Agent said")).toBeTruthy();
    const line = screen.getByText(/Paid: Maria/);
    expect(line.textContent).not.toContain("**");
    expect(line.textContent).toContain("• one bill held");
  });

  it("hides the model's closing words when its note is shown above, even when paraphrased", () => {
    render(<ActionLog log={[paid, summary, said("Paid Maria; also held one bill for you.")]} names={names} />);
    expect(screen.queryByText("Agent said")).toBeNull();
  });

  it("keeps money-moving entries unchanged", () => {
    const held: LogEntry = {
      step: 4,
      tool: "hold_obligation",
      input: { obligationId: "ob-1", rationale: "Looks like a duplicate" },
      result: { ok: true },
      at,
    };
    const refused: LogEntry = {
      step: 5,
      tool: "pay_obligation",
      input: { obligationId: "ob-1", rationale: "Pay again" },
      result: { ok: false, error: "over_daily_limit" },
      at,
    };
    render(<ActionLog log={[paid, held, refused]} names={names} />);
    expect(screen.getByText("Maria: Worked the full day")).toBeTruthy();
    expect(screen.getByText("Held for you")).toBeTruthy();
    expect(screen.getByText("Maria: Looks like a duplicate")).toBeTruthy();
    expect(screen.getByText("refused")).toBeTruthy();
    // Plain words for the owner; the raw error stays under Details.
    expect(screen.getByText("Not allowed by your limits, so nothing was paid.")).toBeTruthy();
    expect(screen.getByText("over_daily_limit")).toBeTruthy();
  });

  it("explains an unreachable agent without the raw API error up front", () => {
    const down: LogEntry = { step: 1, tool: "model_error", input: null, result: "invalid x-api-key", at };
    render(<ActionLog log={[down]} names={names} tz="America/Chicago" />);
    expect(screen.getByText(/The AI agent could not be reached/)).toBeTruthy();
    expect(screen.getByText("invalid x-api-key").closest("details")).toBeTruthy();
  });
});
