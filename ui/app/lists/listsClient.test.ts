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
});
