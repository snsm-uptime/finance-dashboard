import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type Body = {
  token?: unknown;
};

/**
 * Same-origin BFF: browser → ui /api/auth/verify/confirm → api.
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      {
        detail:
          "This verification link is invalid or has expired. Request a new one.",
        code: "invalid_verification_token",
      },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token : "";

  const upstream = await fetch(`${getApiInternalUrl()}/auth/verify/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") || "application/json",
    },
  });
}
