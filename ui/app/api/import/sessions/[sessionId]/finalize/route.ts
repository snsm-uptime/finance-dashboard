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
 * Same-origin BFF: /api/import/sessions/{sessionId}/finalize →
 * api /import/sessions/{sessionId}/finalize (Story 4.12).
 *
 * End of review — releases the source PDF and stamps finalized_at. Called by
 * ImportReviewSheet's Save (Story 4.13.1). No request body.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;

  const headers = forwardCookie(request);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/import/sessions/${encodeURIComponent(sessionId)}/finalize`,
      {
        method: "POST",
        headers,
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
