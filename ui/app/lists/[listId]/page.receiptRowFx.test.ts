import { describe, expect, it } from "vitest";

import type { ExpenseItem } from "../listsClient";
import { receiptRowFxPropsFrom, formatNetLabel, formatShareLabel, directionLabelFrom, originChipFrom, payerAliasFrom } from "./page";

const t = {
  expenseFxOriginalTemplate: "{currency} {original} → ₡{crc}",
  expenseFxFallbackSuffix: " (rate from {date}, nearest prior)",
  expenseFxSummaryLabel: "Rate details",
  expenseFxRateDetailTemplate: "Converted at rate {rate} on {date}",
};

function crcExpense(overrides: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: "e1",
    list_id: "l1",
    amount: "10.00",
    currency: "CRC",
    description: "Coffee",
    payer_id: "u1",
    provenance: "hand",
    line_type: "purchase",
    posted_date: "2026-08-06",
    created_at: "2026-08-06T12:00:00Z",
    amount_crc: "10.00",
    fx_rate: "1",
    fx_rate_date: "2026-08-06",
    fx_fallback: false,
    origin_kind: null,
    origin_card_id: null,
    origin_card_label: null,
    viewer_share_kind: null,
    viewer_share_value: null,
    viewer_net_crc: null,
    viewer_net_polarity: null,
    ...overrides,
  };
}

describe("receiptRowFxPropsFrom", () => {
  it("CRC rows show amount only — no FX suffix, no expandable detail", () => {
    const result = receiptRowFxPropsFrom(crcExpense(), t);
    expect(result).toEqual({ title: "Coffee", amount: "₡10" });
  });

  it("non-CRC exact-rate rows show original -> CRC and a rate detail, no fallback note", () => {
    const usd = crcExpense({
      description: "Dinner",
      currency: "USD",
      amount: "100.00",
      amount_crc: "52500.00",
      fx_rate: "525.00",
      fx_rate_date: "2026-08-05",
      fx_fallback: false,
    });
    const result = receiptRowFxPropsFrom(usd, t);
    expect(result.title).toBe("Dinner (USD 100.00 → ₡52,500)");
    expect(result.amount).toBe("₡52,500");
    expect(result.fxSummary).toBe("Rate details");
    expect(result.fxDetail).toBe("Converted at rate 525.00 on 2026-08-05");
  });

  it("fallback rate is disclosed directly in the title, not just behind the detail", () => {
    const usd = crcExpense({
      description: "Dinner",
      currency: "USD",
      amount: "100.00",
      amount_crc: "52500.00",
      fx_rate: "525.00",
      fx_rate_date: "2026-08-04",
      fx_fallback: true,
    });
    const result = receiptRowFxPropsFrom(usd, t);
    expect(result.title).toBe(
      "Dinner (USD 100.00 → ₡52,500 (rate from 2026-08-04, nearest prior))",
    );
  });
});

describe("receipt row viewer lens formatting", () => {
  it("formats percentage share without trailing zeros and unsigned net with a borrowed/lent label", () => {
    const directionT = { expenseYouBorrowed: "you borrowed", expenseYouLent: "you lent" };
    expect(formatShareLabel("percentage", "10.00")).toBe("10%");
    expect(formatShareLabel("absolute", "400.00")).toBe("₡400");
    expect(formatNetLabel("900.00", "owed")).toEqual({ label: "₡900", polarity: "owed" });
    expect(formatNetLabel("400.00", "owe")).toEqual({ label: "₡400", polarity: "owe" });
    expect(formatNetLabel("0", "zero")).toBeUndefined();
    expect(formatShareLabel(null, "10.00")).toBeUndefined();
    expect(directionLabelFrom("owe", directionT)).toBe("you borrowed");
    expect(directionLabelFrom("owed", directionT)).toBe("you lent");
    expect(directionLabelFrom("zero", directionT)).toBeUndefined();
    expect(directionLabelFrom(null, directionT)).toBeUndefined();
    expect(
      directionLabelFrom("owe", directionT, { kind: "percentage", value: "30.00" }),
    ).toBe("you borrowed %30");
    expect(
      directionLabelFrom("owed", directionT, { kind: "percentage", value: "10.00" }),
    ).toBe("you lent %10");
    expect(
      directionLabelFrom("owe", directionT, { kind: "absolute", value: "400.00" }),
    ).toBe("you borrowed");
    expect(
      directionLabelFrom("owe", directionT, { kind: null, value: "30.00" }),
    ).toBe("you borrowed");
    expect(
      directionLabelFrom("owe", directionT, { kind: "percentage", value: null }),
    ).toBe("you borrowed");
  });

  it("shows card label only for the payer; others get generic Card copy", () => {
    const chipT = {
      expenseOriginCash: "Cash",
      expenseOriginCard: "Card",
      expenseOriginUnknown: "Unknown",
    };
    expect(
      originChipFrom(
        crcExpense({ origin_kind: "card", origin_card_label: "Kitchen card", payer_id: "u1" }),
        "u1",
        chipT,
      ),
    ).toBe("Kitchen card");
    expect(
      originChipFrom(
        crcExpense({ origin_kind: "card", origin_card_label: "Kitchen card", payer_id: "u1" }),
        "u2",
        chipT,
      ),
    ).toBe("Card");
    expect(originChipFrom(crcExpense({ origin_kind: "cash" }), "u1", chipT)).toBe("Cash");
    expect(originChipFrom(crcExpense({ origin_kind: null }), "u1", chipT)).toBeUndefined();
  });

  it("labels another member's blank origin as Unknown; the viewer's own blank stays unchipped", () => {
    const chipT = {
      expenseOriginCash: "Cash",
      expenseOriginCard: "Card",
      expenseOriginUnknown: "Unknown",
    };
    expect(
      originChipFrom(crcExpense({ origin_kind: null, payer_id: "u2" }), "u1", chipT),
    ).toBe("Unknown");
    expect(
      originChipFrom(crcExpense({ origin_kind: null, payer_id: "u1" }), "u1", chipT),
    ).toBeUndefined();
  });

  it("resolves the payer alias from the member roster, falling back to a short id", () => {
    const members = [
      { user_id: "u1", alias: "sebas" },
      { user_id: "u2", alias: null },
    ];
    expect(payerAliasFrom("u1", members)).toBe("sebas");
    expect(payerAliasFrom("u2", members)).toBe("u2…");
    expect(payerAliasFrom("0123456789abcdef", members)).toBe("01234567…");
  });
});
