/** Client helpers for budget create via same-origin BFF (Story 6.3). */

export type BudgetItem = {
  id: string;
  list_id: string;
  name: string;
  cap: string;
  currency: string;
  spent: string;
  state: "ok" | "near" | "over";
  created_at: string;
};

export type BudgetsClientMessages = {
  errorGeneric: string;
  errorUnauthorized: string;
  errorInvalidBudgetName: string;
  errorInvalidBudgetCap: string;
  errorInvalidBudgetCurrency: string;
};

export type BudgetStateMessages = {
  budgetsStateOk: string;
  budgetsStateNear: string;
  budgetsStateOver: string;
};

/** Near-cap-state to display label mapping (AC #2 — distinct treatment, not a bare percentage). */
export function budgetStateLabel(state: BudgetItem["state"], t: BudgetStateMessages): string {
  if (state === "over") return t.budgetsStateOver;
  if (state === "near") return t.budgetsStateNear;
  return t.budgetsStateOk;
}

type ErrorResult = { ok: false; error: string };
type OkBudgets = { ok: true; budgets: BudgetItem[] };
type OkBudget = { ok: true; budget: BudgetItem };

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: BudgetsClientMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (code === "invalid_budget_name") return messages.errorInvalidBudgetName;
  if (code === "invalid_budget_cap") return messages.errorInvalidBudgetCap;
  if (code === "invalid_budget_currency") return messages.errorInvalidBudgetCurrency;
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asBudget(data: unknown): BudgetItem | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetItem>;
  if (
    typeof row.id !== "string" ||
    typeof row.list_id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.cap !== "string" ||
    typeof row.currency !== "string" ||
    typeof row.spent !== "string" ||
    (row.state !== "ok" && row.state !== "near" && row.state !== "over") ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    list_id: row.list_id,
    name: row.name,
    cap: row.cap,
    currency: row.currency,
    spent: row.spent,
    state: row.state,
    created_at: row.created_at,
  };
}

export async function fetchBudgets(
  listId: string,
  messages: BudgetsClientMessages,
): Promise<OkBudgets | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/budgets`, {
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
  const data = (await parseJson(response)) as { budgets?: unknown } | null;
  if (!data || !Array.isArray(data.budgets)) {
    return { ok: false, error: messages.errorGeneric };
  }
  const budgets: BudgetItem[] = [];
  for (const row of data.budgets) {
    const parsed = asBudget(row);
    if (parsed) budgets.push(parsed);
  }
  return { ok: true, budgets };
}

export async function createBudget(
  listId: string,
  body: { name: string; cap: string; currency: string },
  messages: BudgetsClientMessages,
): Promise<OkBudget | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/budgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  const budget = asBudget(await parseJson(response));
  if (!budget) return { ok: false, error: messages.errorGeneric };
  return { ok: true, budget };
}
