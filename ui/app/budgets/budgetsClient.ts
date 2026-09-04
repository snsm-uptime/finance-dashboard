/** Client helpers for standalone budget create/list via same-origin BFF (Story 7.1). */

export type BudgetItem = {
  id: string;
  name: string;
  cap: string;
  currency: string;
  spent: string;
  state: "ok" | "near" | "over";
  source_list_ids: string[];
  // Optional date-range period (Story 7.5) — `YYYY-MM-DD` strings or null,
  // never a JS `Date` (project-context: dates are strings at every boundary).
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  is_archived: boolean;
};

export type BudgetsClientMessages = {
  errorGeneric: string;
  errorUnauthorized: string;
  errorInvalidBudgetName: string;
  errorInvalidBudgetCap: string;
  errorInvalidBudgetCurrency: string;
  errorInvalidBudgetSourceLists: string;
  errorInvalidBudgetPeriod: string;
  errorForbidden: string;
};

export type BudgetStateMessages = {
  budgetsStateOk: string;
  budgetsStateNear: string;
  budgetsStateOver: string;
};

/** Near-cap-state to display label mapping (AC #2 — distinct treatment, not a bare percentage). */
export function budgetStateLabel(
  state: BudgetItem["state"],
  t: BudgetStateMessages,
): string {
  if (state === "over") return t.budgetsStateOver;
  if (state === "near") return t.budgetsStateNear;
  return t.budgetsStateOk;
}

/** spent / cap as a 0-100+ percentage, or null when cap is missing/zero/non-numeric. */
export function budgetUsageRatio(
  budget: Pick<BudgetItem, "spent" | "cap">,
): number | null {
  const spent = Number.parseFloat(budget.spent);
  const cap = Number.parseFloat(budget.cap);
  if (!Number.isFinite(spent) || !Number.isFinite(cap) || cap <= 0) return null;
  return (spent / cap) * 100;
}

/** Three-tier ratio → severity color class, shared between the list tile and detail-page top bars. */
export function budgetSeverityColorClass(ratio: number | null): string {
  if (ratio === null) return "bg-muted";
  if (ratio < 70) return "bg-owed";
  if (ratio <= 90) return "bg-warn";
  return "bg-owe";
}

/**
 * Calendar days between `now` and `periodEnd` (`YYYY-MM-DD`), positive when
 * the period is still open, 0/negative once it's due or past due. `null`
 * when there's no end date (open-ended budget — no countdown to show).
 */
export function budgetDaysLeft(
  periodEnd: string | null,
  now: Date = new Date(),
): number | null {
  if (!periodEnd) return null;
  const [year, month, day] = periodEnd.split("-").map(Number);
  if (!year || !month || !day) return null;
  const end = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - today.getTime()) / msPerDay);
}

/** `YYYY-MM-DD` → locale-formatted short date (e.g. "Jan 31"), for tooltips/captions. */
export function formatPeriodBoundShort(dateStr: string, locale: "en" | "es"): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(locale === "es" ? "es-CR" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
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
  if (status === 403 || code === "not_list_member")
    return messages.errorForbidden;
  if (code === "invalid_budget_name") return messages.errorInvalidBudgetName;
  if (code === "invalid_budget_cap") return messages.errorInvalidBudgetCap;
  if (code === "invalid_budget_currency")
    return messages.errorInvalidBudgetCurrency;
  if (code === "invalid_budget_source_lists")
    return messages.errorInvalidBudgetSourceLists;
  if (code === "invalid_budget_period") return messages.errorInvalidBudgetPeriod;
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// Defensive parsing of the `source_lists` response shape — an unexpected
// wire shape drops the row rather than crashing the panel (Story 7.1, AC #6).
function asPeriodBound(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBudget(data: unknown): BudgetItem | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetItem>;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.cap !== "string" ||
    typeof row.currency !== "string" ||
    typeof row.spent !== "string" ||
    (row.state !== "ok" && row.state !== "near" && row.state !== "over") ||
    !Array.isArray(row.source_list_ids) ||
    !row.source_list_ids.every((id) => typeof id === "string") ||
    typeof row.created_at !== "string" ||
    typeof row.is_archived !== "boolean"
  ) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    cap: row.cap,
    currency: row.currency,
    spent: row.spent,
    state: row.state,
    source_list_ids: row.source_list_ids,
    period_start: asPeriodBound(row.period_start),
    period_end: asPeriodBound(row.period_end),
    created_at: row.created_at,
    is_archived: row.is_archived,
  };
}

function asBudgetFromWire(data: unknown): BudgetItem | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { source_lists?: unknown };
  if (!Array.isArray(row.source_lists)) return null;
  return asBudget({ ...(data as object), source_list_ids: row.source_lists });
}

