import { beforeEach, describe, expect, it, vi } from "vitest";

describe("session BFF route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("forwards cookie to api and returns status", async () => {
    process.env.API_INTERNAL_URL = "http://api:8000";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          user_id: "00000000-0000-0000-0000-000000000001",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/auth/session/route");
    const request = new Request("http://localhost:3000/api/auth/session", {
      method: "GET",
      headers: { cookie: "fh_session=test-token" },
    });

    const response = await GET(request as never);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8000/auth/session",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Cookie: "fh_session=test-token" }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 502 when upstream fetch fails", async () => {
    process.env.API_INTERNAL_URL = "http://api:8000";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const { GET } = await import("@/app/api/auth/session/route");
    const response = await GET(
      new Request("http://localhost:3000/api/auth/session") as never,
    );
    expect(response.status).toBe(502);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("bad_gateway");
  });
});
