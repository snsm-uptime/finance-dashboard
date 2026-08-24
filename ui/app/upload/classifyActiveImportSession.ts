import type { ImportSession } from "./uploadClient";

export type ActiveImportKind = "untouched" | "partial" | "sheet-waiting";

export function classifyActiveImportSession(session: ImportSession): ActiveImportKind {
  const reviewableSum = session.statements.reduce((sum, statement) => {
    return sum + (statement.candidate_row_count - statement.zero_amount_excluded_count);
  }, 0);
  const pendingSum = session.statements.reduce((sum, statement) => sum + statement.rows.length, 0);

  if (!session.finalized_at && !session.discarded_at && pendingSum === 0) {
    return "sheet-waiting";
  }
  if (
    !session.finalized_at &&
    !session.discarded_at &&
    pendingSum > 0 &&
    pendingSum === reviewableSum
  ) {
    return "untouched";
  }
  return "partial";
}
