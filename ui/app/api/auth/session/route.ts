import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

/**
 * Same-origin BFF: browser → ui /api/auth/session → api /auth/session.
 * Forwards Cookie so api (single issuer) can validate the opaque session.
 */
export async function GET(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";
  const upstream = await fetch(`${getApiInternalUrl()}/auth/session`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
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
