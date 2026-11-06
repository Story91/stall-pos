// Pure access rules for the proxy: no Next or Node imports, so they are easy to test.

export type Access = "allow" | "redirect" | "unauthorized";

/** API routes that authenticate themselves (PayPal signature, the PIN check) or carry no private data. */
const PUBLIC_API = new Set(["/api/paypal/webhook", "/api/events", "/api/health", "/api/pin"]);

/** Routes a scheduler calls: the nightly close and the nightly demo reset. Each route checks the credential itself. */
const SCHEDULED_API = new Set(["/api/close", "/api/reset-demo"]);

export function decideAccess(pathname: string, search: string, hasValidCookie: boolean, hasAuthHeader = false): Access {
  if (pathname === "/pin") return "allow";
  if (hasValidCookie) return "allow";
  if (PUBLIC_API.has(pathname)) return "allow";
  // The external scheduler: the route itself checks the key against CLOSE_TRIGGER_KEY.
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; the route validates it too.
  if (SCHEDULED_API.has(pathname) && (new URLSearchParams(search).has("key") || hasAuthHeader)) return "allow";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "unauthorized";
  return "redirect";
}

const CONTROL = /[\u0000-\u001f\u007f]/;
const BASE = "http://stall.invalid";

/** Where the PIN screen sends the owner afterwards: a path on this site, or /sell. */
export function safeNext(next: string | null): string {
  // Browsers strip tabs and newlines from URLs, so "/	/evil" would become "//evil".
  if (!next || CONTROL.test(next) || !next.startsWith("/")) return "/sell";
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return "/sell";
  }
  if (url.origin !== BASE || !url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/sell";
  if (url.pathname === "/pin") return "/sell";
  return url.pathname + url.search + url.hash;
}
