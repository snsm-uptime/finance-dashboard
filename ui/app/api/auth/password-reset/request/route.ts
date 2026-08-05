import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";
import { forwardUpstreamHeaders, withClientIpHeader } from "@/lib/authBff";

type Body = {
  email?: unknown;
};

/**
 * Same-origin BFF: browser → ui /api/auth/password-reset/request → api.
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      {
        detail:
          "If that email is registered, you will receive a reset link shortly.",
      },
      { status: 200 },
    );
  }

  const email = typeof body.email === "string" ? body.email : "";

  const upstream = await fetch(
    `${getApiInternalUrl()}/auth/password-reset/request`,
    {
      method: "POST",
      headers: withClientIpHeader(request, {
        "Content-Type": "application/json",
        Accept: "application/json",
      }),
      body: JSON.stringify({ email }),
      cache: "no-store",
    },
  );

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: forwardUpstreamHeaders(upstream),
  });
}
