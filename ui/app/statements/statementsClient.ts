/** Client helpers for statement listing via same-origin BFF. */

export type StatementSummary = {
  statement_id: string;
  card_id: string | null;
  card_label: string | null;
  period_start: string; // ISO 8601 date
  period_end: string;   // ISO 8601 date
  item_count: number;
  destination_list_ids: string[];
  destination_list_names: (string | null)[];
};

export type StatementCardGroup = {
  card_id: string | null;
  card_label: string | null;
  statements: StatementSummary[];
};

export type StatementGroup = {
  groups: StatementCardGroup[];
};

export type StatementsClientMessages = {
  errorGeneric: string;
  errorUnauthorized: string;
};

type ErrorResult = { ok: false; error: string };
type OkGroups = { ok: true; groups: StatementCardGroup[] };
type OkSummary = { ok: true; summary: StatementSummary };

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: StatementsClientMessages,
): string {
  if (status === 401) return messages.errorUnauthorized;
  if (status === 404) return messages.errorGeneric;
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const ISO8601_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asStatementSummary(data: unknown): StatementSummary | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<StatementSummary>;
  if (
    typeof row.statement_id !== "string" ||
    typeof row.period_start !== "string" ||
    typeof row.period_end !== "string" ||
    typeof row.item_count !== "number" ||
    !ISO8601_DATE.test(row.period_start) ||
    !ISO8601_DATE.test(row.period_end) ||
    row.item_count < 0 ||
    !Number.isInteger(row.item_count)
  ) {
    return null;
  }
  return {
    statement_id: row.statement_id,
    card_id: typeof row.card_id === "string" ? row.card_id : null,
    card_label: typeof row.card_label === "string" ? row.card_label : null,
    period_start: row.period_start,
    period_end: row.period_end,
    item_count: row.item_count,
    destination_list_ids: Array.isArray(row.destination_list_ids)
      ? row.destination_list_ids.filter((id): id is string => typeof id === "string")
      : [],
    destination_list_names: Array.isArray(row.destination_list_names)
      ? row.destination_list_names.map((name) => (typeof name === "string" ? name : null))
      : [],
  };
}

function asStatementCardGroup(data: unknown): StatementCardGroup | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<StatementCardGroup>;
  if (!Array.isArray(row.statements)) return null;

  const statements: StatementSummary[] = [];
  for (const stmt of row.statements) {
    const parsed = asStatementSummary(stmt);
    if (parsed) statements.push(parsed);
  }

  return {
    card_id: typeof row.card_id === "string" ? row.card_id : null,
    card_label: typeof row.card_label === "string" ? row.card_label : null,
    statements,
  };
}

export async function fetchStatementGroups(
  messages: StatementsClientMessages,
): Promise<OkGroups | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/statements", {
      method: "GET",
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
  const data = (await parseJson(response)) as { groups?: unknown } | null;
  if (!data || !Array.isArray(data.groups)) {
    return { ok: false, error: messages.errorGeneric };
  }
  const groups: StatementCardGroup[] = [];
  for (const row of data.groups) {
    const parsed = asStatementCardGroup(row);
    if (parsed) groups.push(parsed);
  }
  return { ok: true, groups };
}

export async function fetchStatementSummary(
  statementId: string,
  messages: StatementsClientMessages,
): Promise<OkSummary | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/statements/${encodeURIComponent(statementId)}`, {
      method: "GET",
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
  const summary = asStatementSummary(await parseJson(response));
  if (!summary) return { ok: false, error: messages.errorGeneric };
  return { ok: true, summary };
}
