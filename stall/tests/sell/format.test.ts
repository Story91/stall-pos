import { describe, expect, it } from "vitest";
import { formatCents, parseDollars } from "@/lib/sell/format";

describe("formatCents", () => {
  it("formats integer cents as dollars", () => {
    expect(formatCents(1299)).toBe("$12.99");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(123456)).toBe("$1,234.56");
  });
});

describe("parseDollars", () => {
  it("parses typed prices into cents", () => {
    expect(parseDollars("4.50")).toBe(450);
    expect(parseDollars("4.5")).toBe(450);
    expect(parseDollars("4")).toBe(400);
    expect(parseDollars("$ 3.25")).toBe(325);
    expect(parseDollars("3,25")).toBe(325);
    expect(parseDollars(".99")).toBe(99);
  });

  it("rejects empty, zero, and malformed input", () => {
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("0")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("1.234")).toBeNull();
    expect(parseDollars("-2")).toBeNull();
  });
});
