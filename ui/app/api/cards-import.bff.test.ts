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

  it("bulk-commit, statement commit, and skip forward", async () => {
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

    const stmtCtx = {
      params: Promise.resolve({ sessionId: "s1", statementId: "st1" }),
    };
    const commit = await import(
      "@/app/api/import/sessions/[sessionId]/statements/[statementId]/commit/route"
    );
    expect(
      (
        await commit.POST(
          cookieRequest(
            "http://localhost/api/import/sessions/s1/statements/st1/commit",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ list_id: "l1" }),
            },
          ),
          stmtCtx,
        )
      ).status,
    ).toBe(200);

    const skip = await import(
      "@/app/api/import/sessions/[sessionId]/statements/[statementId]/skip/route"
    );
    expect(
      (
        await skip.POST(
          cookieRequest("http://localhost/api/import/sessions/s1/statements/st1/skip", {
            method: "POST",
          }),
          stmtCtx,
        )
      ).status,
    ).toBe(200);
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
});
