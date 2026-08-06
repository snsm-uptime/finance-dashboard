/** Same-origin BFF: browser → ui /api/lists/{id}/invites → api. */

import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type InviteBody = {
  email?: unknown;
};

type RouteContext = {
  params: Promise<{ listId: string }>;
};

function forwardCookie(request: NextRequest): Headers {
  const headers = new Headers({
    Accept: "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { listId } = await context.params;

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email : "";
  const headers = forwardCookie(request);
  headers.set("Content-Type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/invites`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email }),
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
