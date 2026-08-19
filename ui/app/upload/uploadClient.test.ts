import { afterEach, describe, expect, it, vi } from "vitest";

import { discardSession, uploadStatement } from "./uploadClient";

const messages = {
  errorUnsupportedFileType: "unsupported",
  errorUnknownStatement: "unknown",
  errorAmbiguousStatement: "ambiguous",
  errorUnreadableStatement: "unreadable",
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
};

function fakeFile(): File {
  return new File(["%PDF-1.4"], "statement.pdf", { type: "application/pdf" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadClient", () => {
  it("returns the parsed session shape on a successful upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: "s1",
          created_at: "2026-08-18T00:00:00Z",
          discarded_at: null,
          statements: [
            { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 12 },
          ],
        }),
      }),
    );

    const result = await uploadStatement(fakeFile(), messages);
    expect(result).toEqual({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-18T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 12 },
        ],
      },
    });
  });

  it("maps 422 unsupported_file_type to errorUnsupportedFileType", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "unsupported_file_type", detail: "Only PDF." }),
      }),
    );

    const result = await uploadStatement(fakeFile(), messages);
    expect(result).toEqual({ ok: false, error: "unsupported" });
  });

  it("maps 422 unknown_bank_adapter to errorUnknownStatement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "unknown_bank_adapter", detail: "Unknown." }),
      }),
    );

    const result = await uploadStatement(fakeFile(), messages);
    expect(result).toEqual({ ok: false, error: "unknown" });
  });

  it("maps 422 ambiguous_bank_adapter to errorAmbiguousStatement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "ambiguous_bank_adapter", detail: "Ambiguous." }),
      }),
    );

    const result = await uploadStatement(fakeFile(), messages);
    expect(result).toEqual({ ok: false, error: "ambiguous" });
  });

  it("maps 422 invalid_canonical_line to errorUnreadableStatement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "invalid_canonical_line", detail: "Bad row." }),
      }),
    );

    const result = await uploadStatement(fakeFile(), messages);
    expect(result).toEqual({ ok: false, error: "unreadable" });
  });

  it("maps 401 to errorUnauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Not authenticated." }),
      }),
    );

    const result = await uploadStatement(fakeFile(), messages);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("discardSession returns ok on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          created_at: "2026-08-18T00:00:00Z",
          discarded_at: "2026-08-18T00:05:00Z",
          statements: [],
        }),
      }),
    );

    const result = await discardSession("s1", messages);
    expect(result).toEqual({ ok: true });
  });

  it("discardSession maps 404 to errorGeneric (no dedicated not-found message)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "import_session_not_found", detail: "nope" }),
      }),
    );

    const result = await discardSession("s1", messages);
    expect(result).toEqual({ ok: false, error: "generic" });
  });
});
