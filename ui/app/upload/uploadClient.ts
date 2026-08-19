/** Client helpers for statement upload / discard via same-origin BFF (Story 4.6). */

export type StagedStatement = {
  id: string;
  product_id: string;
  status: "staged" | "failed";
  candidate_row_count: number;
};

export type ImportSession = {
  id: string;
  created_at: string;
  discarded_at: string | null;
  statements: StagedStatement[];
};

export type UploadMessages = {
  errorUnsupportedFileType: string;
  errorUnknownStatement: string;
  errorAmbiguousStatement: string;
  errorUnreadableStatement: string;
  errorGeneric: string;
  errorUnauthorized: string;
};

export type BulkCommitMessages = {
  errorForbidden: string;
  errorSessionNotFound: string;
  errorSessionDiscarded: string;
  errorAlreadyCommitted: string;
  errorNoCleanStatements: string;
  errorFxUnavailable: string;
  errorGeneric: string;
  errorUnauthorized: string;
};

export type ImportBatch = {
  id: string;
  statement_id: string;
  list_id: string;
  ledger_entry_count: number;
};

export type BulkCommitResult = {
  session_id: string;
  list_id: string;
  batches: ImportBatch[];
};

type ErrorResult = { ok: false; error: string };
type OkSession = { ok: true; session: ImportSession };
type OkDiscard = { ok: true };
type OkBulkCommit = { ok: true; result: BulkCommitResult };

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: UploadMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (code === "unsupported_file_type") return messages.errorUnsupportedFileType;
  if (code === "unknown_bank_adapter") return messages.errorUnknownStatement;
  if (code === "ambiguous_bank_adapter") return messages.errorAmbiguousStatement;
  if (code === "invalid_canonical_line") return messages.errorUnreadableStatement;
  return messages.errorGeneric;
}

function mapBulkCommitError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: BulkCommitMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (status === 403 || code === "not_list_member") return messages.errorForbidden;
  if (code === "import_session_not_found") return messages.errorSessionNotFound;
  if (code === "import_session_discarded") return messages.errorSessionDiscarded;
  if (code === "import_session_already_committed") return messages.errorAlreadyCommitted;
  if (code === "no_clean_statements_to_commit") return messages.errorNoCleanStatements;
  if (code === "fx_service_unavailable") return messages.errorFxUnavailable;
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asStagedStatement(data: unknown): StagedStatement | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<StagedStatement>;
  if (
    typeof row.id !== "string" ||
    typeof row.product_id !== "string" ||
    (row.status !== "staged" && row.status !== "failed") ||
    typeof row.candidate_row_count !== "number"
  ) {
    return null;
  }
  return {
    id: row.id,
    product_id: row.product_id,
    status: row.status,
    candidate_row_count: row.candidate_row_count,
  };
}

function asImportSession(data: unknown): ImportSession | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<ImportSession>;
  if (
    typeof row.id !== "string" ||
    typeof row.created_at !== "string" ||
    !Array.isArray(row.statements)
  ) {
    return null;
  }
  const statements: StagedStatement[] = [];
  for (const item of row.statements) {
    const parsed = asStagedStatement(item);
    if (parsed) statements.push(parsed);
  }
  return {
    id: row.id,
    created_at: row.created_at,
    discarded_at: typeof row.discarded_at === "string" ? row.discarded_at : null,
    statements,
  };
}

export async function uploadStatement(
  file: File,
  messages: UploadMessages,
): Promise<OkSession | ErrorResult> {
  const formData = new FormData();
  formData.set("file", file);

  let response: Response;
  try {
    response = await fetch("/api/import/sessions", {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      body: formData,
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
  if (!response.ok) {
    return { ok: false, error: mapError(response.status, body, messages) };
  }
  const session = asImportSession(body);
  if (!session) return { ok: false, error: messages.errorGeneric };
  return { ok: true, session };
}

export async function discardSession(
  sessionId: string,
  messages: UploadMessages,
): Promise<OkDiscard | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/import/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, body, messages) };
  }
  return { ok: true };
}

function asImportBatch(data: unknown): ImportBatch | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<ImportBatch>;
  if (
    typeof row.id !== "string" ||
    typeof row.statement_id !== "string" ||
    typeof row.list_id !== "string" ||
    typeof row.ledger_entry_count !== "number"
  ) {
    return null;
  }
  return {
    id: row.id,
    statement_id: row.statement_id,
    list_id: row.list_id,
    ledger_entry_count: row.ledger_entry_count,
  };
}

/** Bulk review assign & commit (Story 4.7): whole upload → one chosen list. */
export async function bulkCommitSession(
  sessionId: string,
  listId: string,
  messages: BulkCommitMessages,
): Promise<OkBulkCommit | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/import/sessions/${encodeURIComponent(sessionId)}/bulk-commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ list_id: listId }),
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
  if (!response.ok) {
    return { ok: false, error: mapBulkCommitError(response.status, body, messages) };
  }
  const data = body as Partial<BulkCommitResult> | null;
  if (
    !data ||
    typeof data.session_id !== "string" ||
    typeof data.list_id !== "string" ||
    !Array.isArray(data.batches)
  ) {
    return { ok: false, error: messages.errorGeneric };
  }
  const batches: ImportBatch[] = [];
  for (const item of data.batches) {
    const parsed = asImportBatch(item);
    if (parsed) batches.push(parsed);
  }
  return {
    ok: true,
    result: { session_id: data.session_id, list_id: data.list_id, batches },
  };
}
