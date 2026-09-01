import { describe, expect, it } from "vitest";

import { asBudgetDetail } from "./page";

describe("asBudgetDetail", () => {
  it("parses a well-formed response with empty history and rules", () => {
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
        rules: [],
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
      rules: [],
    });
  });

  it("parses a well-formed response with structured history and rules", () => {
    const parsed = asBudgetDetail({
      id: "b1",
      list_id: "l1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "10.00",
      state: "ok",
      created_at: "2026-08-01T00:00:00Z",
      history: [
        {
          id: "e1",
          description: "Automercado",
          posted_date: "2026-08-10",
          amount_crc: "10.00",
          attributed_via: "manual",
        },
      ],
      rules: [{ id: "r1", match_text: "automercado", created_at: "2026-08-01T00:00:00Z" }],
    });

    expect(parsed?.history).toEqual([
      {
        id: "e1",
        description: "Automercado",
        posted_date: "2026-08-10",
        amount_crc: "10.00",
        attributed_via: "manual",
      },
    ]);
    expect(parsed?.rules).toEqual([
      { id: "r1", match_text: "automercado", created_at: "2026-08-01T00:00:00Z" },
    ]);
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
        rules: [],
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
    expect(withoutHistory?.rules).toEqual([]);

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
      rules: "not-an-array",
    });
    expect(malformedHistory?.history).toEqual([]);
    expect(malformedHistory?.rules).toEqual([]);
  });

  it("drops a malformed history line rather than fabricating fields", () => {
    const parsed = asBudgetDetail({
      id: "b1",
      list_id: "l1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "10.00",
      state: "ok",
      created_at: "2026-08-01T00:00:00Z",
      history: [
        {
          id: "e1",
          description: "Automercado",
          posted_date: "2026-08-10",
          amount_crc: "10.00",
          attributed_via: "manual",
        },
        // Missing amount_crc — dropped, not defaulted to a fabricated value.
        {
          id: "e2",
          description: "Bad row",
          posted_date: "2026-08-11",
          attributed_via: "rule",
        },
        // Invalid attributed_via — dropped.
        {
          id: "e3",
          description: "Bogus via",
          posted_date: "2026-08-12",
          amount_crc: "5.00",
          attributed_via: "bogus",
        },
      ],
      rules: [],
    });

    expect(parsed?.history).toEqual([
      {
        id: "e1",
        description: "Automercado",
        posted_date: "2026-08-10",
        amount_crc: "10.00",
        attributed_via: "manual",
      },
    ]);
  });

  it("drops a malformed rule rather than fabricating fields", () => {
    const parsed = asBudgetDetail({
      id: "b1",
      list_id: "l1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      created_at: "2026-08-01T00:00:00Z",
      history: [],
      rules: [
        { id: "r1", match_text: "automercado", created_at: "2026-08-01T00:00:00Z" },
        // Missing created_at — dropped.
        { id: "r2", match_text: "walmart" },
      ],
    });

    expect(parsed?.rules).toEqual([
      { id: "r1", match_text: "automercado", created_at: "2026-08-01T00:00:00Z" },
    ]);
  });
});
