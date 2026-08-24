import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

function forwardCookie(request: NextRequest): Headers {
  const headers = new Headers({
    Accept: "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

/** Same-origin BFF: /api/import/sessions/active → api /import/sessions/active (Story 4.14). */
export async function GET(request: NextRequest) {
  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/import/sessions/active`, {
      method: "GET",
      headers: forwardCookie(request),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Upstream unavailable.", code: "bad_gateway" },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
}
