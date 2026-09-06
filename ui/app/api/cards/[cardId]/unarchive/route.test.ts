import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

function context(cardId: string) {
  return { params: Promise.resolve({ cardId }) };
}

describe("POST /api/cards/{cardId}/unarchive BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and passes through the upstream unarchived card", async () => {
    const body = { id: "c1", label: "My Visa", iban: "CR05", is_archived: false };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/cards/c1/unarchive", {
      method: "POST",
      headers: { cookie: "fh_session=tok" },
    });

    const response = await POST(request as never, context("c1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/cards/c1/unarchive");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("passes through a 404 upstream error", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Card not found.", code: "card_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/cards/c1/unarchive", { method: "POST" });
    const response = await POST(request as never, context("c1"));

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("card_not_found");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/cards/c1/unarchive", { method: "POST" });
    const response = await POST(request as never, context("c1"));

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });
});
