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

type ErrorResult = { ok: false; error: string };
type OkSession = { ok: true; session: ImportSession };
type OkDiscard = { ok: true };

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
