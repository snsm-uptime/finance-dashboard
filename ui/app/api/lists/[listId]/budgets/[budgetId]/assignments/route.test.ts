import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { POST } from "./route";

function context(listId: string, budgetId: string) {
  return { params: Promise.resolve({ listId, budgetId }) };
}

describe("POST /api/lists/[listId]/budgets/[budgetId]/assignments BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and ledger_entry_id, returns 204 on success", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/assignments", {
      method: "POST",
      headers: { cookie: "fh_session=tok" },
      body: JSON.stringify({ ledger_entry_id: "e1" }),
    });

    const response = await POST(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/lists/l1/budgets/b1/assignments");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
    expect(init.body).toBe(JSON.stringify({ ledger_entry_id: "e1" }));
  });

  it("returns 400 invalid_body on unparseable JSON", async () => {
    const request = new Request("http://localhost/api/lists/l1/budgets/b1/assignments", {
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

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/assignments", {
      method: "POST",
      body: JSON.stringify({ ledger_entry_id: "e1" }),
    });

    const response = await POST(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a non-204 upstream error body and status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not found.", code: "budget_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets/b1/assignments", {
      method: "POST",
      body: JSON.stringify({ ledger_entry_id: "e1" }),
    });

    const response = await POST(request as never, context("l1", "b1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("budget_not_found");
  });
});
