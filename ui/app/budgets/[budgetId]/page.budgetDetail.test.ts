import { describe, expect, it } from "vitest";

import { asBudgetDetail, historyRowAttribution, resolveSourceListChips } from "./page";

describe("asBudgetDetail", () => {
  it("parses a well-formed response with empty history and rules", () => {
    expect(
      asBudgetDetail({
        id: "b1",
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        spent: "0",
        state: "ok",
        source_lists: ["l1"],
        created_at: "2026-08-01T00:00:00Z",
        history: [],
        rules: [],
      }),
    ).toEqual({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      source_list_ids: ["l1"],
      created_at: "2026-08-01T00:00:00Z",
      history: [],
      rules: [],
    });
  });

  it("parses a well-formed response with structured history and rules", () => {
    const parsed = asBudgetDetail({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "10.00",
      state: "ok",
      source_lists: ["l1", "l2"],
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
    expect(parsed?.source_list_ids).toEqual(["l1", "l2"]);
  });

  it("defaults a missing/malformed rules array to empty rather than fabricating rows", () => {
    const withoutRules = asBudgetDetail({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      source_lists: ["l1"],
      created_at: "2026-08-01T00:00:00Z",
    });
    expect(withoutRules?.rules).toEqual([]);

    const malformedRules = asBudgetDetail({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      source_lists: ["l1"],
      created_at: "2026-08-01T00:00:00Z",
      rules: "not-an-array",
    });
    expect(malformedRules?.rules).toEqual([]);
  });

  it("drops a malformed individual rule row rather than fabricating fields", () => {
    const parsed = asBudgetDetail({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      source_lists: ["l1"],
      created_at: "2026-08-01T00:00:00Z",
      rules: [
        { id: "r1", match_text: "automercado", created_at: "2026-08-01T00:00:00Z" },
        // Missing created_at — dropped, not defaulted to a fabricated value.
        { id: "r2", match_text: "uber" },
      ],
    });

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
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        spent: "0",
        state: "bogus",
        source_lists: ["l1"],
        created_at: "2026-08-01T00:00:00Z",
        history: [],
      }),
    ).toBeNull();
  });

  it("requires source_lists to be an array of strings", () => {
    expect(
      asBudgetDetail({
        id: "b1",
        name: "Groceries",
        cap: "500.00",
        currency: "CRC",
        spent: "0",
        state: "ok",
        source_lists: "not-an-array",
        created_at: "2026-08-01T00:00:00Z",
      }),
    ).toBeNull();
  });

  it("defaults a missing/malformed history to an empty array rather than fabricating rows", () => {
    const withoutHistory = asBudgetDetail({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      source_lists: ["l1"],
      created_at: "2026-08-01T00:00:00Z",
    });
    expect(withoutHistory?.history).toEqual([]);

    const malformedHistory = asBudgetDetail({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "0",
      state: "ok",
      source_lists: ["l1"],
      created_at: "2026-08-01T00:00:00Z",
      history: "not-an-array",
    });
    expect(malformedHistory?.history).toEqual([]);
  });

  it("drops a malformed history line rather than fabricating fields", () => {
    const parsed = asBudgetDetail({
      id: "b1",
      name: "Groceries",
      cap: "500.00",
      currency: "CRC",
      spent: "10.00",
      state: "ok",
      source_lists: ["l1"],
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
});

describe("historyRowAttribution", () => {
  it("a rule-attributed line renders the rule label and no unassign control", () => {
    expect(
      historyRowAttribution({
        id: "e1",
        description: "Automercado",
        posted_date: "2026-08-10",
        amount_crc: "10.00",
        attributed_via: "rule",
      }),
    ).toEqual({ viaLabelKey: "budgetsHistoryViaRule", showUnassign: false });
  });

  it("a manually-attributed line renders the manual label and does show an unassign control", () => {
    expect(
      historyRowAttribution({
        id: "e1",
        description: "Automercado",
        posted_date: "2026-08-10",
        amount_crc: "10.00",
        attributed_via: "manual",
      }),
    ).toEqual({ viaLabelKey: "budgetsHistoryViaManual", showUnassign: true });
  });
});

describe("resolveSourceListChips", () => {
  it("matches source-list ids against the caller's lists in order", () => {
    expect(
      resolveSourceListChips(
        ["l1", "l2"],
        [
          { id: "l1", name: "Groceries" },
          { id: "l2", name: "Trips" },
        ],
      ),
    ).toEqual([
      { id: "l1", name: "Groceries" },
      { id: "l2", name: "Trips" },
    ]);
  });

  it("silently skips a stale/deleted source list id rather than crashing", () => {
    expect(
      resolveSourceListChips(
        ["l1", "l-deleted"],
        [{ id: "l1", name: "Groceries" }],
      ),
    ).toEqual([{ id: "l1", name: "Groceries" }]);
  });

  it("returns an empty array when no source lists match", () => {
    expect(resolveSourceListChips(["l-deleted"], [])).toEqual([]);
  });
});
