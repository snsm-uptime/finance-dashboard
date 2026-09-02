import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ budgetId: string }>;
};

type CreateRuleBody = {
  match_text?: unknown;
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
 * Same-origin BFF: /api/budgets/{budgetId}/rules → api /budgets/{budgetId}/rules
 * (Story 7.3 — attribution rules).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { budgetId } = await context.params;

  let body: CreateRuleBody;
  try {
    body = (await request.json()) as CreateRuleBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const matchText = typeof body.match_text === "string" ? body.match_text : "";

  const headers = forwardCookie(request);
  headers.set("Content-Type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}/rules`, {
      method: "POST",
      headers,
      body: JSON.stringify({ match_text: matchText }),
      cache: "no-store",
    });
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
