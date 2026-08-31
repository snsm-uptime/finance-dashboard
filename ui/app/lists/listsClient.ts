/** Client helpers for list create/rename/open via same-origin BFF. */

import {
  patchMembershipLists,
  replaceMembershipLists,
} from "./membershipListsStore";

export type ListMember = {
  user_id: string;
  /** Null only while a member has not passed the alias gate yet. */
  alias: string | null;
};

/**
 * Person label for rosters and pickers. Email is an identity surface and is
 * never a label, so a member still missing an alias falls back to a short id.
 */
export function memberLabel(member: ListMember): string {
  return member.alias ?? `${member.user_id.slice(0, 8)}…`;
}

export type ListItem = {
  id: string;
  name: string;
  owner_id: string;
  role: string;
  balance_crc?: string;
  /** Running total for solo (1-member) lists — balance_crc is always "0" there. */
  total_crc?: string;
  members?: ListMember[];
};

export type ListsClientMessages = {
  errorGeneric: string;
  errorInvalidName: string;
  errorForbidden: string;
  errorUnauthorized: string;
  errorInvalidEmail?: string;
  errorAlreadyMember?: string;
  errorSmtp?: string;
  errorReassignSplit?: string;
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

type OkLists = { ok: true; lists: ListItem[] };

export async function fetchLists(
  messages: ListsClientMessages,
): Promise<OkLists | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/lists", {
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
  const data = (await parseJson(response)) as { lists?: unknown } | null;
  if (!data || !Array.isArray(data.lists)) {
    return { ok: false, error: messages.errorGeneric };
  }
  const lists = data.lists as ListItem[];
  replaceMembershipLists(lists);
  return { ok: true, lists };
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
  const list = { id: data.id, name: data.name, owner_id: data.owner_id };
  patchMembershipLists((prev) => {
    if (prev.some((item) => item.id === list.id)) return prev;
    return [
      ...prev,
      {
        id: list.id,
        name: list.name,
        owner_id: list.owner_id,
        role: "owner",
        balance_crc: "0",
        total_crc: "0",
      },
    ];
  });
  return { ok: true, list };
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
  const list = { id: data.id, name: data.name, owner_id: data.owner_id };
  patchMembershipLists((prev) =>
    prev.map((item) => (item.id === list.id ? { ...item, name: list.name } : item)),
  );
  return { ok: true, list };
}

export async function deleteList(
  listId: string,
  messages: ListsClientMessages,
): Promise<OkSimple | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}`, {
      method: "DELETE",
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
  patchMembershipLists((prev) => prev.filter((item) => item.id !== listId));
  return { ok: true };
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

/** Persist default review-routing destination via /auth/me (account column, Story 4.3). */
export async function setDefaultImportList(
  listId: string,
  messages: ListsClientMessages,
): Promise<OkSimple | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ default_import_list_id: listId }),
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

/** Absolute CRC amount for card copy (“You owe ₡12.50”). */
export function formatCardBalance(balanceCrc: string | undefined): string {
  const parsed = Number((balanceCrc ?? "0").trim());
  const abs = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  const digits = abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `₡${digits}`;
}

export type DefaultSplitShare = {
  user_id: string;
  percentage: string;
};

export type DefaultSplitPayload = {
  list_id: string;
  owner_id: string;
  mode: "even" | "percentage";
  shares: DefaultSplitShare[];
  member_ids: string[];
};

type OkDefaultSplit = { ok: true; split: DefaultSplitPayload };

function asDefaultSplit(data: unknown): DefaultSplitPayload | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<DefaultSplitPayload>;
  if (
    typeof row.list_id !== "string" ||
    typeof row.owner_id !== "string" ||
    (row.mode !== "even" && row.mode !== "percentage") ||
    !Array.isArray(row.shares) ||
    !Array.isArray(row.member_ids)
  ) {
    return null;
  }
  return {
    list_id: row.list_id,
    owner_id: row.owner_id,
    mode: row.mode,
    shares: row.shares as DefaultSplitShare[],
    member_ids: row.member_ids as string[],
  };
}

export async function fetchDefaultSplit(
  listId: string,
  messages: ListsClientMessages,
): Promise<OkDefaultSplit | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/default-split`, {
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
  const data = asDefaultSplit(await parseJson(response));
  if (!data) return { ok: false, error: messages.errorGeneric };
  return { ok: true, split: data };
}

