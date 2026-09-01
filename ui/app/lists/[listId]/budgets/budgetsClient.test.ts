import { afterEach, describe, expect, it, vi } from "vitest";

import { budgetStateLabel, createBudget, fetchBudgets } from "./budgetsClient";

const messages = {
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
  errorInvalidBudgetName: "invalid-name",
  errorInvalidBudgetCap: "invalid-cap",
  errorInvalidBudgetCurrency: "invalid-currency",
};

const stateMessages = {
  budgetsStateOk: "Under cap",
  budgetsStateNear: "Near cap",
  budgetsStateOver: "Over cap",
};

const budgetRow = {
  id: "b1",
  list_id: "l1",
  name: "Groceries",
  cap: "500.00",
  currency: "CRC",
  spent: "0",
  state: "ok" as const,
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
  it("fetchBudgets returns the list on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ budgets: [budgetRow] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBudgets("l1", messages);
    expect(result).toEqual({ ok: true, budgets: [budgetRow] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/l1/budgets",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchBudgets drops malformed rows, keeping well-formed ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          budgets: [budgetRow, { id: "b2", state: "bogus" }, { bad: true }],
        }),
      }),
    );

    const result = await fetchBudgets("l1", messages);
    expect(result).toEqual({ ok: true, budgets: [budgetRow] });
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

    const result = await fetchBudgets("l1", messages);
    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("createBudget posts to /api/lists/{id}/budgets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => budgetRow,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createBudget(
      "l1",
      { name: "Groceries", cap: "500.00", currency: "CRC" },
      messages,
    );
    expect(result).toEqual({ ok: true, budget: budgetRow });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists/l1/budgets",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("createBudget maps invalid_budget_cap code to per-field message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "invalid_budget_cap", detail: "Enter a valid cap." }),
      }),
    );

    const result = await createBudget(
      "l1",
      { name: "Groceries", cap: "", currency: "CRC" },
      messages,
    );
    expect(result).toEqual({ ok: false, error: "invalid-cap" });
  });
});
