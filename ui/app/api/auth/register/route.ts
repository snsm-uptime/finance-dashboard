import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";
import { forwardUpstreamHeaders, withClientIpHeader } from "@/lib/authBff";

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  invite_token?: unknown;
};

/**
 * Same-origin BFF: browser → ui /api/auth/register → api /auth/register.
 * Api is the single session cookie issuer; we forward Set-Cookie.
 */
export async function POST(request: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteToken =
    typeof body.invite_token === "string" ? body.invite_token : undefined;

  const payload: Record<string, string> = { email, password };
  if (inviteToken) {
    payload.invite_token = inviteToken;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/auth/register`, {
      method: "POST",
      headers: withClientIpHeader(request, {
        "Content-Type": "application/json",
        Accept: "application/json",
      }),
      body: JSON.stringify(payload),
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
    headers: forwardUpstreamHeaders(upstream, { forwardSetCookie: true }),
  });
}