export async function saveDefaultSplit(
  listId: string,
  body: { mode: "even" } | { mode: "percentage"; shares: DefaultSplitShare[] },
  messages: ListsClientMessages & { errorInvalidName?: string },
): Promise<OkDefaultSplit | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/default-split`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
    const code = typeof parsed?.code === "string" ? parsed.code : "";
    if (response.status === 422 || code === "invalid_default_split") {
      return {
        ok: false,
        error: messages.errorInvalidName ?? messages.errorGeneric,
      };
    }
    return { ok: false, error: mapError(response.status, parsed, messages) };
  }
  const data = asDefaultSplit(await parseJson(response));
  if (!data) return { ok: false, error: messages.errorGeneric };
  return { ok: true, split: data };
}


export type ExpenseItem = {
  id: string;
  list_id: string;
  amount: string;
  currency: string;
  description: string;
  payer_id: string;
  provenance: string;
  line_type: string;
  posted_date: string;
  created_at: string;
  /** FX materialized at commit (Story 3.5) — CRC rows have amount_crc === amount. */
  amount_crc: string;
  fx_rate: string;
  fx_rate_date: string | null;
  fx_fallback: boolean;
  /** Origin (card / Cash / blank) — Story 4.2. */
  origin_kind: string | null;
  origin_card_id: string | null;
  origin_card_label: string | null;
  viewer_share_kind: "percentage" | "absolute" | null;
  viewer_share_value: string | null;
  viewer_net_crc: string | null;
  viewer_net_polarity: "owe" | "owed" | "zero" | null;
  import_batch_id: string | null;
  statement_id: string | null;
};

export type CreateExpenseBody = {
  amount: string;
  currency: string;
  description: string;
  payer_id: string;
  split_override?: {
    kind: "whole_assignee" | "absolute_amounts" | "percentage";
    assignee_id?: string;
    amounts?: Record<string, string>;
    percentages?: Record<string, string>;
  };
  origin_kind?: "card" | "cash" | null;
  origin_card_id?: string | null;
};

type OkExpense = { ok: true; expense: ExpenseItem };
type OkExpenses = { ok: true; expenses: ExpenseItem[] };
type OkMembers = { ok: true; members: ListMember[] };

function detailOrMapped(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: ListsClientMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (
    status === 422 &&
    (code === "invalid_split_override" ||
      code === "invalid_manual_expense" ||
      typeof body?.detail === "string")
  ) {
    if (typeof body?.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
  }
  return mapError(status, body, messages);
}

function asExpense(data: unknown): ExpenseItem | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<ExpenseItem>;
  if (
    typeof row.id !== "string" ||
    typeof row.list_id !== "string" ||
    typeof row.amount !== "string" ||
    typeof row.currency !== "string" ||
    typeof row.description !== "string" ||
    typeof row.payer_id !== "string" ||
    typeof row.provenance !== "string" ||
    typeof row.line_type !== "string" ||
    typeof row.posted_date !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.amount_crc !== "string" ||
    typeof row.fx_rate !== "string"
  ) {
    return null;
  }
  return {
    ...(row as ExpenseItem),
    fx_rate_date: typeof row.fx_rate_date === "string" ? row.fx_rate_date : null,
    fx_fallback: row.fx_fallback === true,
    origin_kind: typeof row.origin_kind === "string" ? row.origin_kind : null,
    origin_card_id: typeof row.origin_card_id === "string" ? row.origin_card_id : null,
    origin_card_label: typeof row.origin_card_label === "string" ? row.origin_card_label : null,
    viewer_share_kind:
      row.viewer_share_kind === "percentage" || row.viewer_share_kind === "absolute"
        ? row.viewer_share_kind
        : null,
    viewer_share_value: typeof row.viewer_share_value === "string" ? row.viewer_share_value : null,
    viewer_net_crc: typeof row.viewer_net_crc === "string" ? row.viewer_net_crc : null,
    viewer_net_polarity:
      row.viewer_net_polarity === "owe" ||
      row.viewer_net_polarity === "owed" ||
      row.viewer_net_polarity === "zero"
        ? row.viewer_net_polarity
        : null,
    import_batch_id: typeof row.import_batch_id === "string" ? row.import_batch_id : null,
    statement_id: typeof row.statement_id === "string" ? row.statement_id : null,
  };
}

export async function fetchExpenses(
  listId: string,
  messages: ListsClientMessages,
): Promise<OkExpenses | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/expenses`, {
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
  const data = (await parseJson(response)) as { expenses?: unknown } | null;
  if (!data || !Array.isArray(data.expenses)) {
    return { ok: false, error: messages.errorGeneric };
  }
  const expenses: ExpenseItem[] = [];
  for (const row of data.expenses) {
    const parsed = asExpense(row);
    if (!parsed) return { ok: false, error: messages.errorGeneric };
    expenses.push(parsed);
  }
  return { ok: true, expenses };
}

