// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillLogger } from "@/components/day/BillLogger";
import type { PayeeRow } from "@/lib/owner/types";

afterEach(cleanup);

const rosa: PayeeRow = {
  id: "p-rosa",
  name: "Tortillería Rosa",
  email: "rosa@stall.example",
  role: "supplier",
  dailyRateCents: null,
  maxPerDayCents: 50000,
  autoPay: false,
  enabled: true,
};

const base = {
  payees: [rosa],
  mic: "idle" as const,
  micSupported: true,
  onPressStart: () => {},
  onPressEnd: () => {},
  heard: null,
  voiceNotice: null,
  draft: null,
};

describe("BillLogger", () => {
  it("saves a typed bill as integer cents", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<BillLogger {...base} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Who"), { target: { value: "p-rosa" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "240.50" } });
    fireEvent.change(screen.getByLabelText("What for"), { target: { value: "Tortillas" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bill" }));

    expect(onSave).toHaveBeenCalledWith({ payeeId: "p-rosa", amountCents: 24050, note: "Tortillas" });
    expect(await screen.findByText("Saved: Tortillería Rosa $240.50 for Tortillas.")).toBeTruthy();
  });

  it("prefills from what was heard and asks to check it", () => {
    render(
      <BillLogger
        {...base}
        heard="Rosa, 240 dollars for tortillas"
        draft={{ payeeId: "p-rosa", amountCents: 24000, note: "tortillas" }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/Check it, then save/)).toBeTruthy();
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("240.00");
    expect((screen.getByLabelText("What for") as HTMLInputElement).value).toBe("tortillas");
  });

  it("keeps Save disabled until the bill is complete", () => {
    render(<BillLogger {...base} onSave={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Save bill" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
