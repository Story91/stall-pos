import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/apiError";
import { env } from "@/lib/env";

export const OWNER_COOKIE = "stall_owner";

/** Cookie value that proves the owner entered the PIN: HMAC-SHA256(OWNER_PIN) keyed with CLOSE_TRIGGER_KEY, hex. */
export function ownerCookieValue(): string {
  return createHmac("sha256", env.CLOSE_TRIGGER_KEY).update(env.OWNER_PIN).digest("hex");
}

/** Constant-time string compare: hashing first gives equal-length buffers whatever the inputs. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function isOwner(request: Request): boolean {
  const cookie = readCookie(request, OWNER_COOKIE);
  return cookie !== undefined && safeEqual(cookie, ownerCookieValue());
}

/** True when `?key=` equals CLOSE_TRIGGER_KEY (the external scheduler ping). */
export function hasCloseKey(request: Request): boolean {
  const key = new URL(request.url).searchParams.get("key");
  return key !== null && key !== "" && safeEqual(key, env.CLOSE_TRIGGER_KEY);
}

/** Throws a 401 unless the request carries the owner cookie. Task 17 adds middleware around this. */
export function requireOwner(request: Request): void {
  if (!isOwner(request)) throw new ApiError(401, "unauthorized");
}
