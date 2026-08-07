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

  it("GET balances / expenses / default-split forward", async () => {
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
});
