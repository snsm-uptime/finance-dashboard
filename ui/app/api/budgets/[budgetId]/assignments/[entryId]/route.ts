import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ budgetId: string; entryId: string }>;
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
 * Same-origin BFF: /api/budgets/{budgetId}/assignments/{entryId} → api
 * /budgets/{budgetId}/assignments/{entryId} (Story 7.3 — unassign).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { budgetId, entryId } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}/assignments/${encodeURIComponent(entryId)}`,
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
  return new NextResponse(text.length > 0 ? text : null, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
}
