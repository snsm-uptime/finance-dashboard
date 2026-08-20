import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  authClientIpHeaderName,
  browserClientIp,
  forwardUpstreamHeaders,
  withClientIpHeader,
} from "./authBff";

describe("authBff", () => {
  const previousHeader = process.env.AUTH_CLIENT_IP_HEADER;

  afterEach(() => {
    if (previousHeader === undefined) {
      delete process.env.AUTH_CLIENT_IP_HEADER;
    } else {
      process.env.AUTH_CLIENT_IP_HEADER = previousHeader;
    }
  });

  it("uses the default client IP header name", () => {
    delete process.env.AUTH_CLIENT_IP_HEADER;
    expect(authClientIpHeaderName()).toBe("X-FH-Client-IP");
  });

  it("uses a trimmed configured client IP header name", () => {
    process.env.AUTH_CLIENT_IP_HEADER = "  X-Real-Client  ";
    expect(authClientIpHeaderName()).toBe("X-Real-Client");
  });

  it("prefers NextRequest.ip, then X-Real-IP, then unknown", () => {
    const withIp = new NextRequest("http://localhost/api/auth/sign-in");
    Object.defineProperty(withIp, "ip", { value: "  203.0.113.9  " });
    expect(browserClientIp(withIp)).toBe("203.0.113.9");

    const withRealIp = new NextRequest("http://localhost/api/auth/sign-in", {
      headers: { "x-real-ip": "  198.51.100.4  " },
    });
    expect(browserClientIp(withRealIp)).toBe("198.51.100.4");

    expect(browserClientIp(new NextRequest("http://localhost/api/auth/sign-in"))).toBe(
      "unknown",
    );
  });

  it("ignores a non-string runtime ip", () => {
    const request = new NextRequest("http://localhost/api/auth/sign-in");
    Object.defineProperty(request, "ip", { value: null });
    expect(browserClientIp(request)).toBe("unknown");
  });

  it("stamps the client IP header onto forwarded headers", () => {
    const request = new NextRequest("http://localhost/api/auth/sign-in", {
      headers: { "x-real-ip": "192.0.2.10" },
    });
    expect(withClientIpHeader(request, { Accept: "application/json" })).toEqual({
      Accept: "application/json",
      "X-FH-Client-IP": "192.0.2.10",
    });
  });

  it("forwards Content-Type, Retry-After, and Set-Cookie", () => {
    const upstream = new Response("ok", {
      headers: {
        "Content-Type": "text/plain",
        "Retry-After": "9",
        "Set-Cookie": "fh_session=tok; Path=/",
      },
    });
    const headers = forwardUpstreamHeaders(upstream, { forwardSetCookie: true });
    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("Retry-After")).toBe("9");
    expect(headers.get("set-cookie")).toContain("fh_session=tok");
  });

  it("defaults Content-Type when upstream omits it", () => {
    const headers = forwardUpstreamHeaders({
      headers: {
        get: () => null,
      },
    } as Response);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Retry-After")).toBeNull();
    expect(headers.get("set-cookie")).toBeNull();
  });

  it("falls back to a single set-cookie header when getSetCookie is empty", () => {
    const headers = new Headers({
      "Set-Cookie": "fh_session=legacy; Path=/",
    });
    headers.getSetCookie = () => [];
    const forwarded = forwardUpstreamHeaders(
      { headers } as Response,
      { forwardSetCookie: true },
    );
    expect(forwarded.get("set-cookie")).toContain("fh_session=legacy");
  });

  it("skips Set-Cookie when getSetCookie is missing and no header is present", () => {
    const forwarded = forwardUpstreamHeaders(
      {
        headers: {
          get: (name: string) => (name === "Content-Type" ? "text/plain" : null),
        },
      } as Response,
      { forwardSetCookie: true },
    );
    expect(forwarded.get("Content-Type")).toBe("text/plain");
    expect(forwarded.get("set-cookie")).toBeNull();
  });
});
