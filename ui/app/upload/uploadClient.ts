/** Client helpers for statement upload / discard via same-origin BFF (Story 4.6). */

export type StatementStatus = "staged" | "failed" | "committed" | "skipped";

export type StagedStatement = {
  id: string;
  product_id: string;
  status: StatementStatus;
  candidate_row_count: number;
  iban: string | null; // Story 4.8.1: IBAN for card identification
  filename: string | null; // Story 4.8.2: original uploaded filename
  card_id: string | null; // Story 4.8.3: identified card at upload time
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
  errorRowNotAvailable: string;
  errorNoCleanStatements: string;
  errorFxUnavailable: string;
  errorGeneric: string;
  errorUnauthorized: string;
};

export type IndividualReviewMessages = {
  errorForbidden: string;
  errorSessionNotFound: string;
  errorStatementNotFound: string;
  errorSessionDiscarded: string;
  errorStatementNotAvailable: string;
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
  if (code === "import_row_not_available") return messages.errorRowNotAvailable;
  if (code === "no_clean_statements_to_commit") return messages.errorNoCleanStatements;
  if (code === "fx_service_unavailable") return messages.errorFxUnavailable;
  return messages.errorGeneric;
}

function mapIndividualReviewError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: IndividualReviewMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (status === 403 || code === "not_list_member") return messages.errorForbidden;
  if (code === "import_session_not_found") return messages.errorSessionNotFound;
  if (code === "import_statement_not_found") return messages.errorStatementNotFound;
  if (code === "import_session_discarded") return messages.errorSessionDiscarded;
  if (code === "import_statement_not_available") return messages.errorStatementNotAvailable;
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

const STATEMENT_STATUSES: readonly StatementStatus[] = [
  "staged",
  "failed",
  "committed",
  "skipped",
];

function asStagedStatement(data: unknown): StagedStatement | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<StagedStatement>;
  if (
    typeof row.id !== "string" ||
    typeof row.product_id !== "string" ||
    !row.status ||
    !STATEMENT_STATUSES.includes(row.status) ||
    typeof row.candidate_row_count !== "number"
  ) {
    return null;
  }
  return {
    id: row.id,
    product_id: row.product_id,
    status: row.status,
    candidate_row_count: row.candidate_row_count,
    iban: typeof row.iban === "string" ? row.iban : null,
    filename: typeof row.filename === "string" ? row.filename : null,
    card_id: typeof row.card_id === "string" ? row.card_id : null,
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

/** Individual review: (re)fetch the live session state (Story 4.8). */
export async function fetchImportSession(
  sessionId: string,
  messages: IndividualReviewMessages,
): Promise<OkSession | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/import/sessions/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
  if (!response.ok) {
    return { ok: false, error: mapIndividualReviewError(response.status, body, messages) };
  }
  const session = asImportSession(body);
  if (!session) return { ok: false, error: messages.errorGeneric };
  return { ok: true, session };
}

/**
 * Individual review accept (Story 4.8): commits one statement to one list.
 * Serves both the "chosen list" and "configurable default list" outcomes —
 * pass whichever list_id applies. Returns the updated session (mirroring
 * `skipStatement`) so the caller never needs a second round-trip to learn
 * what to review next (Story 4.8 review finding).
 */
export async function commitIndividualStatement(
  sessionId: string,
  statementId: string,
  listId: string,
  cardId: string | undefined,
  messages: IndividualReviewMessages,
): Promise<OkSession | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/import/sessions/${encodeURIComponent(sessionId)}/statements/${encodeURIComponent(statementId)}/commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ list_id: listId, card_id: cardId || null }),
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
  if (!response.ok) {
    return { ok: false, error: mapIndividualReviewError(response.status, body, messages) };
  }
  const session = asImportSession(body);
  if (!session) return { ok: false, error: messages.errorGeneric };
  return { ok: true, session };
}

/** Individual review skip (Story 4.8, AC #5): no ledger rows. */
export async function skipStatement(
  sessionId: string,
  statementId: string,
  messages: IndividualReviewMessages,
): Promise<OkSession | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/import/sessions/${encodeURIComponent(sessionId)}/statements/${encodeURIComponent(statementId)}/skip`,
      {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
  if (!response.ok) {
    return { ok: false, error: mapIndividualReviewError(response.status, body, messages) };
  }
  const session = asImportSession(body);
  if (!session) return { ok: false, error: messages.errorGeneric };
  return { ok: true, session };
}

// Story 4.8.1: Card identification during individual review
export type CardIdentificationResponse = {
  matched: boolean;
  card_id?: string;
  card_label?: string;
  iban?: string | null;
};

export type CardIdentificationMessages = {
  errorCardAlreadyRegistered: string;
  errorInvalidCardLabel: string;
  errorGeneric: string;
  errorUnauthorized: string;
};

function mapCardIdentificationError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: CardIdentificationMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (code === "card_iban_already_registered") return messages.errorCardAlreadyRegistered;
  if (code === "invalid_card_label") return messages.errorInvalidCardLabel;
  return messages.errorGeneric;
}

function asCardIdentificationResponse(data: unknown): CardIdentificationResponse | null {
  if (!data || typeof data !== "object") return null;
  const resp = data as Partial<CardIdentificationResponse>;
  if (typeof resp.matched !== "boolean") return null;
  return {
    matched: resp.matched,
    card_id: typeof resp.card_id === "string" ? resp.card_id : undefined,
    card_label: typeof resp.card_label === "string" ? resp.card_label : undefined,
    iban: typeof resp.iban === "string" ? resp.iban : null,
  };
}

export async function identifyCardForStatement(
  sessionId: string,
  statementId: string,
  label: string | undefined,
  messages: CardIdentificationMessages,
): Promise<
  | { ok: true; matched: boolean; cardId?: string; cardLabel?: string; iban?: string | null }
  | { ok: false; error: string }
> {
  let response: Response;
  try {
    response = await fetch(
      `/api/import/sessions/${encodeURIComponent(sessionId)}/statements/${encodeURIComponent(
        statementId,
      )}/identify-card`,
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || null }),
        credentials: "same-origin",
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const body = (await parseJson(response)) as
    | { detail?: unknown; code?: unknown }
    | CardIdentificationResponse
    | null;
  if (!response.ok) {
    return {
      ok: false,
      error: mapCardIdentificationError(
        response.status,
        (body as { detail?: unknown; code?: unknown } | null) || null,
        messages,
      ),
    };
  }
  const identified = asCardIdentificationResponse(body);
  if (!identified) return { ok: false, error: messages.errorGeneric };
  return {
    ok: true,
    matched: identified.matched,
    cardId: identified.card_id,
    cardLabel: identified.card_label,
    iban: identified.iban,
  };
}
