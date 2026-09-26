import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ cardId: string }>;
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
 * Same-origin BFF: /api/cards/{cardId} → api /cards/{cardId} (delete a card
 * — the backend unlinks its ledger entries to "No Origin" first).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { cardId } = await context.params;
  const headers = forwardCookie(request);

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/cards/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
      headers,
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
  const responseHeaders: Record<string, string> = {};
  if (text) {
    responseHeaders["Content-Type"] = upstream.headers.get("Content-Type") || "application/json";
  }
  return new NextResponse(text, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
