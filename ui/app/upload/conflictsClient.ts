/** Client helpers for same-price conflict review via same-origin BFF (Story 5.5). */

export type ConflictEntry = {
  entry_id: string;
  list_id: string;
  list_name: string;
  amount: string;
  currency: string;
  normalized_description: string;
  posted_date: string;
};

export type SamePriceConflict = {
  id: string;
  manual: ConflictEntry;
  parsed: ConflictEntry;
  detected_at: string;
};

export type ConflictResolution = "manual_survivor" | "parsed_survivor" | "not_same_expense";

export type ConflictMessages = {
  errorUnauthorized: string;
  errorForbidden: string;
  errorNotFound: string;
  errorAlreadyResolved: string;
  errorConfirmRequired: string;
  errorGeneric: string;
};

type ErrorResult = { ok: false; error: string };
type OkQueue = { ok: true; conflicts: SamePriceConflict[] };
type OkResolve = { ok: true };

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: ConflictMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (status === 403 || code === "not_list_member") return messages.errorForbidden;
  if (status === 404 || code === "same_price_conflict_not_found") return messages.errorNotFound;
  if (status === 409 || code === "same_price_conflict_already_resolved") {
    return messages.errorAlreadyResolved;
  }
  if (status === 422 || code === "same_price_conflict_confirm_required") {
    return messages.errorConfirmRequired;
  }
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asConflictEntry(data: unknown): ConflictEntry | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<ConflictEntry>;
  if (
    typeof row.entry_id !== "string" ||
    typeof row.list_id !== "string" ||
    typeof row.list_name !== "string" ||
    typeof row.amount !== "string" ||
    typeof row.currency !== "string" ||
    typeof row.normalized_description !== "string" ||
    typeof row.posted_date !== "string"
  ) {
    return null;
  }
  return {
    entry_id: row.entry_id,
    list_id: row.list_id,
    list_name: row.list_name,
    amount: row.amount,
    currency: row.currency,
    normalized_description: row.normalized_description,
    posted_date: row.posted_date,
  };
}

function asConflict(data: unknown): SamePriceConflict | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<SamePriceConflict>;
  if (typeof row.id !== "string" || typeof row.detected_at !== "string") return null;
  const manual = asConflictEntry(row.manual);
  const parsed = asConflictEntry(row.parsed);
  if (!manual || !parsed) return null;
  return { id: row.id, manual, parsed, detected_at: row.detected_at };
}

/** GET the acting user's full unresolved conflict queue (AC #4). */
export async function fetchConflictQueue(
  messages: ConflictMessages,
): Promise<OkQueue | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/import-conflicts", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
  if (!response.ok) {
    return { ok: false, error: mapError(response.status, body, messages) };
  }
  const conflictsRaw = (body as { conflicts?: unknown } | null)?.conflicts;
  const conflicts: SamePriceConflict[] = [];
  if (Array.isArray(conflictsRaw)) {
    for (const item of conflictsRaw) {
      const parsed = asConflict(item);
      if (parsed) conflicts.push(parsed);
    }
  }
  return { ok: true, conflicts };
}

const SILENT_MESSAGES: ConflictMessages = {
  errorUnauthorized: "",
  errorForbidden: "",
  errorNotFound: "",
  errorAlreadyResolved: "",
  errorConfirmRequired: "",
  errorGeneric: "",
};

/**
 * Post-finalize/commit landing router (Story 5.5, UX-DR22): checks the
 * conflict queue and routes to conflict review first when it has a conflict
 * touching the session's landing list — never lands on the list/strip and
 * then interrupts. Scoped to the landing list (rather than the actor's
 * entire global queue) so a stale unrelated conflict elsewhere in the
 * account doesn't detour every future import (regression guard: most
 * imports have zero conflicts and must not gain a detour). On a queue-check
 * failure, fails open and lands on the list rather than blocking on a fetch
 * this navigation didn't originally depend on.
 */
export async function routeAfterImportLanding(
  router: { push: (href: string) => void },
  landingListId: string | null,
): Promise<void> {
  const result = await fetchConflictQueue(SILENT_MESSAGES);
  const touchesLanding = (conflict: SamePriceConflict) =>
    landingListId !== null &&
    (conflict.manual.list_id === landingListId || conflict.parsed.list_id === landingListId);
  if (result.ok && result.conflicts.some(touchesLanding)) {
    const query = landingListId ? `?landingListId=${encodeURIComponent(landingListId)}` : "";
    router.push(`/upload/conflicts${query}`);
    return;
  }
  router.push(landingListId ? `/lists/${encodeURIComponent(landingListId)}` : "/lists");
}

/** POST the pick for one collision — one survivor, or the harder confirmed escape. */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
  confirmed: boolean,
  messages: ConflictMessages,
): Promise<OkResolve | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/import-conflicts/${encodeURIComponent(conflictId)}/resolve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ resolution, confirmed }),
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (response.status === 204) return { ok: true };
  const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
  return { ok: false, error: mapError(response.status, body, messages) };
}
