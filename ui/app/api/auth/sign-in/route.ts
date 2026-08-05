import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";
import { forwardUpstreamHeaders, withClientIpHeader } from "@/lib/authBff";

type SignInBody = {
  email?: unknown;
  password?: unknown;
};

const GENERIC_CREDENTIALS = {
  detail: "Invalid email or password.",
  code: "invalid_credentials",
} as const;

/**
 * Same-origin BFF: browser → ui /api/auth/sign-in → api /auth/sign-in.
 * Api is the single session cookie issuer; we forward Set-Cookie.
 */
export async function POST(request: NextRequest) {
  let body: SignInBody;
  try {
    body = (await request.json()) as SignInBody;
  } catch {
    return NextResponse.json(GENERIC_CREDENTIALS, { status: 401 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/auth/sign-in`, {
      method: "POST",
      headers: withClientIpHeader(request, {
        "Content-Type": "application/json",
        Accept: "application/json",
      }),
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(GENERIC_CREDENTIALS, { status: 401 });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: forwardUpstreamHeaders(upstream, { forwardSetCookie: true }),
  });
}
