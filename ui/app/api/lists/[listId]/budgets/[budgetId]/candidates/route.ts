import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ listId: string; budgetId: string }>;
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
 * Same-origin BFF: GET /api/lists/{id}/budgets/{budgetId}/candidates
 * → api GET /lists/{id}/budgets/{budgetId}/candidates.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { listId, budgetId } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}/candidates`,
      { method: "GET", headers: forwardCookie(request), cache: "no-store" },
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
