import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

function context(listId: string) {
  return { params: Promise.resolve({ listId }) };
}

describe("POST /api/lists/{listId}/unhide BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and passes through a 204 no-content success", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const request = new Request("http://localhost/api/lists/l1/unhide", {
      method: "POST",
      headers: { cookie: "fh_session=tok" },
    });

    const response = await POST(request as never, context("l1"));

    expect(response.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/lists/l1/unhide");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("passes through a 403 (non-member) upstream error", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "No access.", code: "not_list_member" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/unhide", { method: "POST" });
    const response = await POST(request as never, context("l1"));

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("not_list_member");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/lists/l1/unhide", { method: "POST" });
    const response = await POST(request as never, context("l1"));

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });
});
