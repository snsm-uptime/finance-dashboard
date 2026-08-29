import { describe, expect, it } from "vitest";

import { asBalances, balanceStripPropsFrom } from "./page";

const t = {
  detailSettleEmpty: "No balances yet.",
  balanceOwe: "You owe",
  balanceOwed: "You’re owed",
  balanceZero: "Settled",
  loadError: "Could not load your lists. Refresh and try again.",
};

describe("balanceStripPropsFrom", () => {
  it("empty list (no expenses yet) is neutral with no amount", () => {
    expect(balanceStripPropsFrom(false, false, undefined, t)).toEqual({
      who: t.detailSettleEmpty,
      amount: "—",
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

describe("asBalances", () => {
  it("parses balance_status.is_incomplete true", () => {
    expect(
      asBalances({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: true } }),
    ).toEqual({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: true } });
  });

  it("parses balance_status.is_incomplete false", () => {
    expect(
      asBalances({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: false } }),
    ).toEqual({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: false } });
  });

  it("defaults is_incomplete to false when balance_status is absent — never fabricates true", () => {
    expect(asBalances({ list_id: "l1", balance_crc: "0" })).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
    });
  });

  it("defaults is_incomplete to false when balance_status is malformed", () => {
    expect(
      asBalances({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: "yes" } }),
    ).toEqual({ list_id: "l1", balance_crc: "0", balance_status: { is_incomplete: false } });
    expect(asBalances({ list_id: "l1", balance_crc: "0", balance_status: null })).toEqual({
      list_id: "l1",
      balance_crc: "0",
      balance_status: { is_incomplete: false },
    });
  });

  it("still rejects payloads missing balance_crc regardless of balance_status", () => {
    expect(asBalances({ list_id: "l1", balance_status: { is_incomplete: true } })).toBeNull();
  });
});
