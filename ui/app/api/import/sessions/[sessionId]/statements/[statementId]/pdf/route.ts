import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

function forwardCookie(request: NextRequest): Headers {
  const headers = new Headers({
    Accept: "application/pdf",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

/**
 * Same-origin BFF stream: statement PDF bytes (Story 5.1). Never JSON-encodes the operator path.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; statementId: string }> },
) {
  const { sessionId, statementId } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/import/sessions/${encodeURIComponent(
        sessionId,
      )}/statements/${encodeURIComponent(statementId)}/pdf`,
      {
        method: "GET",
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

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("Content-Type") || "application/pdf",
  );
  const cache = upstream.headers.get("Cache-Control");
  if (cache) headers.set("Cache-Control", cache);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
