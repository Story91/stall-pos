import { NextResponse, type NextRequest } from "next/server";
import { decideAccess } from "@/lib/access";
import { isOwner } from "@/lib/auth";

// Next 16 renamed middleware to proxy (src/proxy.ts); it runs on the Node.js runtime,
// so the cookie check reuses lib/auth's HMAC compare.

function hasValidCookie(request: NextRequest): boolean {
  try {
    return isOwner(request);
  } catch {
    // Missing env (OWNER_PIN, CLOSE_TRIGGER_KEY): nobody is the owner.
    return false;
  }
}

export function proxy(request: NextRequest): Response {
  const { pathname, search } = request.nextUrl;
  const access = decideAccess(
    pathname,
    search,
    hasValidCookie(request),
    request.headers.has("authorization"),
  );
  if (access === "allow") return NextResponse.next();
  if (access === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/pin";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except build assets and the public files a browser fetches before any login.
  // API paths are always matched, even ones ending in .txt or .png. "[.]" rather than "\.":
  // Next re-parses the source, and an escaped dot came out as a wildcard.
  matcher: [
    "/((?!_next/static|_next/image|favicon[.]ico$|manifest[.]webmanifest$|(?!api/).*[.](?:png|svg|jpg|ico|webmanifest|txt)$).*)",
  ],
};
