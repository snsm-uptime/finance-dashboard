import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

describe("POST /api/auth/sign-in BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("proxies to api and forwards Set-Cookie", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user_id: "u1", email: "a@example.com" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie":
            "fh_session=token123; Path=/; HttpOnly; SameSite=Lax",
        },
      }),
    );

    const request = new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com", password: "password1" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/sign-in",
      expect.objectContaining({ method: "POST" }),
    );
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("fh_session=token123");
  });

  it("forwards single set-cookie when getSetCookie is empty", async () => {
    const headers = new Headers({
      "Content-Type": "application/json",
      "Set-Cookie": "fh_session=legacy; Path=/; HttpOnly",
    });
    headers.getSetCookie = () => [];
    fetchMock.mockResolvedValue({
      status: 200,
      headers,
      text: async () => JSON.stringify({ user_id: "u1", email: "a@example.com" }),
    });

    const request = new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com", password: "password1" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("fh_session=legacy");
  });

  it("returns generic invalid_credentials for invalid JSON", async () => {
    const request = new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("invalid_credentials");
  });

  it("forwards 429 body, Retry-After, and sets X-FH-Client-IP", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Too many attempts. Please try again later.",
          code: "rate_limited",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "15",
          },
        },
      ),
    );

    const request = new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com", password: "password1" }),
      headers: { "Content-Type": "application/json" },
    });
    Object.defineProperty(request, "ip", { value: "198.51.100.7" });

    const response = await POST(request as never);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    const body = await response.json();
    expect(body.code).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/sign-in",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-FH-Client-IP": "198.51.100.7" }),
      }),
    );
  });
});
