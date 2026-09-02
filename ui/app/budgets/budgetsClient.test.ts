import { afterEach, describe, expect, it, vi } from "vitest";

import { budgetStateLabel, createBudget, fetchBudgets } from "./budgetsClient";

const messages = {
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
  errorInvalidBudgetName: "invalid-name",
  errorInvalidBudgetCap: "invalid-cap",
  errorInvalidBudgetCurrency: "invalid-currency",
  errorInvalidBudgetSourceLists: "invalid-source-lists",
  errorForbidden: "forbidden",
};

const stateMessages = {
  budgetsStateOk: "Under cap",
  budgetsStateNear: "Near cap",
  budgetsStateOver: "Over cap",
};

// Wire shape: API/BFF responses use `source_lists`, not `source_list_ids`.
const budgetWireRow = {
  id: "b1",
  name: "Groceries",
  cap: "500.00",
  currency: "CRC",
  spent: "0",
  state: "ok" as const,
  source_lists: ["l1", "l2"],
  created_at: "2026-08-01T00:00:00Z",
};

const budgetItem = {
  id: "b1",
  name: "Groceries",
  cap: "500.00",
  currency: "CRC",
  spent: "0",
  state: "ok" as const,
  source_list_ids: ["l1", "l2"],
  created_at: "2026-08-01T00:00:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("budgetStateLabel", () => {
  it("maps ok/near/over to distinct labels", () => {
    expect(budgetStateLabel("ok", stateMessages)).toBe("Under cap");
    expect(budgetStateLabel("near", stateMessages)).toBe("Near cap");
    expect(budgetStateLabel("over", stateMessages)).toBe("Over cap");
  });
});

describe("budgetsClient", () => {
  it("fetchBudgets returns the list, mapping wire source_lists to source_list_ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ budgets: [budgetWireRow] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBudgets(messages);
    expect(result).toEqual({ ok: true, budgets: [budgetItem] });
    expect(fetchMock).toHaveBeenCalledWith("/api/budgets", expect.objectContaining({ method: "GET" }));
  });

  it("fetchBudgets drops rows with a malformed or missing source_lists shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          budgets: [
            budgetWireRow,
            { ...budgetWireRow, id: "b2", source_lists: "not-an-array" },
            { ...budgetWireRow, id: "b3", source_lists: undefined },
            { bad: true },
          ],
        }),
      }),
    );

    const result = await fetchBudgets(messages);
    expect(result).toEqual({ ok: true, budgets: [budgetItem] });
  });

  it("fetchBudgets maps 401 to unauthorized message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Not authenticated." }),
      }),
    );

    const result = await fetchBudgets(messages);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("createBudget posts to /api/budgets with source_list_ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => budgetWireRow,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createBudget(
      { name: "Groceries", cap: "500.00", currency: "CRC", source_list_ids: ["l1", "l2"] },
      messages,
    );
    expect(result).toEqual({ ok: true, budget: budgetItem });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/budgets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Groceries",
          cap: "500.00",
          currency: "CRC",
          source_list_ids: ["l1", "l2"],
        }),
      }),
    );
  });

  it("createBudget maps invalid_budget_source_lists code to its message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          code: "invalid_budget_source_lists",
          detail: "Select at least one source list.",
        }),
      }),
    );

    const result = await createBudget(
      { name: "Groceries", cap: "500.00", currency: "CRC", source_list_ids: [] },
      messages,
    );
    expect(result).toEqual({ ok: false, error: "invalid-source-lists" });
  });

  it("createBudget maps 403 not_list_member to forbidden message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: "not_list_member", detail: "Not a member." }),
      }),
    );

    const result = await createBudget(
      { name: "Groceries", cap: "500.00", currency: "CRC", source_list_ids: ["other"] },
      messages,
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});
