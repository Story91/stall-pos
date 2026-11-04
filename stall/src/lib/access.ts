// Pure access rules for the proxy: no Next or Node imports, so they are easy to test.

export type Access = "allow" | "redirect" | "unauthorized";

/** API routes that authenticate themselves (PayPal signature, the PIN check) or carry no private data. */
const PUBLIC_API = new Set(["/api/paypal/webhook", "/api/events", "/api/health", "/api/pin"]);

export function decideAccess(pathname: string, search: string, hasValidCookie: boolean): Access {
  if (pathname === "/pin") return "allow";
  if (hasValidCookie) return "allow";
  if (PUBLIC_API.has(pathname)) return "allow";
  // The external scheduler: the close route itself checks the key against CLOSE_TRIGGER_KEY.
  if (pathname === "/api/close" && new URLSearchParams(search).has("key")) return "allow";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "unauthorized";
  return "redirect";
}

/** Where the PIN screen sends the owner afterwards: same-origin paths only. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/sell";
  if (next === "/pin" || next.startsWith("/pin?")) return "/sell";
  return next;
}