export async function createExpense(
  listId: string,
  body: CreateExpenseBody,
  messages: ListsClientMessages,
): Promise<OkExpense | ErrorResult> {
  const payload = {
    amount: body.amount,
    currency: body.currency,
    description: body.description,
    payer_id: body.payer_id,
    ...(body.split_override ? { split_override: body.split_override } : {}),
    ...(body.origin_kind !== undefined ? { origin_kind: body.origin_kind } : {}),
    ...(body.origin_card_id !== undefined ? { origin_card_id: body.origin_card_id } : {}),
  };
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as {
      detail?: unknown;
      code?: unknown;
    } | null;
    return { ok: false, error: detailOrMapped(response.status, parsed, messages) };
  }
  const expense = asExpense(await parseJson(response));
  if (!expense) return { ok: false, error: messages.errorGeneric };
  return { ok: true, expense };
}

export async function updateExpenseOrigin(
  listId: string,
  entryId: string,
  origin: { origin_kind: "card" | "cash" | null; origin_card_id: string | null },
  messages: ListsClientMessages,
): Promise<OkExpense | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/expenses/${encodeURIComponent(entryId)}/origin`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(origin),
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const parsed = (await parseJson(response)) as {
      detail?: unknown;
      code?: unknown;
    } | null;
    return { ok: false, error: detailOrMapped(response.status, parsed, messages) };
  }
  const expense = asExpense(await parseJson(response));
  if (!expense) return { ok: false, error: messages.errorGeneric };
  return { ok: true, expense };
}

export async function fetchListMembers(
  listId: string,
  messages: ListsClientMessages,
): Promise<OkMembers | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(`/api/lists/${encodeURIComponent(listId)}/members`, {
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
  const data = (await parseJson(response)) as { members?: unknown } | null;
  if (!data || !Array.isArray(data.members)) {
    return { ok: false, error: messages.errorGeneric };
  }
  const members: ListMember[] = [];
  for (const row of data.members) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: messages.errorGeneric };
    }
    const m = row as { user_id?: unknown; alias?: unknown };
    if (typeof m.user_id !== "string") {
      return { ok: false, error: messages.errorGeneric };
    }
    members.push({
      user_id: m.user_id,
      alias: typeof m.alias === "string" && m.alias ? m.alias : null,
    });
  }
  return { ok: true, members };
}

export async function reassignStatement(
  listId: string,
  statementId: string,
  destinationListId: string,
  messages: ListsClientMessages,
): Promise<OkSimple | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/statements/${encodeURIComponent(statementId)}/reassign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ destination_list_id: destinationListId }),
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code : "";
    if (response.status === 409 && code === "invalid_split_override") {
      return { ok: false, error: messages.errorReassignSplit ?? messages.errorGeneric };
    }
    return { ok: false, error: mapError(response.status, body, messages) };
  }
  return { ok: true };
}

export async function rollbackImportBatch(
  listId: string,
  batchId: string,
  messages: ListsClientMessages,
): Promise<OkSimple | ErrorResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/lists/${encodeURIComponent(listId)}/import-batches/${encodeURIComponent(batchId)}`,
      {
        method: "DELETE",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      },
    );
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (response.status === 204 || response.ok) {
    return { ok: true };
  }
  const parsed = (await parseJson(response)) as {
    detail?: unknown;
    code?: unknown;
  } | null;
  return { ok: false, error: mapError(response.status, parsed, messages) };
}
