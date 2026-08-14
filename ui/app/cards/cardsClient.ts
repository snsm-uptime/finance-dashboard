/** Client helpers for card register/list via same-origin BFF. */

export type CardItem = {
  id: string;
  label: string;
  iban: string;
  created_at: string;
};

export type CardsClientMessages = {
  errorGeneric: string;
  errorUnauthorized: string;
  errorInvalidLabel: string;
  errorInvalidIban: string;
  errorDuplicateIban: string;
};

type ErrorResult = { ok: false; error: string };
type OkCards = { ok: true; cards: CardItem[] };
type OkCard = { ok: true; card: CardItem };

function mapError(
  status: number,
  body: { detail?: unknown; code?: unknown } | null,
  messages: CardsClientMessages,
): string {
  const code = typeof body?.code === "string" ? body.code : "";
  if (status === 401) return messages.errorUnauthorized;
  if (status === 409 || code === "card_iban_already_registered") {
    return messages.errorDuplicateIban;
  }
  if (code === "invalid_card_label") return messages.errorInvalidLabel;
  if (code === "invalid_card_iban") return messages.errorInvalidIban;
  return messages.errorGeneric;
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asCard(data: unknown): CardItem | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<CardItem>;
  if (
    typeof row.id !== "string" ||
    typeof row.label !== "string" ||
    typeof row.iban !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return { id: row.id, label: row.label, iban: row.iban, created_at: row.created_at };
}

export async function fetchCards(
  messages: CardsClientMessages,
): Promise<OkCards | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/cards", {
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
  const data = (await parseJson(response)) as { cards?: unknown } | null;
  if (!data || !Array.isArray(data.cards)) {
    return { ok: false, error: messages.errorGeneric };
  }
  const cards: CardItem[] = [];
  for (const row of data.cards) {
    const parsed = asCard(row);
    if (!parsed) return { ok: false, error: messages.errorGeneric };
    cards.push(parsed);
  }
  return { ok: true, cards };
}

export async function registerCard(
  label: string,
  iban: string,
  messages: CardsClientMessages,
): Promise<OkCard | ErrorResult> {
  let response: Response;
  try {
    response = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ label, iban }),
    });
  } catch {
    return { ok: false, error: messages.errorGeneric };
  }
  if (!response.ok) {
    const body = (await parseJson(response)) as { detail?: unknown; code?: unknown } | null;
    return { ok: false, error: mapError(response.status, body, messages) };
  }
  const card = asCard(await parseJson(response));
  if (!card) return { ok: false, error: messages.errorGeneric };
  return { ok: true, card };
}
