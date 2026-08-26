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

const cookieRequest = (url: string, init?: RequestInit) =>
  new Request(url, {
    ...init,
    headers: { cookie: "fh_session=tok", ...(init?.headers ?? {}) },
  }) as never;

function cookieOnLastFetch(): string | null {
  const init = fetchMock.mock.calls.at(-1)?.[1] as { headers?: HeadersInit } | undefined;
  return new Headers(init?.headers).get("Cookie");
}

describe("cards / import BFF smoke (coverage floor)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.API_INTERNAL_URL = "http://api.test:8000";
    fetchMock.mockImplementation(() => Promise.resolve(okJson({})));
  });

  it("GET/POST /api/cards forward cookie", async () => {
    const cards = await import("@/app/api/cards/route");
    expect((await cards.GET(cookieRequest("http://localhost/api/cards"))).status).toBe(
      200,
    );
    const posted = await cards.POST(
      cookieRequest("http://localhost/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "BAC", iban: "CR0501520200" }),
      }),
    );
    expect(posted.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/cards",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("PATCH /api/cards/[cardId]/routing forwards body", async () => {
    const { PATCH } = await import("@/app/api/cards/[cardId]/routing/route");
    const response = await PATCH(
      cookieRequest("http://localhost/api/cards/c1/routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "fixed", list_id: "l1" }),
      }),
      { params: Promise.resolve({ cardId: "c1" }) },
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/cards/c1/routing",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("import sessions POST/GET/DELETE forward", async () => {
    const create = await import("@/app/api/import/sessions/route");
    const form = new FormData();
    form.append("file", new Blob(["pdf"]), "stmt.pdf");
    const created = await create.POST(
      cookieRequest("http://localhost/api/import/sessions", {
        method: "POST",
        body: form,
      }),
    );
    expect(created.status).toBe(200);

    const session = await import("@/app/api/import/sessions/[sessionId]/route");
    const ctx = { params: Promise.resolve({ sessionId: "s1" }) };
    expect(
      (await session.GET(cookieRequest("http://localhost/api/import/sessions/s1"), ctx))
        .status,
    ).toBe(200);
    expect(
      (
        await session.DELETE(
          cookieRequest("http://localhost/api/import/sessions/s1", { method: "DELETE" }),
          ctx,
        )
      ).status,
    ).toBe(200);
  });

  it("bulk-commit forwards cookie", async () => {
    const bulk = await import("@/app/api/import/sessions/[sessionId]/bulk-commit/route");
    expect(
      (
        await bulk.POST(
          cookieRequest("http://localhost/api/import/sessions/s1/bulk-commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statement_ids: ["st1"] }),
          }),
          { params: Promise.resolve({ sessionId: "s1" }) },
        )
      ).status,
    ).toBe(200);
  });

  it("finalize forwards cookie and passes upstream status through", async () => {
    const finalize = await import("@/app/api/import/sessions/[sessionId]/finalize/route");
    const response = await finalize.POST(
      cookieRequest("http://localhost/api/import/sessions/s1/finalize", {
        method: "POST",
      }),
      { params: Promise.resolve({ sessionId: "s1" }) },
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/import/sessions/s1/finalize",
      expect.objectContaining({ method: "POST" }),
    );
    expect(cookieOnLastFetch()).toBe("fh_session=tok");
  });

  it("finalize passes a 409 through verbatim rather than flattening it", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ detail: "still pending", code: "import_session_has_pending_rows" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const finalize = await import("@/app/api/import/sessions/[sessionId]/finalize/route");
    const response = await finalize.POST(
      cookieRequest("http://localhost/api/import/sessions/s1/finalize", { method: "POST" }),
      { params: Promise.resolve({ sessionId: "s1" }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      detail: "still pending",
      code: "import_session_has_pending_rows",
    });
  });

  it("finalize reports a dead upstream as 502 rather than throwing", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("ECONNREFUSED")));
    const finalize = await import("@/app/api/import/sessions/[sessionId]/finalize/route");
    const response = await finalize.POST(
      cookieRequest("http://localhost/api/import/sessions/s1/finalize", { method: "POST" }),
      { params: Promise.resolve({ sessionId: "s1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      detail: "Upstream unavailable.",
      code: "bad_gateway",
    });
  });

  it("row assign/delete/patch and session undo forward cookie", async () => {
    const assign = await import(
      "@/app/api/import/sessions/[sessionId]/rows/[rowId]/assign/route"
    );
    const rowCtx = { params: Promise.resolve({ sessionId: "s1", rowId: "r1" }) };
    expect(
      (
        await assign.POST(
          cookieRequest("http://localhost/api/import/sessions/s1/rows/r1/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ list_id: "l1" }),
          }),
          rowCtx,
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/import/sessions/s1/rows/r1/assign",
      expect.objectContaining({ method: "POST" }),
    );
    expect(cookieOnLastFetch()).toBe("fh_session=tok");

    const del = await import(
      "@/app/api/import/sessions/[sessionId]/rows/[rowId]/delete/route"
    );
    expect(
      (
        await del.POST(
          cookieRequest("http://localhost/api/import/sessions/s1/rows/r1/delete", {
            method: "POST",
          }),
          rowCtx,
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/import/sessions/s1/rows/r1/delete",
      expect.objectContaining({ method: "POST" }),
    );
    expect(cookieOnLastFetch()).toBe("fh_session=tok");

    const patch = await import("@/app/api/import/sessions/[sessionId]/rows/[rowId]/route");
    expect(
      (
        await patch.PATCH(
          cookieRequest("http://localhost/api/import/sessions/s1/rows/r1", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: "Coffee" }),
          }),
          rowCtx,
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/import/sessions/s1/rows/r1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(cookieOnLastFetch()).toBe("fh_session=tok");

    const unassign = await import(
      "@/app/api/import/sessions/[sessionId]/rows/[rowId]/unassign/route"
    );
    expect(
      (
        await unassign.POST(
          cookieRequest("http://localhost/api/import/sessions/s1/rows/r1/unassign", {
            method: "POST",
          }),
          rowCtx,
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/import/sessions/s1/rows/r1/unassign",
      expect.objectContaining({ method: "POST" }),
    );
    expect(cookieOnLastFetch()).toBe("fh_session=tok");

    const undo = await import("@/app/api/import/sessions/[sessionId]/undo/route");
    expect(
      (
        await undo.POST(
          cookieRequest("http://localhost/api/import/sessions/s1/undo", { method: "POST" }),
          { params: Promise.resolve({ sessionId: "s1" }) },
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/import/sessions/s1/undo",
      expect.objectContaining({ method: "POST" }),
    );
    expect(cookieOnLastFetch()).toBe("fh_session=tok");
  });

  it("PATCH expense origin forwards body", async () => {
    const { PATCH } = await import(
      "@/app/api/lists/[listId]/expenses/[entryId]/origin/route"
    );
    const response = await PATCH(
      cookieRequest("http://localhost/api/lists/l1/expenses/e1/origin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "cash" }),
      }),
      { params: Promise.resolve({ listId: "l1", entryId: "e1" }) },
    );
    expect(response.status).toBe(200);
  });

  it("returns 400 for invalid JSON on cards POST and routing PATCH", async () => {
    const cards = await import("@/app/api/cards/route");
    const badCard = await cards.POST(
      cookieRequest("http://localhost/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(badCard.status).toBe(400);

    const { PATCH } = await import("@/app/api/cards/[cardId]/routing/route");
    const badRouting = await PATCH(
      cookieRequest("http://localhost/api/cards/c1/routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
      { params: Promise.resolve({ cardId: "c1" }) },
    );
    expect(badRouting.status).toBe(400);
  });

  it("returns 502 when cards or import upstream fetch fails", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));
    const cards = await import("@/app/api/cards/route");
    expect((await cards.GET(cookieRequest("http://localhost/api/cards"))).status).toBe(
      502,
    );
    expect(
      (
        await cards.POST(
          cookieRequest("http://localhost/api/cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: "BAC", iban: "CR05" }),
          }),
        )
      ).status,
    ).toBe(502);

    const session = await import("@/app/api/import/sessions/[sessionId]/route");
    const ctx = { params: Promise.resolve({ sessionId: "s1" }) };
    expect(
      (await session.GET(cookieRequest("http://localhost/api/import/sessions/s1"), ctx))
        .status,
    ).toBe(502);
    expect(
      (
        await session.DELETE(
          cookieRequest("http://localhost/api/import/sessions/s1", { method: "DELETE" }),
          ctx,
        )
      ).status,
    ).toBe(502);
  });

  it("POST dismiss failed statement forwards cookie and 502 on dead upstream", async () => {
    const dismiss = await import(
      "@/app/api/import/sessions/[sessionId]/statements/[statementId]/dismiss/route"
    );
    const ctx = { params: Promise.resolve({ sessionId: "s1", statementId: "st1" }) };
    const ok = await dismiss.POST(
      cookieRequest("http://localhost/api/import/sessions/s1/statements/st1/dismiss", {
        method: "POST",
      }),
      ctx,
    );
    expect(ok.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test:8000/import/sessions/s1/statements/st1/dismiss",
      expect.objectContaining({ method: "POST" }),
    );
    expect(cookieOnLastFetch()).toBe("fh_session=tok");

    fetchMock.mockImplementation(() => Promise.reject(new Error("ECONNREFUSED")));
    const failed = await dismiss.POST(
      cookieRequest("http://localhost/api/import/sessions/s1/statements/st1/dismiss", {
        method: "POST",
      }),
      ctx,
    );
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({
      detail: "Upstream unavailable.",
      code: "bad_gateway",
    });
  });
});
