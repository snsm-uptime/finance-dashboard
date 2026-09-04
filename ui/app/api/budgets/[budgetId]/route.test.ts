import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { DELETE, GET, PATCH } from "./route";

function context(budgetId: string) {
  return { params: Promise.resolve({ budgetId }) };
}

describe("GET /api/budgets/[budgetId] BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and passes through the upstream budget detail body", async () => {
    const body = { id: "b1", name: "Groceries", spent: "0", history: [], rules: [] };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets/b1", {
      headers: { cookie: "fh_session=tok" },
    });

    const response = await GET(request as never, context("b1") as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets/b1");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/budgets/b1");

    const response = await GET(request as never, context("b1") as never);

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

    const request = new Request("http://localhost/api/budgets/b1");

    const response = await GET(request as never, context("b1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("budget_not_found");
  });
});

describe("PATCH /api/budgets/[budgetId] BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and body fields, including period + confirm flag", async () => {
    const body = { id: "b1", name: "New name", spent: "0" };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets/b1", {
      method: "PATCH",
      headers: { cookie: "fh_session=tok" },
      body: JSON.stringify({
        name: "New name",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1"],
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        confirm_period_change: true,
      }),
    });

    const response = await PATCH(request as never, context("b1") as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets/b1");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
    expect(init.body).toBe(
      JSON.stringify({
        name: "New name",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1"],
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        confirm_period_change: true,
      }),
    );
  });

  it("passes through a period_change_requires_confirmation 422", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "confirm",
          code: "period_change_requires_confirmation",
          excluded_lines: [],
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/budgets/b1", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1"],
      }),
    });

    const response = await PATCH(request as never, context("b1") as never);

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("period_change_requires_confirmation");
  });

  it("returns 400 invalid_body on unparseable JSON", async () => {
    const request = new Request("http://localhost/api/budgets/b1", {
      method: "PATCH",
      body: "not json",
    });

    const response = await PATCH(request as never, context("b1") as never);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_body");
  });
});

describe("DELETE /api/budgets/[budgetId] BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and returns 204 on success", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const request = new Request("http://localhost/api/budgets/b1", {
      method: "DELETE",
      headers: { cookie: "fh_session=tok" },
    });

    const response = await DELETE(request as never, context("b1") as never);

    expect(response.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets/b1");
    expect(init.method).toBe("DELETE");
  });
});
