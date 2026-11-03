import { describe, expect, it } from "vitest";
import { businessDate, daysAgo } from "@/lib/dates";

describe("businessDate", () => {
  it("returns the business-timezone calendar date, not the UTC date", () => {
    // 03:30 UTC on Nov 8 is 21:30 on Nov 7 in Chicago (CST, UTC-6).
    expect(
      businessDate(new Date("2026-11-08T03:30:00Z"), "America/Chicago"),
    ).toBe("2026-11-07");
  });

  it("formats as YYYY-MM-DD with zero padding", () => {
    expect(
      businessDate(new Date("2026-03-05T18:00:00Z"), "America/Chicago"),
    ).toBe("2026-03-05");
  });

  it("throws RangeError for an invalid timezone", () => {
    expect(() => businessDate(new Date(), "Not/AZone")).toThrow(RangeError);
  });
});

describe("daysAgo", () => {
  it("subtracts whole days", () => {
    expect(daysAgo("2026-11-08", 2)).toBe("2026-11-06");
  });

  it("crosses a month boundary", () => {
    expect(daysAgo("2026-03-01", 1)).toBe("2026-02-28");
  });

  it("returns the same date for zero days", () => {
    expect(daysAgo("2026-11-08", 0)).toBe("2026-11-08");
  });

  it("is not affected by the DST transition on Nov 1 2026", () => {
    expect(daysAgo("2026-11-02", 1)).toBe("2026-11-01");
    expect(daysAgo("2026-11-02", 2)).toBe("2026-10-31");
  });
});
