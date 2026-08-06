/** Same-origin BFF: browser → ui /api/invites/preview → api /invites/preview. */

import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const url = new URL(`${getApiInternalUrl()}/invites/preview`);
  url.searchParams.set("token", token);

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
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
