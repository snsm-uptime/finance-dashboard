import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

function context(budgetId: string) {
  return { params: Promise.resolve({ budgetId }) };
}

describe("POST /api/budgets/[budgetId]/rules BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and body, and passes through the upstream rule body", async () => {
    const body = { id: "r1", match_text: "uber", created_at: "2026-08-01T00:00:00Z" };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets/b1/rules", {
      method: "POST",
      headers: { cookie: "fh_session=tok", "content-type": "application/json" },
      body: JSON.stringify({ match_text: "uber" }),
    });

    const response = await POST(request as never, context("b1") as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets/b1/rules");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
    expect(JSON.parse(init.body as string)).toEqual({ match_text: "uber" });
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/budgets/b1/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ match_text: "uber" }),
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

    const request = new Request("http://localhost/api/budgets/b1/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ match_text: "uber" }),
    });

    const response = await POST(request as never, context("b1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("budget_not_found");
  });

  it("passes through a validation error", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "Invalid.", code: "invalid_budget_rule_match_text" }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/budgets/b1/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ match_text: "" }),
    });

    const response = await POST(request as never, context("b1") as never);

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("invalid_budget_rule_match_text");
  });
});
