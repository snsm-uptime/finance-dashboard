import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";
import { forwardUpstreamHeaders, withClientIpHeader } from "@/lib/authBff";

/**
 * Same-origin BFF: browser → ui /api/auth/verify/request → api.
 * Forwards session cookie so the authenticated request path works.
 */
export async function POST(request: NextRequest) {
  const cookie = request.headers.get("cookie") ?? "";
  const upstream = await fetch(`${getApiInternalUrl()}/auth/verify/request`, {
    method: "POST",
    headers: withClientIpHeader(request, {
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    }),
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: forwardUpstreamHeaders(upstream),
  });
}
