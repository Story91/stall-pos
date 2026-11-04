import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Next 16 ships only the middleware-named helper; it reads the same `config.matcher`.
const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it("runs on pages and every API route, including ones that look like files", () => {
    for (const url of ["/", "/sell", "/day", "/pin", "/api/sales", "/api/sales/x.txt", "/api/a.png"]) {
      expect(runs(url), url).toBe(true);
    }
  });

  it("skips build assets and public files", () => {
    for (const url of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico", "/manifest.webmanifest", "/next.svg"]) {
      expect(runs(url), url).toBe(false);
    }
  });

  it("does not skip lookalikes of the favicon", () => {
    expect(runs("/faviconXico")).toBe(true);
  });
});
