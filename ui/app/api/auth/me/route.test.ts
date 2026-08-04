import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { GET, PATCH } from "./route";

describe("/api/auth/me BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("GET forwards Cookie and Accept-Language to api /auth/me", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          user_id: "u1",
          email: "user@example.com",
          language: "es",
          theme: "system",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/auth/me", {
      method: "GET",
      headers: {
        cookie: "fh_session=tok",
        "accept-language": "es-CR",
      },
    });

    const response = await GET(request as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Cookie: "fh_session=tok",
          "Accept-Language": "es-CR",
        }),
      }),
    );
    const body = await response.json();
    expect(body.language).toBe("es");
  });

  it("PATCH forwards body and cookies", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          user_id: "u1",
          email: "user@example.com",
          language: "en",
          theme: "dark",
          language_stored: "en",
          theme_stored: "dark",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/auth/me", {
      method: "PATCH",
      headers: {
        cookie: "fh_session=tok",
        "content-type": "application/json",
      },
      body: JSON.stringify({ theme: "dark" }),
    });

    const response = await PATCH(request as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ theme: "dark" }),
      }),
    );
  });

  it("GET returns 401 when upstream is unauthorized", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated." }), {
        status: 401,
      }),
    );
    const response = await GET(
      new Request("http://localhost/api/auth/me") as never,
    );
    expect(response.status).toBe(401);
  });
});
