import { afterEach, describe, expect, it, vi } from "vitest";

import {
  archiveBudget,
  budgetStateLabel,
  createBudget,
  fetchBudgets,
  periodChangeConfirmBodyFrom,
  previewPeriodChange,
  unarchiveBudget,
  updateBudget,
} from "./budgetsClient";

const messages = {
  errorGeneric: "generic",
  errorUnauthorized: "unauthorized",
  errorInvalidBudgetName: "invalid-name",
  errorInvalidBudgetCap: "invalid-cap",
  errorInvalidBudgetCurrency: "invalid-currency",
  errorInvalidBudgetSourceLists: "invalid-source-lists",
  errorInvalidBudgetPeriod: "invalid-period",
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
  period_start: null,
  period_end: null,
  created_at: "2026-08-01T00:00:00Z",
  is_archived: false,
};

const budgetItem = {
  id: "b1",
  name: "Groceries",
  cap: "500.00",
  currency: "CRC",
  spent: "0",
  state: "ok" as const,
  source_list_ids: ["l1", "l2"],
  period_start: null,
  period_end: null,
  created_at: "2026-08-01T00:00:00Z",
  is_archived: false,
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

  it("fetchBudgets requests ?archived=true when archived is true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ budgets: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchBudgets(messages, { archived: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/budgets?archived=true",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("archiveBudget posts to /api/budgets/{id}/archive", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...budgetWireRow, is_archived: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await archiveBudget("b1", messages);
    expect(result).toEqual({ ok: true, budget: { ...budgetItem, is_archived: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/budgets/b1/archive",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("unarchiveBudget posts to /api/budgets/{id}/unarchive", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => budgetWireRow,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await unarchiveBudget("b1", messages);
    expect(result).toEqual({ ok: true, budget: budgetItem });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/budgets/b1/unarchive",
      expect.objectContaining({ method: "POST" }),
    );
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

  it("createBudget maps invalid_budget_period code to its message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ code: "invalid_budget_period", detail: "bad period" }),
      }),
    );

    const result = await createBudget(
      {
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1"],
        period_start: "2026-02-01",
        period_end: "2026-01-01",
      },
      messages,
    );
    expect(result).toEqual({ ok: false, error: "invalid-period" });
  });

  it("updateBudget patches the budget and returns the updated record", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...budgetWireRow, name: "New name" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateBudget(
      "b1",
      { name: "New name", cap: "500.00", currency: "CRC", source_list_ids: ["l1", "l2"] },
      messages,
    );
    expect(result).toEqual({ ok: true, budget: { ...budgetItem, name: "New name" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/budgets/b1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("updateBudget surfaces a period-narrowing 422 as requiresConfirmation with the excluded lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          code: "period_change_requires_confirmation",
          detail: "confirm",
          excluded_lines: [
            { id: "e1", description: "Automercado", posted_date: "2026-01-05", amount_crc: "10.00" },
          ],
        }),
      }),
    );

    const result = await updateBudget(
      "b1",
      {
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        source_list_ids: ["l1"],
        period_start: "2026-01-10",
        period_end: "2026-01-31",
      },
      messages,
    );
    expect(result).toEqual({
      ok: false,
      requiresConfirmation: true,
      excludedLines: [
        { id: "e1", description: "Automercado", posted_date: "2026-01-05", amount_crc: "10.00" },
      ],
    });
  });

  it("previewPeriodChange returns the excluded lines list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        excluded_lines: [
          { id: "e1", description: "Automercado", posted_date: "2026-01-05", amount_crc: "10.00" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await previewPeriodChange("b1", "2026-01-10", "2026-01-31", messages);
    expect(result).toEqual({
      ok: true,
      excludedLines: [
        { id: "e1", description: "Automercado", posted_date: "2026-01-05", amount_crc: "10.00" },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/budgets/b1/period-preview?period_start=2026-01-10&period_end=2026-01-31",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("periodChangeConfirmBodyFrom", () => {
  const t = {
    budgetsPeriodChangeConfirmBody: "This removes 1 line.",
    budgetsPeriodChangeConfirmBodyCount: "This removes {count} lines.",
  };

  it("uses singular copy for exactly one excluded line", () => {
    const line = { id: "e1", description: "x", posted_date: "2026-01-01", amount_crc: "1.00" };
    expect(periodChangeConfirmBodyFrom([line], t)).toBe("This removes 1 line.");
  });

  it("uses plural copy with the count for multiple excluded lines", () => {
    const line = { id: "e1", description: "x", posted_date: "2026-01-01", amount_crc: "1.00" };
    expect(periodChangeConfirmBodyFrom([line, { ...line, id: "e2" }], t)).toBe(
      "This removes 2 lines.",
    );
  });
});
