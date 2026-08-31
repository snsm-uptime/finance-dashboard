import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ listId: string }>;
};

function forwardCookie(request: NextRequest): Headers {
  const headers = new Headers({ Accept: "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

/**
 * Same-origin BFF: POST /api/lists/{id}/settle → api POST /lists/{id}/settle.
 * No body: v1 settle scope is "settle everything I currently owe on this list".
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { listId } = await context.params;

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/settle`, {
      method: "POST",
      headers: forwardCookie(request),
      cache: "no-store",
    });
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
