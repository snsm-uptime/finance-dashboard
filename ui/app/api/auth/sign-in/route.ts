import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

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
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(GENERIC_CREDENTIALS, { status: 401 });
  }

  const text = await upstream.text();
  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    upstream.headers.get("Content-Type") || "application/json",
  );

  const getSetCookie = upstream.headers.getSetCookie?.bind(upstream.headers);
  const setCookies = getSetCookie ? getSetCookie() : [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      responseHeaders.append("Set-Cookie", cookie);
    }
  } else {
    const single = upstream.headers.get("set-cookie");
    if (single) {
      responseHeaders.append("Set-Cookie", single);
    }
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
