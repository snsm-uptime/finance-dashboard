import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RegisterBody = {
  email?: unknown;
  password?: unknown;
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

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Upstream unavailable.", code: "bad_gateway" },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    upstream.headers.get("Content-Type") || "application/json",
  );

  // Forward session cookie(s) from api (single issuer).
  const getSetCookie = upstream.headers.getSetCookie?.bind(upstream.headers);
  const setCookies = getSetCookie ? getSetCookie() : [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      responseHeaders.append("Set-Cookie", cookie);
    }
  } else {
    const single = upstream.headers.get("set-cookie");
    if (single) responseHeaders.append("Set-Cookie", single);
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
