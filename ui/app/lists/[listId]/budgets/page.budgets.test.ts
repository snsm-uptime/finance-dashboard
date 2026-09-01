import { describe, expect, it } from "vitest";

import { asBudgets, budgetStateLabel } from "./page";

const stateMessages = {
  budgetsStateOk: "Under cap",
  budgetsStateNear: "Near cap",
  budgetsStateOver: "Over cap",
};

describe("asBudgets", () => {
  it("parses well-formed budgets", () => {
    expect(
      asBudgets({
        budgets: [
          {
            id: "b1",
            list_id: "l1",
            name: "Groceries",
            cap: "500.00",
            currency: "CRC",
            spent: "0",
            state: "ok",
            created_at: "2026-08-01T00:00:00Z",
          },
        ],
      }),
    ).toEqual({
      budgets: [
        {
          id: "b1",
          list_id: "l1",
          name: "Groceries",
          cap: "500.00",
          currency: "CRC",
          spent: "0",
          state: "ok",
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });
  });

  it("drops malformed rows, keeping well-formed ones", () => {
    expect(
      asBudgets({
        budgets: [
          {
            id: "b1",
            list_id: "l1",
            name: "Groceries",
            cap: "500.00",
            currency: "CRC",
            spent: "0",
            state: "ok",
            created_at: "2026-08-01T00:00:00Z",
          },
          { id: "b2", state: "bogus" },
          { bad: true },
        ],
      }).budgets,
    ).toEqual([
      {
        id: "b1",
        list_id: "l1",
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        spent: "0",
        state: "ok",
        created_at: "2026-08-01T00:00:00Z",
      },
    ]);
  });

  it("never fabricates data for absent/malformed payloads", () => {
    expect(asBudgets(null)).toEqual({ budgets: [] });
    expect(asBudgets({})).toEqual({ budgets: [] });
    expect(asBudgets({ budgets: "nope" })).toEqual({ budgets: [] });
  });
});

describe("budgetStateLabel", () => {
  it("maps ok/near/over to distinct labels", () => {
    expect(budgetStateLabel("ok", stateMessages)).toBe("Under cap");
    expect(budgetStateLabel("near", stateMessages)).toBe("Near cap");
    expect(budgetStateLabel("over", stateMessages)).toBe("Over cap");
  });
});
