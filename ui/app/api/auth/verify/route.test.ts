import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST as confirmVerify } from "./confirm/route";
import { POST as requestVerify } from "./request/route";

describe("email-verification BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("proxies confirm to api", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Email verified. You can continue with gated actions.",
          user_id: "11111111-1111-1111-1111-111111111111",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/auth/verify/confirm", {
      method: "POST",
      body: JSON.stringify({ token: "opaque-token" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await confirmVerify(request as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/verify/confirm",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("proxies request with cookie to api", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Check your inbox for a verification link.",
          already_verified: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/auth/verify/request", {
      method: "POST",
      headers: {
        Accept: "application/json",
        cookie: "fh_session=opaque",
      },
    });
    const response = await requestVerify(request as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/verify/request",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Cookie: "fh_session=opaque" }),
      }),
    );
  });

  it("returns invalid token for malformed confirm body", async () => {
    const request = new Request("http://localhost/api/auth/verify/confirm", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await confirmVerify(request as never);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("invalid_verification_token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
