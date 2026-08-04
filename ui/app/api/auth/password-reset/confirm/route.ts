import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type Body = {
  token?: unknown;
  new_password?: unknown;
};

/**
 * Same-origin BFF: browser → ui /api/auth/password-reset/confirm → api.
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      {
        detail: "This reset link is invalid or has expired. Request a new one.",
        code: "invalid_reset_token",
      },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token : "";
  const new_password =
    typeof body.new_password === "string" ? body.new_password : "";

  const upstream = await fetch(
    `${getApiInternalUrl()}/auth/password-reset/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token, new_password }),
      cache: "no-store",
    },
  );

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") || "application/json",
    },
  });
}
