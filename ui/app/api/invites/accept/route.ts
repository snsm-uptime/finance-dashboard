/** Same-origin BFF: browser → ui /api/invites/accept → api /invites/accept. */

import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type AcceptBody = {
  token?: unknown;
};

export async function POST(request: NextRequest) {
  let body: AcceptBody;
  try {
    body = (await request.json()) as AcceptBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token : "";
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/invites/accept`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
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
