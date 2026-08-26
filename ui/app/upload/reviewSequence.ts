import type { CandidateRow, ImportSession, StagedStatement } from "./uploadClient";

const EMPTY_SKIPPED: ReadonlySet<string> = new Set();

export type ReviewStep =
  | { kind: "comparison"; statement: StagedStatement }
  | { kind: "row"; row: CandidateRow; statement: StagedStatement }
  | { kind: "sheet" }
  | { kind: "none" };

/**
 * Visit-local review sequence (Story 5.1): failed statements show comparison
 * before pending rows or ImportReviewSheet. `nextReviewableRow` keeps row-only
 * semantics for assign.
 */
export function nextReviewStep(
  session: ImportSession | null,
  acknowledgedFailedIds: ReadonlySet<string> = EMPTY_SKIPPED,
  skippedRowIds: ReadonlySet<string> = EMPTY_SKIPPED,
): ReviewStep {
  if (!session || session.discarded_at) return { kind: "none" };
  if (session.finalized_at) return { kind: "none" };
  for (const statement of session.statements) {
    if (statement.status === "failed" && !acknowledgedFailedIds.has(statement.id)) {
      return { kind: "comparison", statement };
    }
    if (statement.status === "staged") {
      for (const row of statement.rows) {
        if (!skippedRowIds.has(row.id)) return { kind: "row", row, statement };
      }
    }
  }
  return { kind: "sheet" };
}

export function nextUnacknowledgedFailedStatement(
  session: ImportSession | null,
  acknowledgedFailedIds: ReadonlySet<string> = EMPTY_SKIPPED,
): StagedStatement | null {
  if (!session || session.discarded_at || session.finalized_at) return null;
  for (const statement of session.statements) {
    if (statement.status === "failed" && !acknowledgedFailedIds.has(statement.id)) {
      return statement;
    }
  }
  return null;
}
