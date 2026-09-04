import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ budgetId: string }>;
};

type UpdateBudgetBody = {
  name?: unknown;
  cap?: unknown;
  currency?: unknown;
  source_list_ids?: unknown;
  period_start?: unknown;
  period_end?: unknown;
  confirm_period_change?: unknown;
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
 * Same-origin BFF: /api/budgets/{budgetId} → api /budgets/{budgetId} (Story
 * 7.2 — standalone, owner-scoped detail; no listId param).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { budgetId } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}`, {
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

/**
 * Same-origin BFF: PATCH /api/budgets/{budgetId} → api /budgets/{budgetId}
 * (Story 7.5 — budget update, including the optional period fields and
 * `confirm_period_change` flag; thin proxy, per AD-8).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { budgetId } = await context.params;
  let body: UpdateBudgetBody;
  try {
    body = (await request.json()) as UpdateBudgetBody;
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
  const confirmPeriodChange = body.confirm_period_change === true;

  const headers = forwardCookie(request);
  headers.set("Content-Type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        name,
        cap,
        currency,
        source_list_ids: sourceListIds,
        period_start: periodStart,
        period_end: periodEnd,
        confirm_period_change: confirmPeriodChange,
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

/**
 * Same-origin BFF: DELETE /api/budgets/{budgetId} → api /budgets/{budgetId}.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { budgetId } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}`, {
      method: "DELETE",
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
