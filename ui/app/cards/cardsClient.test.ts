import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchCards, registerCard } from "./cardsClient";

const messages = {
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
  errorInvalidLabel: "invalid-label",
  errorInvalidIban: "invalid-iban",
  errorDuplicateIban: "duplicate",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cardsClient", () => {
  it("returns registered card on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: "c1",
          label: "My Visa",
          iban: "CR05",
          created_at: "2026-08-14T00:00:00Z",
        }),
      }),
    );

    const result = await registerCard("My Visa", "CR05", messages);
    expect(result).toEqual({
      ok: true,
      card: { id: "c1", label: "My Visa", iban: "CR05", created_at: "2026-08-14T00:00:00Z" },
    });
  });

  it("maps 401 to unauthorized message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Not authenticated." }),
      }),
    );

    const result = await registerCard("My Visa", "CR05", messages);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("maps invalid_card_label code to per-field message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "invalid_card_label", detail: "Enter a card label." }),
      }),
    );

    const result = await registerCard("  ", "CR05", messages);
    expect(result).toEqual({ ok: false, error: "invalid-label" });
  });

  it("maps invalid_card_iban code to per-field message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "invalid_card_iban", detail: "Enter a valid IBAN." }),
      }),
    );

    const result = await registerCard("My Visa", "  ", messages);
    expect(result).toEqual({ ok: false, error: "invalid-iban" });
  });

  it("maps 409 duplicate IBAN conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          code: "card_iban_already_registered",
          detail: "You already have a card named My Visa with this IBAN.",
        }),
      }),
    );

    const result = await registerCard("Another", "CR05", messages);
    expect(result).toEqual({ ok: false, error: "duplicate" });
  });

  it("fetchCards returns generic error when success body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    );

    const result = await fetchCards(messages);
    expect(result).toEqual({ ok: false, error: "generic" });
  });

  it("fetchCards returns list on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        cards: [
          { id: "c1", label: "My Visa", iban: "CR05", created_at: "2026-08-14T00:00:00Z" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCards(messages);
    expect(result).toEqual({
      ok: true,
      cards: [{ id: "c1", label: "My Visa", iban: "CR05", created_at: "2026-08-14T00:00:00Z" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cards",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("registerCard posts to /api/cards", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: "c1",
        label: "My Visa",
        iban: "CR05",
        created_at: "2026-08-14T00:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await registerCard("My Visa", "CR05", messages);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cards",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
