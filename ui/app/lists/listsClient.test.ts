import { describe, expect, it, vi, afterEach } from "vitest";

import { createList, inviteMember, renameList, saveDefaultSplit } from "./listsClient";

const messages = {
  errorGeneric: "generic",
  errorInvalidName: "invalid",
  errorForbidden: "forbidden",
  errorUnauthorized: "unauthorized",
  errorInvalidEmail: "bad-email",
  errorAlreadyMember: "already",
  errorSmtp: "smtp",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listsClient", () => {
  it("maps 403 on rename to forbidden message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "not_list_owner", detail: "nope" }),
      }),
    );

    const result = await renameList("list-1", "New", messages);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("returns created list on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: "a",
          name: "Household",
          owner_id: "u1",
        }),
      }),
    );

    const result = await createList("Household", messages);
    expect(result).toEqual({
      ok: true,
      list: { id: "a", name: "Household", owner_id: "u1" },
    });
  });

  it("returns generic error when success body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    );

    const result = await createList("Household", messages);
    expect(result).toEqual({ ok: false, error: "generic" });
  });

  it("inviteMember returns sent state on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        status: "sent",
        template_kind: "signup",
        invite_id: "inv-1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await inviteMember("list-1", "new@example.com", messages);
    expect(result).toEqual({
      ok: true,
      invite: {
        status: "sent",
        template_kind: "signup",
        invite_id: "inv-1",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/list-1/invites",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("inviteMember maps SMTP failure without claiming sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: "smtp_send_error", detail: "down" }),
      }),
    );

    const result = await inviteMember("list-1", "new@example.com", messages);
    expect(result).toEqual({ ok: false, error: "smtp" });
  });

  it("inviteMember maps already-member conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ code: "already_list_member" }),
      }),
    );

    const result = await inviteMember("list-1", "member@example.com", messages);
    expect(result).toEqual({ ok: false, error: "already" });
  });
});


describe("default split client", () => {
  it("maps 422 invalid_default_split to invalid message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "invalid_default_split", detail: "bad" }),
      }),
    );

    const result = await saveDefaultSplit(
      "list-1",
      { mode: "percentage", shares: [{ user_id: "a", percentage: "60" }] },
      { ...messages, errorInvalidName: "invalid-split" },
    );
    expect(result).toEqual({ ok: false, error: "invalid-split" });
  });

  it("returns split payload on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          list_id: "l1",
          owner_id: "o1",
          mode: "even",
          shares: [{ user_id: "o1", percentage: "100.00" }],
          member_ids: ["o1"],
        }),
      }),
    );

    const result = await saveDefaultSplit("l1", { mode: "even" }, messages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.split.mode).toBe("even");
      expect(result.split.shares[0]?.percentage).toBe("100.00");
    }
  });
});

describe("expense client", () => {
  it("surfaces API detail for invalid_split_override", async () => {
    const { createExpense } = await import("./listsClient");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          code: "invalid_split_override",
          detail: "Percentages must sum to exactly 100.",
        }),
      }),
    );

    const result = await createExpense(
      "list-1",
      {
        amount: "10.00",
        currency: "CRC",
        description: "X",
        payer_id: "u1",
        split_override: { kind: "percentage", percentages: { u1: "40" } },
      },
      messages,
    );
    expect(result).toEqual({
      ok: false,
      error: "Percentages must sum to exactly 100.",
    });
  });

  it("createExpense returns parsed expense on 201", async () => {
    const { createExpense } = await import("./listsClient");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: "e1",
          list_id: "l1",
          amount: "10.00",
          currency: "CRC",
          description: "Coffee",
          payer_id: "u1",
          provenance: "hand",
          line_type: "purchase",
          posted_date: "2026-08-06",
          created_at: "2026-08-06T12:00:00Z",
          amount_crc: "10.00",
          fx_rate: "1",
          fx_rate_date: "2026-08-06",
          fx_fallback: false,
        }),
      }),
    );

    const result = await createExpense(
      "l1",
      {
        amount: "10.00",
        currency: "CRC",
        description: "Coffee",
        payer_id: "u1",
      },
      messages,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expense.description).toBe("Coffee");
      expect(result.expense.provenance).toBe("hand");
    }
  });
});
