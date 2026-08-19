import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function forwardCookie(request: NextRequest): Headers {
  const headers = new Headers({
    Accept: "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

/**
 * Same-origin BFF: /api/import/sessions/{sessionId} → api /import/sessions/{sessionId} (Story 4.6).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/import/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: forwardCookie(request),
        cache: "no-store",
      },
    );
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
