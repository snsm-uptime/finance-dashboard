import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

function context(budgetId: string) {
  return { params: Promise.resolve({ budgetId }) };
}

describe("GET /api/budgets/[budgetId]/period-preview BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and query params, passes through the upstream body", async () => {
    const body = { excluded_lines: [] };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request(
      "http://localhost/api/budgets/b1/period-preview?period_start=2026-01-10&period_end=2026-01-31",
      { headers: { cookie: "fh_session=tok" } },
    );

    const response = await GET(request as never, context("b1") as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "http://api.test:8000/budgets/b1/period-preview?period_start=2026-01-10&period_end=2026-01-31",
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("omits the query string when no period params are given", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ excluded_lines: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets/b1/period-preview");

    await GET(request as never, context("b1") as never);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets/b1/period-preview");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/budgets/b1/period-preview");

    const response = await GET(request as never, context("b1") as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a non-owner 404 unchanged", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not found.", code: "budget_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets/b1/period-preview");

    const response = await GET(request as never, context("b1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("budget_not_found");
  });
});
