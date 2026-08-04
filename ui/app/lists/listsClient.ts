/** Client helpers for list create/rename via same-origin BFF. */

export type ListItem = {
  id: string;
  name: string;
  owner_id: string;
  role: string;
};

export type ListsClientMessages = {
  errorGeneric: string;
  errorInvalidName: string;
  errorForbidden: string;
  errorUnauthorized: string;
};

type ErrorResult = { ok: false; error: string };
type OkCreate = { ok: true; list: { id: string; name: string; owner_id: string } };
type OkRename = { ok: true; list: { id: string; name: string; owner_id: string } };

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: ListsClientMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (status === 403) return messages.errorForbidden;
  if (status === 422 || code === "invalid_list_name") return messages.errorInvalidName;
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<{ detail?: unknown; code?: unknown } | null> {
  try {
    return (await response.json()) as { detail?: unknown; code?: unknown };
  } catch {
    return null;
  }
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
    return { ok: false, error: mapError(response.status, await parseJson(response), messages) };
  }
  const data = (await response.json()) as {
    id?: string;
    name?: string;
    owner_id?: string;
  };
  if (!data.id || !data.name || !data.owner_id) {
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
    return { ok: false, error: mapError(response.status, await parseJson(response), messages) };
  }
  const data = (await response.json()) as {
    id?: string;
    name?: string;
    owner_id?: string;
  };
  if (!data.id || !data.name || !data.owner_id) {
    return { ok: false, error: messages.errorGeneric };
  }
  return { ok: true, list: { id: data.id, name: data.name, owner_id: data.owner_id } };
}
