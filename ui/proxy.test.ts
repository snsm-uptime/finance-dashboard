import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

function makeRequest(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

describe("proxy auth gate", () => {
  it("redirects unauthenticated /lists to /sign-in with returnTo", () => {
    const response = proxy(makeRequest("/lists"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/sign-in");
    expect(location).toContain("returnTo=%2Flists");
  });

  it("allows /lists when fh_session cookie is present", () => {
    const response = proxy(makeRequest("/lists", "fh_session=opaque-token"));
    expect(response.status).toBe(200);
  });

  it("allows public /sign-in without cookie", () => {
    const response = proxy(makeRequest("/sign-in"));
    expect(response.status).toBe(200);
  });

  it("allows /sign-in even when a stale cookie is present (no bounce loop)", () => {
    const response = proxy(makeRequest("/sign-in", "fh_session=stale-token"));
    expect(response.status).toBe(200);
  });

  it("allows public /forgot-password and /reset-password without cookie", () => {
    expect(proxy(makeRequest("/forgot-password")).status).toBe(200);
    expect(proxy(makeRequest("/reset-password?token=abc")).status).toBe(200);
  });

  it("redirects unauthenticated /upload to /sign-in", () => {
    const response = proxy(makeRequest("/upload"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
  });
});
