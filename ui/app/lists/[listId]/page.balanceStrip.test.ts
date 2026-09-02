import { describe, expect, it } from "vitest";

import { asBalances, balanceStripPropsFrom, soloBalanceStripPropsFrom } from "./page";

const t = {
  detailSettleEmpty: "No balances yet.",
  balanceOwe: "You owe",
  balanceOwed: "You’re owed",
  balanceZero: "Settled",
  balanceTotal: "Total",
  loadError: "Could not load your lists. Refresh and try again.",
};

describe("balanceStripPropsFrom", () => {
  it("empty list (no expenses yet) is neutral with a zero amount", () => {
    expect(balanceStripPropsFrom(false, false, undefined, t)).toEqual({
      who: t.detailSettleEmpty,
      amount: "₡0",
      polarity: "neutral",
    });
  });

  it("settled / zero net with receipts present shows formatted zero", () => {
    expect(balanceStripPropsFrom(true, false, "0", t)).toEqual({
      who: t.balanceZero,
      amount: "₡0",
      polarity: "neutral",
    });
  });

  it("owe tone maps to owe polarity", () => {
    expect(balanceStripPropsFrom(true, false, "-42500", t)).toEqual({
      who: t.balanceOwe,
      amount: "₡-42,500",
      polarity: "owe",
    });
  });

  it("owed tone maps to owed polarity", () => {
    expect(balanceStripPropsFrom(true, false, "15", t)).toEqual({
      who: t.balanceOwed,
      amount: "₡15",
      polarity: "owed",
    });
  });

  it("fetch failure wins over empty/zero, never fabricates 'no balances yet'", () => {
    expect(balanceStripPropsFrom(false, true, undefined, t)).toEqual({
      who: t.loadError,
      amount: "—",
      polarity: "neutral",
    });
    expect(balanceStripPropsFrom(true, true, "0", t)).toEqual({
      who: t.loadError,
      amount: "—",
      polarity: "neutral",
    });
  });
});

describe("soloBalanceStripPropsFrom", () => {
  it("no expenses yet is neutral with a zero amount", () => {
    expect(soloBalanceStripPropsFrom([], t)).toEqual({
      who: t.detailSettleEmpty,
      amount: "₡0",
      polarity: "neutral",
    });
  });

  it("sums expense amounts into a neutral total, never owe/owed", () => {
    expect(
      soloBalanceStripPropsFrom(
        [{ amount_crc: "1000" }, { amount_crc: "2500.50" }],
        t,
      ),
    ).toEqual({
      who: t.balanceTotal,
      amount: "₡3,500.5",
      polarity: "neutral",
    });
  });
});

describe("asBalances", () => {
  it("parses balance_status.is_incomplete true", () => {
    expect(
      asBalances({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: true } }),
    ).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: true },
      you_are_owed: [],
      you_owe: [],
    });
  });

  it("parses balance_status.is_incomplete false", () => {
    expect(
      asBalances({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: false } }),
    ).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
      you_are_owed: [],
      you_owe: [],
    });
  });

  it("defaults is_incomplete to false when balance_status is absent — never fabricates true", () => {
    expect(asBalances({ list_id: "l1", balance_crc: "0" })).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
      you_are_owed: [],
      you_owe: [],
    });
  });

  it("defaults is_incomplete to false when balance_status is malformed", () => {
    expect(
      asBalances({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: "yes" } }),
    ).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
      you_are_owed: [],
      you_owe: [],
    });
    expect(asBalances({ list_id: "l1", balance_crc: "0", balance_status: null })).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
      you_are_owed: [],
      you_owe: [],
    });
  });

  it("parses you_are_owed/you_owe rows, dropping malformed entries", () => {
    expect(
      asBalances({
        list_id: "l1",
        balance_crc: "0",
        you_are_owed: [{ member_id: "m1", alias: "Alice", amount_crc: "500" }, { bad: true }],
        you_owe: [{ member_id: "m2", alias: null, amount_crc: "200" }],
      }),
    ).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
      you_are_owed: [{ member_id: "m1", alias: "Alice", amount_crc: "500" }],
      you_owe: [{ member_id: "m2", alias: null, amount_crc: "200" }],
    });
  });

  it("defaults you_are_owed/you_owe to [] when absent or malformed — never fabricates rows", () => {
    expect(asBalances({ list_id: "l1", balance_crc: "0", you_are_owed: "nope" })).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
      you_are_owed: [],
      you_owe: [],
    });
  });

  it("still rejects payloads missing balance_crc regardless of balance_status", () => {
    expect(asBalances({ list_id: "l1", balance_status: { is_incomplete: true } })).toBeNull();
  });
});
