import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST as requestReset } from "./request/route";
import { POST as confirmReset } from "./confirm/route";

describe("password-reset BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("proxies request to api", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail:
            "If that email is registered, you will receive a reset link shortly.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request(
      "http://localhost/api/auth/password-reset/request",
      {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await requestReset(request as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/password-reset/request",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("proxies confirm to api", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Password updated. You can sign in with your new password.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request(
      "http://localhost/api/auth/password-reset/confirm",
      {
        method: "POST",
        body: JSON.stringify({ token: "abc", new_password: "password1" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await confirmReset(request as never);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/auth/password-reset/confirm",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards smtp failure status", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Email delivery is not configured. Check SMTP settings.",
          code: "smtp_config_error",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    const request = new Request(
      "http://localhost/api/auth/password-reset/request",
      {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await requestReset(request as never);
    expect(response.status).toBe(503);
  });
});
