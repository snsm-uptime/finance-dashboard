import { describe, expect, it } from "vitest";

import { classifyActiveImportSession } from "./classifyActiveImportSession";
import type { ImportSession, StagedStatement } from "./uploadClient";

function statement(overrides: Partial<StagedStatement> = {}): StagedStatement {
  return {
    id: "st1",
    product_id: "bac_credit",
    status: "staged",
    candidate_row_count: 2,
    iban: null,
    filename: "a.pdf",
    card_id: null,
    rows: [
      {
        id: "r1",
        sequence: 0,
        description: "a",
        amount: "1.00",
        currency: "CRC",
        posted_date: "2026-01-01",
        status: "pending",
      },
      {
        id: "r2",
        sequence: 1,
        description: "b",
        amount: "2.00",
        currency: "CRC",
        posted_date: "2026-01-02",
        status: "pending",
      },
    ],
    zero_amount_excluded_count: 0,
    assigned_rows: [],
    ...overrides,
  };
}

function session(overrides: Partial<ImportSession> = {}): ImportSession {
  return {
    id: "s1",
    created_at: "2026-08-24T00:00:00Z",
    discarded_at: null,
    undo: null,
    finalized_at: null,
    imported_new_count: 0,
    skipped_duplicate_count: 0,
    landing_list_id: null,
    deleted_count: 0,
    zero_amount_excluded_count: 0,
    failed_statements: [],
    committed_by_list: [],
    statements: [statement()],
    ...overrides,
  };
}

describe("classifyActiveImportSession", () => {
  it("classifies untouched when every reviewable row is still pending", () => {
    expect(classifyActiveImportSession(session())).toBe("untouched");
  });

  it("classifies partial when some reviewable rows have left pending", () => {
    expect(
      classifyActiveImportSession(
        session({
          statements: [
            statement({
              candidate_row_count: 2,
              rows: [
                {
                  id: "r2",
                  sequence: 1,
                  description: "b",
                  amount: "2.00",
                  currency: "CRC",
                  posted_date: "2026-01-02",
                  status: "pending",
                },
              ],
            }),
          ],
        }),
      ),
    ).toBe("partial");
  });

  it("classifies sheet-waiting when nothing is pending and the session is not saved", () => {
    expect(
      classifyActiveImportSession(
        session({
          statements: [statement({ candidate_row_count: 2, rows: [] })],
        }),
      ),
    ).toBe("sheet-waiting");
  });

  it("does not treat a failed empty-rows statement as partial by itself", () => {
    expect(
      classifyActiveImportSession(
        session({
          statements: [
            statement({
              id: "ok",
              candidate_row_count: 1,
              rows: [
                {
                  id: "r1",
                  sequence: 0,
                  description: "a",
                  amount: "1.00",
                  currency: "CRC",
                  posted_date: "2026-01-01",
                  status: "pending",
                },
              ],
            }),
            statement({
              id: "fail",
              status: "failed",
              candidate_row_count: 0,
              rows: [],
            }),
          ],
        }),
      ),
    ).toBe("untouched");
  });
});
