import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ conflictId: string }>;
};

function forwardCookie(request: NextRequest): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

/**
 * Same-origin BFF: POST /api/import-conflicts/{id}/resolve
 * → api POST /import-conflicts/{id}/resolve.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { conflictId } = await context.params;
  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/import-conflicts/${encodeURIComponent(conflictId)}/resolve`,
      {
        method: "POST",
        headers: forwardCookie(request),
        body,
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { detail: "Upstream unavailable.", code: "bad_gateway" },
      { status: 502 },
    );
  }

  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
}
