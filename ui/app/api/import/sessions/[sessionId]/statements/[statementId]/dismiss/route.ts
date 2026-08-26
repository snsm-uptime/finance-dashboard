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
 * Same-origin BFF: dismiss a parse-failed statement (Story 5.2).
 * browser → ui /api/import/sessions/{id}/statements/{id}/dismiss
 *        → api /import/sessions/{id}/statements/{id}/dismiss
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; statementId: string }> },
) {
  const { sessionId, statementId } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/import/sessions/${encodeURIComponent(
        sessionId,
      )}/statements/${encodeURIComponent(statementId)}/dismiss`,
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
