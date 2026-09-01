import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { GET, POST } from "./route";

function context(listId: string) {
  return { params: Promise.resolve({ listId }) };
}

describe("GET /api/lists/[listId]/budgets BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and passes through the upstream budgets body", async () => {
    const body = { budgets: [{ id: "b1", name: "Groceries" }] };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets", {
      headers: { cookie: "fh_session=tok" },
    });

    const response = await GET(request as never, context("l1") as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/lists/l1/budgets");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/lists/l1/budgets");

    const response = await GET(request as never, context("l1") as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a non-200 upstream error body and status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not found.", code: "list_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets");

    const response = await GET(request as never, context("l1") as never);

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("list_not_found");
  });
});

describe("POST /api/lists/[listId]/budgets BFF", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
  });

  it("forwards the cookie and body fields, passes through the created budget", async () => {
    const body = { id: "b1", name: "Groceries", cap: "500.00", currency: "CRC" };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets", {
      method: "POST",
      headers: { cookie: "fh_session=tok" },
      body: JSON.stringify({ name: "Groceries", cap: "500.00", currency: "CRC" }),
    });

    const response = await POST(request as never, context("l1") as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/lists/l1/budgets");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
    expect(init.body).toBe(
      JSON.stringify({ name: "Groceries", cap: "500.00", currency: "CRC" }),
    );
  });

  it("returns 400 invalid_body on unparseable JSON", async () => {
    const request = new Request("http://localhost/api/lists/l1/budgets", {
      method: "POST",
      body: "not json",
    });

    const response = await POST(request as never, context("l1") as never);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_body");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/lists/l1/budgets", {
      method: "POST",
      body: JSON.stringify({ name: "Groceries", cap: "500.00", currency: "CRC" }),
    });

    const response = await POST(request as never, context("l1") as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a 422 validation error from upstream", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "Enter a name.", code: "invalid_budget_name" }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/lists/l1/budgets", {
      method: "POST",
      body: JSON.stringify({ name: "", cap: "500.00", currency: "CRC" }),
    });

    const response = await POST(request as never, context("l1") as never);

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("invalid_budget_name");
  });
});
