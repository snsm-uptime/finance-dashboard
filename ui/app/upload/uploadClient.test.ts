import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assignRow,
  bulkCommitSession,
  deleteRow,
  discardSession,
  dismissFailedStatement,
  editRowDescription,
  fetchActiveImportSession,
  fetchImportSession,
  finalizeSession,
  unassignRow,
  undoLastResolution,
  uploadStatement,
} from "./uploadClient";

const messages = {
  errorUnsupportedFileType: "unsupported",
  errorUnknownStatement: "unknown",
  errorAmbiguousStatement: "ambiguous",
  errorUnreadableStatement: "unreadable",
  errorDuplicateStatement: "duplicate",
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
};

const bulkCommitMessages = {
  errorForbidden: "forbidden",
  errorSessionNotFound: "session-not-found",
  errorSessionDiscarded: "discarded",
  errorAlreadyCommitted: "already-committed",
  errorRowNotAvailable: "row-not-available",
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
  errorRowNotFound: "row-not-found",
  errorRowNotAvailable: "row-not-available",
  errorNothingToUndo: "nothing-to-undo",
  errorSessionHasPendingRows: "session-has-pending-rows",
  errorRowNotDiscardable: "row-not-discardable",
  errorFxUnavailable: "fx-unavailable",
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
};

const emptyStatementFields = {
  rows: [],
  zero_amount_excluded_count: 0,
  assigned_rows: [],
  parse_evidence: null,
};

