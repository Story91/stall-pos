import { describe, expect, it } from "vitest";
import { ownerCookieSecure } from "@/lib/auth";

describe("ownerCookieSecure", () => {
  it("is true in production, on Vercel, or behind an https APP_URL", () => {
    expect(ownerCookieSecure("http://localhost:3000", { NODE_ENV: "production" })).toBe(true);
    expect(ownerCookieSecure("http://localhost:3000", { NODE_ENV: "development", VERCEL: "1" })).toBe(true);
    expect(ownerCookieSecure("https://stall.example", { NODE_ENV: "development" })).toBe(true);
  });

  it("is false for plain-http local development", () => {
    expect(ownerCookieSecure("http://localhost:3000", { NODE_ENV: "development" })).toBe(false);
    expect(ownerCookieSecure("http://localhost:3000", { NODE_ENV: "test", VERCEL: "" })).toBe(false);
  });
});
