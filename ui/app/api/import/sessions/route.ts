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

/**
 * Same-origin BFF: browser → ui /api/import/sessions → api /import/sessions.
 * multipart/form-data — re-posts the incoming FormData verbatim rather than
 * the JSON-body proxy shape other BFF routes use (Story 4.6).
 */
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { detail: "Invalid form data.", code: "invalid_body" },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/import/sessions`, {
      method: "POST",
      headers: forwardCookie(request),
      body: formData,
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