// Story 4.12 added four fields that default when the payload omits them, so the
// exact-shape assertions below spread these rather than restating them.
const emptySessionFields = {
  finalized_at: null,
  imported_new_count: 0,
  skipped_duplicate_count: 0,
  landing_list_id: null,
  deleted_count: 0,
  zero_amount_excluded_count: 0,
  failed_statements: [] as const,
  committed_by_list: [] as const,
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
            { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 12, iban: null, filename: null, card_id: null },
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
        undo: null,
        ...emptySessionFields,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 12, iban: null, filename: null, card_id: null, ...emptyStatementFields },
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

  it("maps 409 duplicate_statement_upload to errorDuplicateStatement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          code: "duplicate_statement_upload",
          detail: "This statement has already been uploaded.",
          session_id: "existing-session",
        }),
      }),
    );

    const result = await uploadStatement(fakeFile(), messages);
    expect(result).toEqual({
      ok: false,
      error: "duplicate",
      duplicateSessionId: "existing-session",
    });
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

  const dismissMessages = {
    ...messages,
    errorSessionDiscarded: "discarded",
    errorStatementNotFailed: "not-failed",
  };

  it("dismissFailedStatement returns the session on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          created_at: "2026-08-18T00:00:00Z",
          discarded_at: null,
          statements: [
            {
              id: "st1",
              product_id: "p",
              status: "skipped",
              candidate_row_count: 0,
              iban: null,
              filename: "a.pdf",
              card_id: null,
              ...emptyStatementFields,
            },
          ],
        }),
      }),
    );
    const result = await dismissFailedStatement("s1", "st1", dismissMessages);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.statements[0]?.status).toBe("skipped");
  });

  it("dismissFailedStatement maps 409 discarded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_session_discarded" }),
      }),
    );
    const result = await dismissFailedStatement("s1", "st1", dismissMessages);
    expect(result).toEqual({ ok: false, error: "discarded" });
  });

  it("dismissFailedStatement maps 409 not-failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_statement_not_failed" }),
      }),
    );
    const result = await dismissFailedStatement("s1", "st1", dismissMessages);
    expect(result).toEqual({ ok: false, error: "not-failed" });
  });

  it("dismissFailedStatement maps 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    );
    const result = await dismissFailedStatement("s1", "st1", dismissMessages);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
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

  it("bulkCommitSession maps import_row_not_available to errorRowNotAvailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_row_not_available", detail: "no" }),
      }),
    );

    const result = await bulkCommitSession("s1", "l1", bulkCommitMessages);
    expect(result).toEqual({ ok: false, error: "row-not-available" });
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

  // --- Row-level review client (Story 4.11) ---

  it("fetchImportSession returns the parsed session including committed/skipped statuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "committed", candidate_row_count: 3, iban: null, filename: null, card_id: null },
          { id: "st2", product_id: "bac_credit", status: "skipped", candidate_row_count: 1, iban: null, filename: null, card_id: null },
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
        undo: null,
        ...emptySessionFields,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "committed", candidate_row_count: 3, iban: null, filename: null, card_id: null, ...emptyStatementFields },
          { id: "st2", product_id: "bac_credit", status: "skipped", candidate_row_count: 1, iban: null, filename: null, card_id: null, ...emptyStatementFields },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchActiveImportSession treats HTTP 200 null as no active session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchActiveImportSession(messages);

    expect(result).toEqual({ ok: true, session: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/active",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("asStagedStatement defaults missing rows and drops malformed row entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          created_at: "2026-08-19T00:00:00Z",
          discarded_at: null,
          undo: { row_id: "r1", action: "assign" },
          statements: [
            {
              id: "st1",
              product_id: "bac_credit",
              status: "staged",
              candidate_row_count: 2,
              iban: null,
              filename: null,
              card_id: null,
              rows: [
                {
                  id: "r1",
                  sequence: 1,
                  description: "Coffee",
                  amount: "10.00",
                  currency: "CRC",
                  posted_date: "2026-01-01",
                  status: "pending",
                },
                { id: "bad", amount: 12 },
              ],
            },
          ],
        }),
      }),
    );

    const result = await fetchImportSession("s1", individualReviewMessages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.undo).toEqual({ row_id: "r1", action: "assign" });
    expect(result.session.statements[0].rows).toEqual([
      {
        id: "r1",
        sequence: 1,
        description: "Coffee",
        amount: "10.00",
        currency: "CRC",
        posted_date: "2026-01-01",
        status: "pending",
        resolved_list_id: null,
        dedup_skipped: false,
      },
    ]);
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

  it("assignRow posts list_id and returns the updated session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 3, iban: null, filename: null, card_id: null },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await assignRow("s1", "r1", "l1", individualReviewMessages);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/rows/r1/assign",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ list_id: "l1" }) }),
    );
  });

  it("assignRow maps 403 not_list_member to errorForbidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "not_list_member", detail: "no" }),
      }),
    );

    const result = await assignRow("s1", "r1", "l1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("assignRow maps import_row_not_found to errorRowNotFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: "import_row_not_found", detail: "no" }),
      }),
    );

    const result = await assignRow("s1", "r1", "l1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "row-not-found" });
  });

  it("assignRow maps import_row_not_available to errorRowNotAvailable (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_row_not_available", detail: "no" }),
      }),
    );

    const result = await assignRow("s1", "r1", "l1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "row-not-available" });
  });

  it("assignRow maps import_session_discarded to errorSessionDiscarded (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_session_discarded", detail: "no" }),
      }),
    );

    const result = await assignRow("s1", "r1", "l1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "discarded" });
  });

  it("assignRow maps fx_service_unavailable to errorFxUnavailable (503)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: "fx_service_unavailable", detail: "no" }),
      }),
    );

    const result = await assignRow("s1", "r1", "l1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "fx-unavailable" });
  });

  it("deleteRow posts to the row delete route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteRow("s1", "r1", individualReviewMessages);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/rows/r1/delete",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("unassignRow posts to the row unassign route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await unassignRow("s1", "r1", individualReviewMessages);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/rows/r1/unassign",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("unassignRow maps import_row_not_discardable to errorRowNotDiscardable (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_row_not_discardable", detail: "no" }),
      }),
    );

    const result = await unassignRow("s1", "r1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "row-not-discardable" });
  });

  it("asStagedStatement parses assigned_rows with resolved_list_id and dedup_skipped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          created_at: "2026-08-19T00:00:00Z",
          discarded_at: null,
          statements: [
            {
              id: "st1",
              product_id: "bac_credit",
              status: "staged",
              candidate_row_count: 2,
              iban: null,
              filename: null,
              card_id: null,
              rows: [],
              zero_amount_excluded_count: 0,
              assigned_rows: [
                {
                  id: "r1",
                  sequence: 1,
                  description: "Coffee",
                  amount: "10.00",
                  currency: "CRC",
                  posted_date: "2026-01-01",
                  status: "committed",
                  resolved_list_id: "l1",
                  dedup_skipped: false,
                },
                {
                  id: "r2",
                  sequence: 2,
                  description: "Lunch",
                  amount: "5.00",
                  currency: "CRC",
                  posted_date: "2026-01-02",
                  status: "committed",
                  resolved_list_id: "l1",
                  dedup_skipped: true,
                },
              ],
            },
          ],
        }),
      }),
    );

    const result = await fetchImportSession("s1", individualReviewMessages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.statements[0].assigned_rows).toEqual([
      {
        id: "r1",
        sequence: 1,
        description: "Coffee",
        amount: "10.00",
        currency: "CRC",
        posted_date: "2026-01-01",
        status: "committed",
        resolved_list_id: "l1",
        dedup_skipped: false,
      },
      {
        id: "r2",
        sequence: 2,
        description: "Lunch",
        amount: "5.00",
        currency: "CRC",
        posted_date: "2026-01-02",
        status: "committed",
        resolved_list_id: "l1",
        dedup_skipped: true,
      },
    ]);
  });

  it("asStagedStatement defaults assigned_rows to [] when the payload omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          created_at: "2026-08-19T00:00:00Z",
          discarded_at: null,
          statements: [
            {
              id: "st1",
              product_id: "bac_credit",
              status: "staged",
              candidate_row_count: 1,
              iban: null,
              filename: null,
              card_id: null,
              rows: [],
              zero_amount_excluded_count: 0,
              // assigned_rows omitted — mirrors an older API payload.
            },
          ],
        }),
      }),
    );

    const result = await fetchImportSession("s1", individualReviewMessages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.statements[0].assigned_rows).toEqual([]);
  });

  it("undoLastResolution maps import_nothing_to_undo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_nothing_to_undo", detail: "no" }),
      }),
    );

    const result = await undoLastResolution("s1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "nothing-to-undo" });
  });

  it("editRowDescription patches description", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-19T00:00:00Z",
        discarded_at: null,
        statements: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await editRowDescription("s1", "r1", "Coffee", individualReviewMessages);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/rows/r1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ description: "Coffee" }),
      }),
    );
  });
  it("finalizeSession posts to the finalize endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "s1",
        created_at: "2026-08-23T00:00:00Z",
        discarded_at: null,
        statements: [],
        finalized_at: "2026-08-23T10:00:00Z",
        imported_new_count: 3,
        skipped_duplicate_count: 2,
        landing_list_id: "l9",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await finalizeSession("s1", individualReviewMessages);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/import/sessions/s1/finalize",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.finalized_at).toBe("2026-08-23T10:00:00Z");
      expect(result.session.imported_new_count).toBe(3);
      expect(result.session.skipped_duplicate_count).toBe(2);
      expect(result.session.landing_list_id).toBe("l9");
    }
  });

  it("finalizeSession maps import_session_has_pending_rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "import_session_has_pending_rows", detail: "pending" }),
      }),
    );

    const result = await finalizeSession("s1", individualReviewMessages);
    expect(result).toEqual({ ok: false, error: "session-has-pending-rows" });
  });

  it("session parsing tolerates a payload missing the Story 4.12 fields", async () => {
    // An older API omits all four; making them required would reject an
    // otherwise-valid payload, so they default rather than failing the parse.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "s1",
          created_at: "2026-08-23T00:00:00Z",
          discarded_at: null,
          statements: [],
        }),
      }),
    );

    const result = await finalizeSession("s1", individualReviewMessages);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.finalized_at).toBeNull();
      expect(result.session.landing_list_id).toBeNull();
      expect(result.session.imported_new_count).toBe(0);
      expect(result.session.skipped_duplicate_count).toBe(0);
    }
  });
});
