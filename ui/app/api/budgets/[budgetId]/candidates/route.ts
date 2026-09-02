import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ budgetId: string }>;
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
 * Same-origin BFF: /api/budgets/{budgetId}/candidates → api
 * /budgets/{budgetId}/candidates (Story 7.3 — not-yet-assigned committed lines).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { budgetId } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}/candidates`,
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

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
}
