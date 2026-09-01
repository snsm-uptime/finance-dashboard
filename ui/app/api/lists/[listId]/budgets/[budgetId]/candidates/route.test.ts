import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

function context(listId: string, budgetId: string) {
  return { params: Promise.resolve({ listId, budgetId }) };
}

describe("GET /api/lists/[listId]/budgets/[budgetId]/candidates BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and passes through the upstream candidates body", async () => {
    const body = { candidates: [{ id: "e1", description: "Automercado" }] };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/candidates", {
      headers: { cookie: "fh_session=tok" },
    });

    const response = await GET(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/lists/l1/budgets/b1/candidates");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/candidates");

    const response = await GET(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a non-200 upstream error body and status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not found.", code: "budget_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/candidates");

    const response = await GET(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("budget_not_found");
  });
});
