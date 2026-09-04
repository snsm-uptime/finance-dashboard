import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type CreateBudgetBody = {
  name?: unknown;
  cap?: unknown;
  currency?: unknown;
  source_list_ids?: unknown;
  period_start?: unknown;
  period_end?: unknown;
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
 * Same-origin BFF: /api/budgets → api /budgets (Story 7.1 — standalone,
 * owner-scoped; no listId param).
 */
export async function GET(request: NextRequest) {
  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/budgets`, {
      method: "GET",
      headers: forwardCookie(request),
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

export async function POST(request: NextRequest) {
  let body: CreateBudgetBody;
  try {
    body = (await request.json()) as CreateBudgetBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name : "";
  const cap = typeof body.cap === "string" ? body.cap : "";
  const currency = typeof body.currency === "string" ? body.currency : "";
  const sourceListIds = Array.isArray(body.source_list_ids)
    ? body.source_list_ids.filter((id): id is string => typeof id === "string")
    : [];
  const periodStart = typeof body.period_start === "string" ? body.period_start : null;
  const periodEnd = typeof body.period_end === "string" ? body.period_end : null;

  const headers = forwardCookie(request);
  headers.set("Content-Type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/budgets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        cap,
        currency,
        source_list_ids: sourceListIds,
        period_start: periodStart,
        period_end: periodEnd,
      }),
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
