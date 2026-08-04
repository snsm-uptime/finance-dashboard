import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

/**
 * Same-origin BFF: browser → ui /api/auth/me → api /auth/me.
 * Forwards Cookie; api remains single session issuer (AD-8).
 */
export async function GET(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";
  const accept = request.headers.get("accept-language") || "";
  const upstream = await fetch(`${getApiInternalUrl()}/auth/me`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(accept ? { "Accept-Language": accept } : {}),
    },
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") || "application/json",
    },
  });
}

export async function PATCH(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";
  const accept = request.headers.get("accept-language") || "";
  const body = await request.text();
  const upstream = await fetch(`${getApiInternalUrl()}/auth/me`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(accept ? { "Accept-Language": accept } : {}),
    },
    body,
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") || "application/json",
    },
  });
}
