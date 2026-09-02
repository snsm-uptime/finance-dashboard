import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

function context(budgetId: string) {
  return { params: Promise.resolve({ budgetId }) };
}

describe("POST /api/budgets/[budgetId]/assignments BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and body, and passes through the upstream response", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    const request = new Request("http://localhost/api/budgets/b1/assignments", {
      method: "POST",
      headers: { cookie: "fh_session=tok", "content-type": "application/json" },
      body: JSON.stringify({ ledger_entry_id: "e1" }),
    });

    const response = await POST(request as never, context("b1") as never);

    expect(response.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets/b1/assignments");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
    expect(JSON.parse(init.body as string)).toEqual({ ledger_entry_id: "e1" });
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/budgets/b1/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ledger_entry_id: "e1" }),
    });

    const response = await POST(request as never, context("b1") as never);

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

    const request = new Request("http://localhost/api/budgets/b1/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ledger_entry_id: "e1" }),
    });

    const response = await POST(request as never, context("b1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("budget_not_found");
  });
});
