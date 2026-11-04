import { NextResponse } from "next/server";
import { z } from "zod";
import { OWNER_COOKIE, ownerCookieValue, safeEqual } from "@/lib/auth";
import { env } from "@/lib/env";
import { readJson, toResponse } from "@/lib/salesApi";

export const dynamic = "force-dynamic";

const WRONG_PIN_DELAY_MS = 300;
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

const pinBody = z.object({ pin: z.string().max(32) });

/** Trades the owner PIN for the httpOnly owner cookie. A wrong PIN waits, to slow guessing. */
export async function POST(request: Request): Promise<Response> {
  try {
    const { pin } = pinBody.parse(await readJson(request));
    if (!safeEqual(pin, env.OWNER_PIN)) {
      await new Promise((resolve) => setTimeout(resolve, WRONG_PIN_DELAY_MS));
      return Response.json({ error: "wrong_pin" }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(OWNER_COOKIE, ownerCookieValue(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.APP_URL.startsWith("https"),
      maxAge: THIRTY_DAYS_S,
    });
    return response;
  } catch (error) {
    return toResponse(error);
  }
}