export async function fetchBudgets(
  messages: BudgetsClientMessages,
  options: { archived?: boolean } = {},
): Promise<OkBudgets | ErrorResult> {
  const url = options.archived ? "/api/budgets?archived=true" : "/api/budgets";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const body = (await parseJson(response)) as {
      detail?: unknown;
      code?: unknown;
    } | null;
    return { ok: false, error: mapError(response.status, body, messages) };
  }
  const data = (await parseJson(response)) as { budgets?: unknown } | null;
  if (!data || !Array.isArray(data.budgets)) {
    return { ok: false, error: messages.errorGeneric };
  }
  const budgets: BudgetItem[] = [];
  for (const row of data.budgets) {
    const parsed = asBudgetFromWire(row);
    if (parsed) budgets.push(parsed);
  }
  return { ok: true, budgets };
}

/**
 * Confirm-Sheet intro copy for a period change that excludes lines —
 * mirrors `rollbackBatchConfirmBodyFrom` (Story 5.4): singular body text
 * below 2 excluded lines, a `{count}`-templated plural above.
 */
export function periodChangeConfirmBodyFrom(
  excludedLines: PeriodChangeLine[],
  t: { budgetsPeriodChangeConfirmBody: string; budgetsPeriodChangeConfirmBodyCount: string },
): string {
  return excludedLines.length > 1
    ? t.budgetsPeriodChangeConfirmBodyCount.replace("{count}", String(excludedLines.length))
    : t.budgetsPeriodChangeConfirmBody;
}

export async function createBudget(
  body: {
    name: string;
    cap: string;
    currency: string;
    source_list_ids: string[];
    period_start?: string | null;
    period_end?: string | null;
  },
  messages: BudgetsClientMessages,
): Promise<OkBudget | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/budgets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as {
      detail?: unknown;
      code?: unknown;
    } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  const budget = asBudgetFromWire(await parseJson(response));
  if (!budget) return { ok: false, error: messages.errorGeneric };
  return { ok: true, budget };
}

export type PeriodChangeLine = {
  id: string;
  description: string;
  posted_date: string;
  amount_crc: string;
};

type OkPeriodPreview = { ok: true; excludedLines: PeriodChangeLine[] };
type PeriodChangeRequiresConfirmation = {
  ok: false;
  requiresConfirmation: true;
  excludedLines: PeriodChangeLine[];
};

function asPeriodChangeLine(data: unknown): PeriodChangeLine | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<PeriodChangeLine>;
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

export async function updateBudget(
  budgetId: string,
  body: {
    name: string;
    cap: string;
    currency: string;
    source_list_ids: string[];
    period_start?: string | null;
    period_end?: string | null;
    confirm_period_change?: boolean;
  },
  messages: BudgetsClientMessages,
): Promise<OkBudget | PeriodChangeRequiresConfirmation | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/budgets/${encodeURIComponent(budgetId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const parsed = (await parseJson(response)) as {
    detail?: unknown;
    code?: unknown;
    excluded_lines?: unknown;
  } | null;
  if (!response.ok) {
    if (parsed?.code === "period_change_requires_confirmation") {
      const rows = Array.isArray(parsed.excluded_lines) ? parsed.excluded_lines : [];
      const excludedLines = rows
        .map(asPeriodChangeLine)
        .filter((line): line is PeriodChangeLine => line !== null);
      return { ok: false, requiresConfirmation: true, excludedLines };
    }
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  const budget = asBudgetFromWire(parsed);
  if (!budget) return { ok: false, error: messages.errorGeneric };
  return { ok: true, budget };
}

async function postBudgetAction(
  budgetId: string,
  action: "archive" | "unarchive",
  messages: BudgetsClientMessages,
): Promise<OkBudget | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/budgets/${budgetId}/${action}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as {
      detail?: unknown;
      code?: unknown;
    } | null;
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  const budget = asBudgetFromWire(await parseJson(response));
  if (!budget) return { ok: false, error: messages.errorGeneric };
  return { ok: true, budget };
}

export async function archiveBudget(
  budgetId: string,
  messages: BudgetsClientMessages,
): Promise<OkBudget | ErrorResult> {
  return postBudgetAction(budgetId, "archive", messages);
}

export async function unarchiveBudget(
  budgetId: string,
  messages: BudgetsClientMessages,
): Promise<OkBudget | ErrorResult> {
  return postBudgetAction(budgetId, "unarchive", messages);
}

export async function previewPeriodChange(
  budgetId: string,
  periodStart: string | null,
  periodEnd: string | null,
  messages: BudgetsClientMessages,
): Promise<OkPeriodPreview | ErrorResult> {
  const params = new URLSearchParams();
  if (periodStart) params.set("period_start", periodStart);
  if (periodEnd) params.set("period_end", periodEnd);
  let response: Response;
  try {
    response = await fetch(
      `/api/budgets/${encodeURIComponent(budgetId)}/period-preview?${params.toString()}`,
      {
        method: "GET",
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
  const body = (await parseJson(response)) as { excluded_lines?: unknown } | null;
  const rows = Array.isArray(body?.excluded_lines) ? body.excluded_lines : [];
  const excludedLines = rows
    .map(asPeriodChangeLine)
    .filter((line): line is PeriodChangeLine => line !== null);
  return { ok: true, excludedLines };
}
