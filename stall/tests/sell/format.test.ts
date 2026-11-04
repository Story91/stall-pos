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

describe("parseDollars cap", () => {
  it("rejects prices above $10,000, the server's limit", () => {
    expect(parseDollars("10000")).toBe(1_000_000);
    expect(parseDollars("10000.01")).toBeNull();
    expect(parseDollars("25000")).toBeNull();
  });
});

describe("owner display helpers", () => {
  it("masks an email except its first letter and domain", async () => {
    const { maskEmail } = await import("@/lib/sell/format");
    expect(maskEmail("maria@stall.example")).toBe("m••••@stall.example");
    expect(maskEmail("nope")).toBe("••••");
  });

  it("formats a business date and a time", async () => {
    const { longDate, clockTime } = await import("@/lib/sell/format");
    expect(longDate("2026-11-04")).toBe("Wednesday, November 4");
    expect(clockTime("2026-11-04T21:05:00Z", "America/Chicago")).toBe("3:05 PM");
  });
});
