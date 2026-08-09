import { describe, expect, it } from "vitest";

import { balanceStripPropsFrom } from "./page";

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
