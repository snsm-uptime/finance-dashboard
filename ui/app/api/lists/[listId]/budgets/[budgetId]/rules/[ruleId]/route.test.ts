import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { DELETE } from "./route";

function context(listId: string, budgetId: string, ruleId: string) {
  return { params: Promise.resolve({ listId, budgetId, ruleId }) };
}

describe("DELETE /api/lists/[listId]/budgets/[budgetId]/rules/[ruleId] BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and returns 204 on success", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/rules/r1", {
      method: "DELETE",
      headers: { cookie: "fh_session=tok" },
    });

    const response = await DELETE(request as never, context("l1", "b1", "r1") as never);

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/lists/l1/budgets/b1/rules/r1");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/rules/r1", {
      method: "DELETE",
    });

    const response = await DELETE(request as never, context("l1", "b1", "r1") as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a non-204 upstream error body and status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Rule not found.", code: "budget_rule_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/rules/r1", {
      method: "DELETE",
    });

    const response = await DELETE(request as never, context("l1", "b1", "r1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("budget_rule_not_found");
  });
});
