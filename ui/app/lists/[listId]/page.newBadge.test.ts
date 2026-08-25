import { describe, expect, it } from "vitest";

import type { ExpenseItem } from "../listsClient";
import { calendarDateInCostaRica, newBadgeLabelFrom } from "./page";

const t = { receiptNewBadge: "New" };

function expense(overrides: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: "e1",
    list_id: "l1",
    amount: "10.00",
    currency: "CRC",
    description: "Coffee",
    payer_id: "u1",
    provenance: "parser",
    line_type: "purchase",
    posted_date: "2026-08-06",
    created_at: "2026-08-24T18:00:00Z",
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

describe("calendarDateInCostaRica", () => {
  it("uses America/Costa_Rica, not UTC, around midnight", () => {
    // 05:00 UTC is still 23:00 the previous day in CR (UTC-6, no DST).
    expect(calendarDateInCostaRica("2026-08-25T05:00:00Z")).toBe("2026-08-24");
    expect(calendarDateInCostaRica("2026-08-25T06:00:00Z")).toBe("2026-08-25");
  });

  it("returns null for unparseable timestamps", () => {
    expect(calendarDateInCostaRica("not-a-date")).toBeNull();
  });
});

describe("newBadgeLabelFrom", () => {
  it("returns the label for parser rows created today", () => {
    expect(newBadgeLabelFrom(expense(), t, "2026-08-24")).toBe("New");
  });

  it("ignores posted_date — only created_at matters", () => {
    expect(
      newBadgeLabelFrom(
        expense({ posted_date: "2026-08-24", created_at: "2026-08-23T18:00:00Z" }),
        t,
        "2026-08-24",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for parser rows created on a previous day", () => {
    expect(newBadgeLabelFrom(expense(), t, "2026-08-25")).toBeUndefined();
  });

  it("returns undefined for hand rows even when created today", () => {
    expect(newBadgeLabelFrom(expense({ provenance: "hand" }), t, "2026-08-24")).toBeUndefined();
  });
});
