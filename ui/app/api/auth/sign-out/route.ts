import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

const SESSION_COOKIE =
  process.env.SESSION_COOKIE_NAME?.trim() || "fh_session";

function sessionSameSite(): "lax" | "strict" | "none" {
  const raw = (process.env.SESSION_COOKIE_SAMESITE || "lax").trim().toLowerCase();
  if (raw === "strict" || raw === "none") return raw;
  return "lax";
}

function clearSessionCookie(response: NextResponse) {
  // Explicit expire — match issued-cookie attributes so browsers drop fh_session.
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: sessionSameSite(),
    secure: process.env.SESSION_COOKIE_SECURE === "true",
  });
}

/**
 * Same-origin BFF: browser → ui /api/auth/sign-out → api /auth/sign-out.
 * Always clears fh_session even if upstream fetch fails.
 */
export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  let status = 204;

  try {
    const upstream = await fetch(`${getApiInternalUrl()}/auth/sign-out`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    });
    status = upstream.status === 204 ? 204 : upstream.status;
  } catch {
    // Upstream down — still drop the browser cookie (fail closed to signed-out UI).
    status = 204;
  }

  const response = new NextResponse(null, { status });
  clearSessionCookie(response);
  return response;
}
