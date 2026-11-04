import { NextResponse } from "next/server";
import { z } from "zod";
import { OWNER_COOKIE, ownerCookieSecure, ownerCookieValue, safeEqual } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  limiterKeys,
  pinLock,
  recordPinFailure,
  recordPinSuccess,
  serializePinCheck,
} from "@/lib/pinLimiter";
import { readJson, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

const WRONG_PIN_DELAY_MS = 300;
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

const pinBody = z.object({ pin: z.string().max(32) });

/** How many digits the keypad should wait for before checking. The length only, never the PIN. */
export function GET(): Response {
  return Response.json({ length: env.OWNER_PIN.length });
}

/**
 * Trades the owner PIN for the httpOnly owner cookie. Checks run one at a time;
 * a wrong PIN waits 300 ms, and 5 wrong PINs in 10 minutes lock the endpoint.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { pin } = pinBody.parse(await readJson(request));
    const keys = limiterKeys(request);
    return await serializePinCheck(async () => {
      const retryAfterSeconds = pinLock(keys, Date.now());
      if (retryAfterSeconds !== null) {
        return Response.json(
          { error: "locked", retryAfterSeconds },
          { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
        );
      }
      if (!safeEqual(pin, env.OWNER_PIN)) {
        await new Promise((resolve) => setTimeout(resolve, WRONG_PIN_DELAY_MS));
        recordPinFailure(keys, Date.now());
        return Response.json({ error: "wrong_pin" }, { status: 401 });
      }
      recordPinSuccess(keys);
      const response = NextResponse.json({ ok: true });
      response.cookies.set(OWNER_COOKIE, ownerCookieValue(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: ownerCookieSecure(env.APP_URL),
        maxAge: THIRTY_DAYS_S,
      });
      return response;
    });
  } catch (error) {
    return toResponse(error);
  }
}
