import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

describe("POST /api/auth/sign-out BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
    delete process.env.SESSION_COOKIE_SECURE;
  });

  it("forwards Cookie header and clears fh_session on the browser response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const request = new Request("http://localhost/api/auth/sign-out", {
      method: "POST",
      headers: { cookie: "fh_session=tok" },
    });

    const response = await POST(request as never);
    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/sign-out",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Cookie: "fh_session=tok" }),
      }),
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("fh_session=");
    expect(setCookie.toLowerCase()).toMatch(/max-age=0/);
  });
});
