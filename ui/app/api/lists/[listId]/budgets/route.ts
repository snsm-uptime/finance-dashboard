import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ listId: string }>;
};

type CreateBudgetBody = {
  name?: unknown;
  cap?: unknown;
  currency?: unknown;
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
 * Same-origin BFF: /api/lists/{id}/budgets → api /lists/{id}/budgets.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { listId } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/budgets`,
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

export async function POST(request: NextRequest, context: RouteContext) {
  const { listId } = await context.params;

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

  const headers = forwardCookie(request);
  headers.set("Content-Type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/budgets`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name, cap, currency }),
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
