/** Client identity + Retry-After helpers for auth BFF routes (Story 1.5.6). */

import type { NextRequest } from "next/server";

const DEFAULT_CLIENT_IP_HEADER = "X-FH-Client-IP";

export function authClientIpHeaderName(): string {
  const configured = (process.env.AUTH_CLIENT_IP_HEADER || "").trim();
  return configured || DEFAULT_CLIENT_IP_HEADER;
}

/**
 * Browser-facing peer of the ui service (not api's view of the BFF).
 * Prefer NextRequest.ip, then host reverse-proxy X-Real-IP.
 * Do not use X-Forwarded-For here — multi-hop spoof risk; api never trusts public XFF.
 */
export function browserClientIp(request: NextRequest): string {
  // NextRequest.ip is runtime-available in Node; types omit it in this Next pin.
  const runtimeIp = (request as NextRequest & { ip?: string | null }).ip;
  const fromIp = typeof runtimeIp === "string" ? runtimeIp.trim() : "";
  if (fromIp) return fromIp;

  const realIp = (request.headers.get("x-real-ip") || "").trim();
  if (realIp) return realIp;

  return "unknown";
}

export function withClientIpHeader(
  request: NextRequest,
  headers: Record<string, string>,
): Record<string, string> {
  return {
    ...headers,
    [authClientIpHeaderName()]: browserClientIp(request),
  };
}

/** Forward upstream Content-Type, Retry-After, and optionally Set-Cookie. */
export function forwardUpstreamHeaders(
  upstream: Response,
  options?: { forwardSetCookie?: boolean },
): Headers {
  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    upstream.headers.get("Content-Type") || "application/json",
  );
  const retryAfter = upstream.headers.get("Retry-After");
  if (retryAfter) {
    responseHeaders.set("Retry-After", retryAfter);
  }
  if (options?.forwardSetCookie) {
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
  }
  return responseHeaders;
}
