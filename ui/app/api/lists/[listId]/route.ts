import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type NameBody = {
  name?: unknown;
};

type RouteContext = {
  params: Promise<{ listId: string }>;
};

/**
 * Same-origin BFF: browser → ui /api/lists/{id} → api /lists/{id}.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { listId } = await context.params;

  let body: NameBody;
  try {
    body = (await request.json()) as NameBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name : "";
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name }),
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
