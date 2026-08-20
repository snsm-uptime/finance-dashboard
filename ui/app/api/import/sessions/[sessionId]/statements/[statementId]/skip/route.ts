import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ sessionId: string; statementId: string }>;
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
 * Same-origin BFF: /api/import/sessions/{sessionId}/statements/{statementId}/skip →
 * api /import/sessions/{sessionId}/statements/{statementId}/skip (Story 4.8).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId, statementId } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/import/sessions/${encodeURIComponent(sessionId)}/statements/${encodeURIComponent(statementId)}/skip`,
      {
        method: "POST",
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
