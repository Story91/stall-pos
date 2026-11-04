import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideAccess } from "@/lib/access";

describe("decideAccess", () => {
  it("redirects a page to the PIN screen without the owner cookie", () => {
    expect(decideAccess("/sell", "", false)).toBe("redirect");
    expect(decideAccess("/day", "?x=1", false)).toBe("redirect");
    expect(decideAccess("/", "", false)).toBe("redirect");
  });

  it("answers 401 for an API route without the owner cookie", () => {
    expect(decideAccess("/api/sales", "", false)).toBe("unauthorized");
    expect(decideAccess("/api/day/2026-11-04", "", false)).toBe("unauthorized");
    expect(decideAccess("/api/close", "", false)).toBe("unauthorized");
    expect(decideAccess("/api/close/2026-11-04", "?key=x", false)).toBe("unauthorized");
    expect(decideAccess("/api/reset-demo", "", false)).toBe("unauthorized");
  });

  it("lets PayPal, the event stream, health and the PIN endpoint through", () => {
    expect(decideAccess("/api/paypal/webhook", "", false)).toBe("allow");
    expect(decideAccess("/api/events", "", false)).toBe("allow");
    expect(decideAccess("/api/health", "", false)).toBe("allow");
    expect(decideAccess("/api/pin", "", false)).toBe("allow");
  });

  it("lets Vercel Cron through /api/close when an Authorization header is present", () => {
    expect(decideAccess("/api/close", "", false, true)).toBe("allow");
    expect(decideAccess("/api/close", "", false, false)).toBe("unauthorized");
    expect(decideAccess("/api/sales", "", false, true)).toBe("unauthorized");
  });

  it("lets the scheduler ping /api/close with a key; the route checks the key", () => {
    expect(decideAccess("/api/close", "?key=x", false)).toBe("allow");
  });

  it("does not let lookalike paths borrow a public prefix", () => {
    expect(decideAccess("/api/paypal/webhook-admin", "", false)).toBe("unauthorized");
    expect(decideAccess("/api/pins", "", false)).toBe("unauthorized");
    expect(decideAccess("/pinboard", "", false)).toBe("redirect");
  });

  it("always shows the PIN page", () => {
    expect(decideAccess("/pin", "", false)).toBe("allow");
    expect(decideAccess("/pin", "?next=%2Fday", true)).toBe("allow");
  });

  it("allows everything with a valid cookie", () => {
    expect(decideAccess("/sell", "", true)).toBe("allow");
    expect(decideAccess("/api/sales", "", true)).toBe("allow");
  });
});

describe("safeNext control characters", () => {
  it("rejects NUL, other C0 controls and DEL anywhere in the path", async () => {
    const { safeNext } = await import("@/lib/access");
    for (const bad of ["/day\u0000", "/\u0009/evil.test", "/day\u001f", "/day\u007f"]) {
      expect(safeNext(bad)).toBe("/sell");
    }
    expect(safeNext("/day")).toBe("/day");
  });

  it("is plain text in the repo: no raw control bytes in the source", () => {
    const source = readFileSync("src/lib/access.ts", "utf8");
    expect(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps same-origin paths and rejects everything else", async () => {
    const { safeNext } = await import("@/lib/access");
    expect(safeNext("/day?x=1")).toBe("/day?x=1");
    expect(safeNext(null)).toBe("/sell");
    expect(safeNext("https://evil.example")).toBe("/sell");
    expect(safeNext("//evil.example")).toBe("/sell");
    expect(safeNext(`/${String.fromCharCode(92)}evil.example`)).toBe("/sell");
    expect(safeNext("/pin")).toBe("/sell");
  });

  it("rejects control characters browsers would strip into a protocol-relative URL", async () => {
    const { safeNext } = await import("@/lib/access");
    // What /pin reads from ?next=/%09/evil.example after URL decoding.
    expect(safeNext(decodeURIComponent("/%09/evil.example"))).toBe("/sell");
    expect(safeNext("/\n/evil.example")).toBe("/sell");
    expect(safeNext("/day\u007f")).toBe("/sell");
    expect(safeNext("//evil")).toBe("/sell");
    expect(safeNext("https://evil")).toBe("/sell");
    expect(safeNext("/close")).toBe("/close");
  });
});
