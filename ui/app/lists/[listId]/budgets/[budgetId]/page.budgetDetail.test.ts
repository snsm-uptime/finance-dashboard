import { describe, expect, it } from "vitest";

import { asBudgetDetail } from "./page";

describe("asBudgetDetail", () => {
  it("parses a well-formed response with an empty history", () => {
    expect(
      asBudgetDetail({
        id: "b1",
        list_id: "l1",
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        spent: "0",
        state: "ok",
        created_at: "2026-08-01T00:00:00Z",
        history: [],
      }),
    ).toEqual({
      id: "b1",
      list_id: "l1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      created_at: "2026-08-01T00:00:00Z",
      history: [],
    });
  });

  it("drops/defaults missing or malformed fields, never fabricates data", () => {
    expect(asBudgetDetail(null)).toBeNull();
    expect(asBudgetDetail({})).toBeNull();
    expect(
      asBudgetDetail({
        id: "b1",
        list_id: "l1",
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        spent: "0",
        state: "bogus",
        created_at: "2026-08-01T00:00:00Z",
        history: [],
      }),
    ).toBeNull();
  });

  it("defaults a missing/malformed history to an empty array rather than fabricating rows", () => {
    const withoutHistory = asBudgetDetail({
      id: "b1",
      list_id: "l1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      created_at: "2026-08-01T00:00:00Z",
    });
    expect(withoutHistory?.history).toEqual([]);

    const malformedHistory = asBudgetDetail({
      id: "b1",
      list_id: "l1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      created_at: "2026-08-01T00:00:00Z",
      history: "not-an-array",
    });
    expect(malformedHistory?.history).toEqual([]);
  });
});
