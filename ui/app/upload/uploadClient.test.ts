import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bulkCommitSession,
  commitIndividualStatement,
  discardSession,
  fetchImportSession,
  skipStatement,
  uploadStatement,
} from "./uploadClient";

const messages = {
  errorUnsupportedFileType: "unsupported",
  errorUnknownStatement: "unknown",
  errorAmbiguousStatement: "ambiguous",
  errorUnreadableStatement: "unreadable",
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
};

const bulkCommitMessages = {
  errorForbidden: "forbidden",
  errorSessionNotFound: "session-not-found",
  errorSessionDiscarded: "discarded",
  errorAlreadyCommitted: "already-committed",
  errorNoCleanStatements: "no-clean-statements",
  errorFxUnavailable: "fx-unavailable",
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
};

const individualReviewMessages = {
  errorForbidden: "forbidden",
  errorSessionNotFound: "session-not-found",
  errorStatementNotFound: "statement-not-found",
  errorSessionDiscarded: "discarded",
  errorStatementNotAvailable: "statement-not-available",
  errorFxUnavailable: "fx-unavailable",
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
            { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 12, iban: null, filename: null },
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
          { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 12, iban: null, filename: null },
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

  it("bulkCommitSession returns the parsed result and posts list_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        session_id: "s1",
        list_id: "l1",
        batches: [{ id: "b1", statement_id: "st1", list_id: "l1", ledger_entry_count: 3 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bulkCommitSession("s1", "l1", bulkCommitMessages);

    expect(result).toEqual({
      ok: true,
      result: {
        session_id: "s1",
        list_id: "l1",
        batches: [{ id: "b1", statement_id: "st1", list_id: "l1", ledger_entry_count: 3 }],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/bulk-commit",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ list_id: "l1" }) }),
    );
  });

  it("bulkCommitSession maps 403 not_list_member to errorForbidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "not_list_member", detail: "no" }),
      }),
    );

    const result = await bulkCommitSession("s1", "l1", bulkCommitMessages);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("bulkCommitSession maps import_session_already_committed to errorAlreadyCommitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_session_already_committed", detail: "no" }),
      }),
    );

    const result = await bulkCommitSession("s1", "l1", bulkCommitMessages);
    expect(result).toEqual({ ok: false, error: "already-committed" });
  });

  it("bulkCommitSession maps import_session_discarded to errorSessionDiscarded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_session_discarded", detail: "no" }),
      }),
    );

    const result = await bulkCommitSession("s1", "l1", bulkCommitMessages);
    expect(result).toEqual({ ok: false, error: "discarded" });
  });

  it("bulkCommitSession maps fx_service_unavailable to errorFxUnavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: "fx_service_unavailable", detail: "no" }),
      }),
    );

    const result = await bulkCommitSession("s1", "l1", bulkCommitMessages);
    expect(result).toEqual({ ok: false, error: "fx-unavailable" });
  });

  // --- Story 4.8: fetchImportSession / commitIndividualStatement / skipStatement ---

  it("fetchImportSession returns the parsed session including committed/skipped statuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "committed", candidate_row_count: 3, iban: null, filename: null },
          { id: "st2", product_id: "bac_credit", status: "skipped", candidate_row_count: 1, iban: null, filename: null },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImportSession("s1", individualReviewMessages);

    expect(result).toEqual({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "committed", candidate_row_count: 3, iban: null, filename: null },
          { id: "st2", product_id: "bac_credit", status: "skipped", candidate_row_count: 1, iban: null, filename: null },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchImportSession maps import_session_not_found to errorSessionNotFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "import_session_not_found", detail: "no" }),
      }),
    );

    const result = await fetchImportSession("s1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "session-not-found" });
  });

  it("commitIndividualStatement posts list_id and returns the updated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "committed", candidate_row_count: 3, iban: null, filename: null },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await commitIndividualStatement("s1", "st1", "l1", undefined, individualReviewMessages);

    expect(result).toEqual({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "committed", candidate_row_count: 3, iban: null, filename: null },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/statements/st1/commit",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ list_id: "l1", card_id: null }) }),
    );
  });

  it("commitIndividualStatement maps 403 not_list_member to errorForbidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "not_list_member", detail: "no" }),
      }),
    );

    const result = await commitIndividualStatement("s1", "st1", "l1", undefined, individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("commitIndividualStatement maps import_statement_not_found to errorStatementNotFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "import_statement_not_found", detail: "no" }),
      }),
    );

    const result = await commitIndividualStatement("s1", "st1", "l1", undefined, individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "statement-not-found" });
  });

  it("commitIndividualStatement maps import_statement_not_available to errorStatementNotAvailable (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_statement_not_available", detail: "no" }),
      }),
    );

    const result = await commitIndividualStatement("s1", "st1", "l1", undefined, individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "statement-not-available" });
  });

  it("commitIndividualStatement maps import_session_discarded to errorSessionDiscarded (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_session_discarded", detail: "no" }),
      }),
    );

    const result = await commitIndividualStatement("s1", "st1", "l1", undefined, individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "discarded" });
  });

  it("commitIndividualStatement maps fx_service_unavailable to errorFxUnavailable (503)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: "fx_service_unavailable", detail: "no" }),
      }),
    );

    const result = await commitIndividualStatement("s1", "st1", "l1", undefined, individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "fx-unavailable" });
  });

  it("skipStatement posts to the statement skip route and returns the updated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "skipped", candidate_row_count: 2, iban: null, filename: null },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await skipStatement("s1", "st1", individualReviewMessages);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/statements/st1/skip",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("skipStatement maps import_statement_not_available to errorStatementNotAvailable (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_statement_not_available", detail: "no" }),
      }),
    );

    const result = await skipStatement("s1", "st1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "statement-not-available" });
  });
});
