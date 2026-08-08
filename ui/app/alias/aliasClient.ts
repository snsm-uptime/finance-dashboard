/** Alias claim via the same-origin BFF (PATCH /api/auth/me). */

import type { AliasMessages } from "@/lib/i18n/alias";

export type SetAliasResult = { ok: true; alias: string } | { ok: false; error: string };

/** Local mirror of the api rules — the server stays the source of truth. */
export function normalizeAliasInput(value: string): string {
  return value.trim().toLowerCase();
}

export function aliasErrorMessage(
  status: number,
  code: string,
  messages: AliasMessages,
): string {
  // Code-first — do not treat every 409/422 as an alias conflict/format error.
  if (code === "alias_taken") return messages.errorTaken;
  if (code === "alias_already_set") return messages.errorAlreadySet;
  if (code === "invalid_alias") return messages.errorInvalid;
  if (status === 401) return messages.errorUnauthorized;
  return messages.errorGeneric;
}

export async function setAlias(
  alias: string,
  messages: AliasMessages,
  fetchImpl: typeof fetch = fetch,
): Promise<SetAliasResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ alias: normalizeAliasInput(alias) }),
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }

  const body = (await response.json().catch(() => null)) as {
    alias?: unknown;
    code?: unknown;
  } | null;

  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code : "";
    return { ok: false, error: aliasErrorMessage(response.status, code, messages) };
  }
  if (typeof body?.alias !== "string" || !body.alias) {
    return { ok: false, error: messages.errorGeneric };
  }
  return { ok: true, alias: body.alias };
}
