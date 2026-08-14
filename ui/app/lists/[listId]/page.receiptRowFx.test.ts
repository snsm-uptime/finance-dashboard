import { describe, expect, it } from "vitest";

import type { ExpenseItem } from "../listsClient";
import { receiptRowFxPropsFrom } from "./page";

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
