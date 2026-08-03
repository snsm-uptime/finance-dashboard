import { describe, expect, it, vi, beforeEach } from "vitest";

describe("register BFF route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("proxies to api and forwards Set-Cookie", async () => {
    process.env.API_INTERNAL_URL = "http://api:8000";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "00000000-0000-0000-0000-000000000001",
          email: "member@example.com",
          list_id: "00000000-0000-0000-0000-000000000002",
          list_name: "Personal",
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie":
              "fh_session=test-token; HttpOnly; Path=/; SameSite=Lax",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/auth/register/route");
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "member@example.com",
        password: "password1",
      }),
    });

    const response = await POST(request as never);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8000/auth/register",
      expect.objectContaining({ method: "POST" }),
    );
    expect(response.status).toBe(201);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("fh_session=test-token");
    expect(setCookie?.toLowerCase()).toContain("httponly");
  });

  it("rejects invalid JSON", async () => {
    process.env.API_INTERNAL_URL = "http://api:8000";
    const { POST } = await import("@/app/api/auth/register/route");
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("invalid_body");
  });
});
