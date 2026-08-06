import { describe, expect, it, vi, afterEach } from "vitest";

import { createList, renameList } from "./listsClient";

const messages = {
  errorGeneric: "generic",
  errorInvalidName: "invalid",
  errorForbidden: "forbidden",
  errorUnauthorized: "unauthorized",
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
});

import { saveDefaultSplit } from "./listsClient";

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
