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
 * Same-origin BFF: /api/budgets/{budgetId}/period-preview → api
 * /budgets/{budgetId}/period-preview (Story 7.5 — excluded-lines diff for
 * the period-change confirmation Sheet).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { budgetId } = await context.params;
  const search = new URL(request.url).searchParams;
  const upstreamParams = new URLSearchParams();
  const periodStart = search.get("period_start");
  const periodEnd = search.get("period_end");
  if (periodStart) upstreamParams.set("period_start", periodStart);
  if (periodEnd) upstreamParams.set("period_end", periodEnd);
  const query = upstreamParams.toString();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}/period-preview${query ? `?${query}` : ""}`,
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
