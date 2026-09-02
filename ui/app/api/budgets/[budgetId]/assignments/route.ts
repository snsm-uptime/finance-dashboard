import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ budgetId: string }>;
};

type AssignBody = {
  ledger_entry_id?: unknown;
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
 * Same-origin BFF: /api/budgets/{budgetId}/assignments → api
 * /budgets/{budgetId}/assignments (Story 7.3 — manual assignment).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { budgetId } = await context.params;

  let body: AssignBody;
  try {
    body = (await request.json()) as AssignBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const ledgerEntryId = typeof body.ledger_entry_id === "string" ? body.ledger_entry_id : "";

  const headers = forwardCookie(request);
  headers.set("Content-Type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}/assignments`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ ledger_entry_id: ledgerEntryId }),
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
