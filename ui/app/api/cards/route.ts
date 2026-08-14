import { NextRequest, NextResponse } from "next/server";

import { getApiInternalUrl } from "@/lib/api";

type RegisterCardBody = {
  label?: unknown;
  iban?: unknown;
};

function forwardCookie(request: NextRequest): Headers {
  const headers = new Headers({
    Accept: "application/json",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

/**
 * Same-origin BFF: browser → ui /api/cards → api /cards.
 * Forwards session cookie; api is the auth authority.
 */
export async function GET(request: NextRequest) {
  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/cards`, {
      method: "GET",
      headers: forwardCookie(request),
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

export async function POST(request: NextRequest) {
  let body: RegisterCardBody;
  try {
    body = (await request.json()) as RegisterCardBody;
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const label = typeof body.label === "string" ? body.label : "";
  const iban = typeof body.iban === "string" ? body.iban : "";
  const headers = forwardCookie(request);
  headers.set("Content-Type", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiInternalUrl()}/cards`, {
      method: "POST",
      headers,
      body: JSON.stringify({ label, iban }),
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
