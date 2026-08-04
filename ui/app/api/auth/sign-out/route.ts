import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

const SESSION_COOKIE =
  process.env.SESSION_COOKIE_NAME?.trim() || "fh_session";

function clearSessionCookie(response: NextResponse) {
  // Explicit expire — do not rely solely on upstream Set-Cookie forwarding
  // (stale fh_session after revoke caused sign-in ↔ lists redirect loops).
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
  });
}

/**
 * Same-origin BFF: browser → ui /api/auth/sign-out → api /auth/sign-out.
 * Forwards Cookie; always clears fh_session on the browser response.
 */
export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  const upstream = await fetch(`${getApiInternalUrl()}/auth/sign-out`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  const response = new NextResponse(null, {
    status: upstream.status === 204 ? 204 : upstream.status,
  });
  clearSessionCookie(response);
  return response;
}
