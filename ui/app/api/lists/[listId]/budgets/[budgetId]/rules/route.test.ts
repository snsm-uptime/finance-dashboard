import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

function context(listId: string, budgetId: string) {
  return { params: Promise.resolve({ listId, budgetId }) };
}

describe("POST /api/lists/[listId]/budgets/[budgetId]/rules BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and match_text, passes through the created rule", async () => {
    const body = { id: "r1", match_text: "automercado", created_at: "2026-09-01T00:00:00Z" };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/rules", {
      method: "POST",
      headers: { cookie: "fh_session=tok" },
      body: JSON.stringify({ match_text: "automercado" }),
    });

    const response = await POST(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/lists/l1/budgets/b1/rules");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
    expect(init.body).toBe(JSON.stringify({ match_text: "automercado" }));
  });

  it("returns 400 invalid_body on unparseable JSON", async () => {
    const request = new Request("http://localhost/api/lists/l1/budgets/b1/rules", {
      method: "POST",
      body: "not json",
    });

    const response = await POST(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_body");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/rules", {
      method: "POST",
      body: JSON.stringify({ match_text: "automercado" }),
    });

    const response = await POST(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a 422 validation error from upstream", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "Enter rule text.", code: "invalid_budget_rule_match_text" }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/rules", {
      method: "POST",
      body: JSON.stringify({ match_text: "" }),
    });

    const response = await POST(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("invalid_budget_rule_match_text");
  });
});
