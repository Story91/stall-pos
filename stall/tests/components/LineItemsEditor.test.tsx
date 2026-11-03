// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineItemsEditor } from "@/components/sell/LineItemsEditor";
import type { ItemRow } from "@/lib/sell/rows";

const TAX = 0.0825;

const taco: ItemRow = {
  id: "r1",
  name: "Taco al pastor",
  qty: 2,
  unitCents: 350,
  taxable: true,
  confidence: 0.95,
};
const agua: ItemRow = {
  id: "r2",
  name: "Agua fresca",
  qty: 1,
  unitCents: 300,
  taxable: false,
  confidence: 0.9,
};

function Harness({ initial, onCharge = () => {} }: { initial: ItemRow[]; onCharge?: () => void }) {
  const [rows, setRows] = useState(initial);
  return (
    <LineItemsEditor
      rows={rows}
      onRowsChange={setRows}
      taxRate={TAX}
      tipPct={null}
      charging={false}
      onCharge={onCharge}
    />
  );
}

afterEach(cleanup);

describe("LineItemsEditor", () => {
  it("renders one row per item with quantity, name and line price", () => {
    render(<Harness initial={[taco, agua]} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Taco al pastor")).toBeTruthy();
    expect(within(rows[0]!).getByText("$7.00")).toBeTruthy();
    expect(within(rows[1]!).getByText("Agua fresca")).toBeTruthy();
    // 700 taxable * 8.25% = 57.75 -> 58; 1000 + 58
    expect(screen.getByRole("button", { name: "Charge $10.58" })).toBeTruthy();
  });

  it("blocks Charge while an item needs a price, and unblocks once one is typed", () => {
    const onCharge = vi.fn();
    render(<Harness initial={[taco, { ...agua, unitCents: null }]} onCharge={onCharge} />);

    expect(screen.getByText("Needs a price")).toBeTruthy();
    const charge = screen.getByRole("button", { name: /charge/i }) as HTMLButtonElement;
    expect(charge.disabled).toBe(true);
    fireEvent.click(charge);
    expect(onCharge).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Price for Agua fresca"), {
      target: { value: "3" },
    });

    const enabled = screen.getByRole("button", { name: "Charge $10.58" }) as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    fireEvent.click(enabled);
    expect(onCharge).toHaveBeenCalledTimes(1);
  });

  it("edits a quantity inline and recomputes the total", () => {
    render(<Harness initial={[taco, agua]} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Taco al pastor" }));
    fireEvent.click(screen.getByRole("button", { name: "One more Taco al pastor" }));

    expect(screen.getByText("$10.50")).toBeTruthy();
    // 1050 taxable * 8.25% = 86.625 -> 87; 1350 + 87
    expect(screen.getByRole("button", { name: "Charge $14.37" })).toBeTruthy();
  });

  it("flags low-confidence items for a second look", () => {
    render(<Harness initial={[{ ...taco, confidence: 0.4 }, agua]} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Check this one")).toBeTruthy();
    expect(within(rows[1]!).queryByText("Check this one")).toBeNull();
  });

  it("deletes a row with its remove button", () => {
    render(<Harness initial={[taco, agua]} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Agua fresca" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Agua fresca")).toBeNull();
  });
});
