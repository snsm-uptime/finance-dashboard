/** Client helpers for list create/rename/open via same-origin BFF. */

export type ListItem = {
  id: string;
  name: string;
  owner_id: string;
  role: string;
  balance_crc?: string;
};

export type ListsClientMessages = {
  errorGeneric: string;
  errorInvalidName: string;
  errorForbidden: string;
  errorUnauthorized: string;
  errorInvalidEmail?: string;
  errorAlreadyMember?: string;
  errorSmtp?: string;
};

type ErrorResult = { ok: false; error: string };
type OkCreate = { ok: true; list: { id: string; name: string; owner_id: string } };
type OkRename = { ok: true; list: { id: string; name: string; owner_id: string } };
type OkSimple = { ok: true };

type ListPayload = {
  id?: string;
  name?: string;
  owner_id?: string;
};

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: ListsClientMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (status === 403) return messages.errorForbidden;
  if (status === 409 || code === "already_list_member") {
    return messages.errorAlreadyMember ?? messages.errorGeneric;
  }
  if (status === 422 || code === "invalid_list_name" || code === "invalid_invite_email") {
    return messages.errorInvalidEmail ?? messages.errorInvalidName;
  }
  if (status === 503 || code === "smtp_send_error" || code === "smtp_config_error") {
    return messages.errorSmtp ?? messages.errorGeneric;
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

function asListPayload(data: unknown): ListPayload | null {
  if (!data || typeof data !== "object") return null;
  return data as ListPayload;
}

export async function createList(
  name: string,
  messages: ListsClientMessages,
): Promise<OkCreate | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name }),
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
  const data = asListPayload(await parseJson(response));
  if (!data?.id || !data.name || !data.owner_id) {
    return { ok: false, error: messages.errorGeneric };
  }
  return { ok: true, list: { id: data.id, name: data.name, owner_id: data.owner_id } };
}

export async function renameList(
  listId: string,
  name: string,
  messages: ListsClientMessages,
): Promise<OkRename | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name }),
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
  const data = asListPayload(await parseJson(response));
  if (!data?.id || !data.name || !data.owner_id) {
    return { ok: false, error: messages.errorGeneric };
  }
  return { ok: true, list: { id: data.id, name: data.name, owner_id: data.owner_id } };
}

/** Persist last-opened via /auth/me (account column) after ACL on the API. */
export async function setLastOpenedList(
  listId: string,
  messages: ListsClientMessages,
): Promise<OkSimple | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ last_opened_list_id: listId }),
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
  return { ok: true };
}

export type InviteSent = {
  status: string;
  template_kind: string;
  invite_id: string;
};

type OkInvite = { ok: true; invite: InviteSent };

export async function inviteMember(
  listId: string,
  email: string,
  messages: ListsClientMessages,
): Promise<OkInvite | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
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
  const data = (await parseJson(response)) as {
    status?: string;
    template_kind?: string;
    invite_id?: string;
  } | null;
  if (!data?.status || data.status !== "sent" || !data.invite_id || !data.template_kind) {
    return { ok: false, error: messages.errorGeneric };
  }
  return {
    ok: true,
    invite: {
      status: data.status,
      template_kind: data.template_kind,
      invite_id: data.invite_id,
    },
  };
}

export function balanceTone(balanceCrc: string | undefined): "owe" | "owed" | "zero" {
  const raw = (balanceCrc ?? "0").trim();
  if (raw.startsWith("-")) return "owe";
  if (raw !== "0" && raw !== "0.00" && raw !== "") return "owed";
  return "zero";
}
