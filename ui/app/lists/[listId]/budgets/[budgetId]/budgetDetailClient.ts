/** Client helpers for budget attribution — manual assign, rules, candidates (Story 6.5). */

export type BudgetCandidate = {
  id: string;
  description: string;
  posted_date: string;
  amount_crc: string;
};

export type BudgetRule = {
  id: string;
  match_text: string;
  created_at: string;
};

export type BudgetDetailClientMessages = {
  errorGeneric: string;
  errorUnauthorized: string;
  errorInvalidBudgetRuleMatchText: string;
  errorBudgetEntryNotFound: string;
  errorBudgetRuleNotFound: string;
};

type ErrorResult = { ok: false; error: string };
type OkResult = { ok: true };
type OkCandidates = { ok: true; candidates: BudgetCandidate[] };
type OkRule = { ok: true; rule: BudgetRule };

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: BudgetDetailClientMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (code === "invalid_budget_rule_match_text") return messages.errorInvalidBudgetRuleMatchText;
  if (code === "ledger_entry_not_found") return messages.errorBudgetEntryNotFound;
  if (code === "budget_rule_not_found") return messages.errorBudgetRuleNotFound;
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asCandidate(data: unknown): BudgetCandidate | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetCandidate>;
  if (
    typeof row.id !== "string" ||
    typeof row.description !== "string" ||
    typeof row.posted_date !== "string" ||
    typeof row.amount_crc !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    description: row.description,
    posted_date: row.posted_date,
    amount_crc: row.amount_crc,
  };
}

function asRule(data: unknown): BudgetRule | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetRule>;
  if (
    typeof row.id !== "string" ||
    typeof row.match_text !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return { id: row.id, match_text: row.match_text, created_at: row.created_at };
}

export async function assignEntry(
  listId: string,
  budgetId: string,
  entryId: string,
  messages: BudgetDetailClientMessages,
): Promise<OkResult | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}/assignments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ledger_entry_id: entryId }),
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  return { ok: true };
}

export async function unassignEntry(
  listId: string,
  budgetId: string,
  entryId: string,
  messages: BudgetDetailClientMessages,
): Promise<OkResult | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}/assignments/${encodeURIComponent(entryId)}`,
      {
        method: "DELETE",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  return { ok: true };
}

export async function fetchCandidates(
  listId: string,
  budgetId: string,
  messages: BudgetDetailClientMessages,
): Promise<OkCandidates | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}/candidates`,
      { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin" },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  const body = (await parseJson(response)) as { candidates?: unknown } | null;
  const rows = Array.isArray(body?.candidates) ? body.candidates : [];
  const candidates = rows.map(asCandidate).filter((c): c is BudgetCandidate => c !== null);
  return { ok: true, candidates };
}

export async function createRule(
  listId: string,
  budgetId: string,
  matchText: string,
  messages: BudgetDetailClientMessages,
): Promise<OkRule | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}/rules`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ match_text: matchText }),
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  const rule = asRule(await parseJson(response));
  if (!rule) return { ok: false, error: messages.errorGeneric };
  return { ok: true, rule };
}

export async function deleteRule(
  listId: string,
  budgetId: string,
  ruleId: string,
  messages: BudgetDetailClientMessages,
): Promise<OkResult | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}/rules/${encodeURIComponent(ruleId)}`,
      {
        method: "DELETE",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  return { ok: true };
}
