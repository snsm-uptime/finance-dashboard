import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

import { GET, POST } from "./route";

describe("GET /api/budgets BFF", () => {
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

    const request = new Request("http://localhost/api/budgets", {
      headers: { cookie: "fh_session=tok" },
    });

    const response = await GET(request as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/budgets");

    const response = await GET(request as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a non-200 upstream error body and status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated.", code: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets");

    const response = await GET(request as never);

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("unauthorized");
  });
});

describe("POST /api/budgets BFF", () => {
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

    const request = new Request("http://localhost/api/budgets", {
      method: "POST",
      headers: { cookie: "fh_session=tok" },
      body: JSON.stringify({
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1", "l2"],
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test:8000/budgets");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Cookie")).toBe("fh_session=tok");
    expect(init.body).toBe(
      JSON.stringify({
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1", "l2"],
      }),
    );
  });

  it("filters non-string entries out of source_list_ids before forwarding", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "b1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets", {
      method: "POST",
      body: JSON.stringify({
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1", 42, null, "l2"],
      }),
    });

    await POST(request as never);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string).source_list_ids).toEqual(["l1", "l2"]);
  });

  it("defaults source_list_ids to an empty array when missing or malformed", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "b1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("http://localhost/api/budgets", {
      method: "POST",
      body: JSON.stringify({ name: "Groceries", cap: "500.00", currency: "CRC" }),
    });

    await POST(request as never);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string).source_list_ids).toEqual([]);
  });

  it("returns 400 invalid_body on unparseable JSON", async () => {
    const request = new Request("http://localhost/api/budgets", {
      method: "POST",
      body: "not json",
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_body");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 bad_gateway when upstream is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("upstream down"));

    const request = new Request("http://localhost/api/budgets", {
      method: "POST",
      body: JSON.stringify({
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1"],
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bad_gateway");
  });

  it("passes through a 422 validation error from upstream", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Select at least one source list.",
          code: "invalid_budget_source_lists",
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/budgets", {
      method: "POST",
      body: JSON.stringify({
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: [],
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("invalid_budget_source_lists");
  });
});
