import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

function okJson(body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("lists / invites BFF smoke (coverage floor)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
    fetchMock.mockImplementation(() => Promise.resolve(okJson({})));
  });

  it("GET /api/lists forwards cookie", async () => {
    const { GET } = await import("@/app/api/lists/route");
    const response = await GET(
      new Request("http://localhost/api/lists", {
        headers: { cookie: "fh_session=tok" },
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/lists",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("POST /api/lists forwards name", async () => {
    const { POST } = await import("@/app/api/lists/route");
    const response = await POST(
      new Request("http://localhost/api/lists", {
        method: "POST",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Home" }),
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/lists",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("GET/PATCH /api/lists/[listId] forward", async () => {
    const mod = await import("@/app/api/lists/[listId]/route");
    const ctx = { params: Promise.resolve({ listId: "l1" }) };
    const getRes = await mod.GET(
      new Request("http://localhost/api/lists/l1", {
        headers: { cookie: "fh_session=tok" },
      }) as never,
      ctx,
    );
    expect(getRes.status).toBe(200);

    const patchRes = await mod.PATCH(
      new Request("http://localhost/api/lists/l1", {
        method: "PATCH",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Renamed" }),
      }) as never,
      ctx,
    );
    expect(patchRes.status).toBe(200);
  });

  it("GET balances / expenses / default-split / members forward", async () => {
    const ctx = { params: Promise.resolve({ listId: "l1" }) };
    const request = new Request("http://localhost/api/lists/l1/x", {
      headers: { cookie: "fh_session=tok" },
    }) as never;

    const balances = await import("@/app/api/lists/[listId]/balances/route");
    expect((await balances.GET(request, ctx)).status).toBe(200);

    const expenses = await import("@/app/api/lists/[listId]/expenses/route");
    expect((await expenses.GET(request, ctx)).status).toBe(200);

    const split = await import("@/app/api/lists/[listId]/default-split/route");
    expect((await split.GET(request, ctx)).status).toBe(200);

    const members = await import("@/app/api/lists/[listId]/members/route");
    expect((await members.GET(request, ctx)).status).toBe(200);

    const putRes = await split.PUT(
      new Request("http://localhost/api/lists/l1/default-split", {
        method: "PUT",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "even" }),
      }) as never,
      ctx,
    );
    expect(putRes.status).toBe(200);
  });

  it("POST /api/lists/[listId]/expenses forwards body", async () => {
    const expenses = await import("@/app/api/lists/[listId]/expenses/route");
    const response = await expenses.POST(
      new Request("http://localhost/api/lists/l1/expenses", {
        method: "POST",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: "10.00",
          currency: "CRC",
          description: "Coffee",
          payer_id: "u1",
        }),
      }) as never,
      { params: Promise.resolve({ listId: "l1" }) },
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/lists/l1/expenses",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("POST /api/lists/[listId]/invites forwards email", async () => {
    const { POST } = await import("@/app/api/lists/[listId]/invites/route");
    const response = await POST(
      new Request("http://localhost/api/lists/l1/invites", {
        method: "POST",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "a@b.com" }),
      }) as never,
      { params: Promise.resolve({ listId: "l1" }) },
    );
    expect(response.status).toBe(200);
  });

  it("invites preview GET and accept POST forward", async () => {
    const preview = await import("@/app/api/invites/preview/route");
    const previewRes = await preview.GET(
      new NextRequest("http://localhost/api/invites/preview?token=abc"),
    );
    expect(previewRes.status).toBe(200);
    const missingToken = await preview.GET(
      new NextRequest("http://localhost/api/invites/preview"),
    );
    expect(missingToken.status).toBe(200);

    const accept = await import("@/app/api/invites/accept/route");
    const acceptRes = await accept.POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: "abc" }),
      }) as never,
    );
    expect(acceptRes.status).toBe(200);
  });

  it("DELETE /api/lists/[listId] forwards 204 and error bodies", async () => {
    const { DELETE } = await import("@/app/api/lists/[listId]/route");
    const ctx = { params: Promise.resolve({ listId: "l1" }) };
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const gone = await DELETE(
      new Request("http://localhost/api/lists/l1", {
        method: "DELETE",
        headers: { cookie: "fh_session=tok" },
      }) as never,
      ctx,
    );
    expect(gone.status).toBe(204);

    fetchMock.mockResolvedValueOnce(
      new Response("still there", {
        status: 409,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    const conflict = await DELETE(
      new Request("http://localhost/api/lists/l1", { method: "DELETE" }) as never,
      ctx,
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).toBe("still there");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 400 }));
    const empty = await DELETE(
      new Request("http://localhost/api/lists/l1", { method: "DELETE" }) as never,
      ctx,
    );
    expect(empty.status).toBe(400);
  });

  it("returns 400/502 on list mutation failures", async () => {
    const list = await import("@/app/api/lists/[listId]/route");
    const ctx = { params: Promise.resolve({ listId: "l1" }) };
    const badJson = await list.PATCH(
      new Request("http://localhost/api/lists/l1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }) as never,
      ctx,
    );
    expect(badJson.status).toBe(400);

    const unnamed = await list.PATCH(
      new Request("http://localhost/api/lists/l1", {
        method: "PATCH",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: 1 }),
      }) as never,
      ctx,
    );
    expect(unnamed.status).toBe(200);

    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const failedGet = await list.GET(
      new Request("http://localhost/api/lists/l1") as never,
      ctx,
    );
    expect(failedGet.status).toBe(502);

    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const failedDelete = await list.DELETE(
      new Request("http://localhost/api/lists/l1", { method: "DELETE" }) as never,
      ctx,
    );
    expect(failedDelete.status).toBe(502);
  });

  it("POST statement reassign forwards cookie and body", async () => {
    const { POST } = await import(
      "@/app/api/lists/[listId]/statements/[statementId]/reassign/route"
    );
    const response = await POST(
      new Request("http://localhost/api/lists/l1/statements/s1/reassign", {
        method: "POST",
        headers: {
          cookie: "fh_session=tok",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ destination_list_id: "l2" }),
      }) as never,
      { params: Promise.resolve({ listId: "l1", statementId: "s1" }) },
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/lists/l1/statements/s1/reassign",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls.at(-1)?.[1] as { headers?: HeadersInit } | undefined;
    expect(new Headers(init?.headers).get("Cookie")).toBe("fh_session=tok");
  });
});
