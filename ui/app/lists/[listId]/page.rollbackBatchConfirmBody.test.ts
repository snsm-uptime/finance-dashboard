import { describe, expect, it } from "vitest";

import type { ExpenseItem } from "../listsClient";
import { rollbackBatchConfirmBodyFrom } from "./page";

const t = {
  rollbackBatchConfirmBody: "This removes the expenses from that import action.",
  rollbackBatchConfirmBodyCount: "This removes {count} expenses from that import action.",
};

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
    import_batch_id: null,
    statement_id: null,
    ...overrides,
  };
}

describe("rollbackBatchConfirmBodyFrom", () => {
  it("uses the singular body when only one row carries the batch id", () => {
    const expenses = [
      expense({ id: "e1", import_batch_id: "batch-1" }),
      expense({ id: "e2", import_batch_id: "batch-2" }),
    ];
    expect(rollbackBatchConfirmBodyFrom(expenses, "batch-1", t)).toBe(t.rollbackBatchConfirmBody);
  });

  it("mentions the count when two rows share the same batch id — a single confirm rolls back the whole batch", () => {
    const expenses = [
      expense({ id: "e1", import_batch_id: "batch-1" }),
      expense({ id: "e2", import_batch_id: "batch-1" }),
      expense({ id: "e3", import_batch_id: "batch-2" }),
    ];
    expect(rollbackBatchConfirmBodyFrom(expenses, "batch-1", t)).toBe(
      "This removes 2 expenses from that import action.",
    );
  });

  it("does not count sibling rows from a different batch", () => {
    const expenses = [
      expense({ id: "e1", import_batch_id: "batch-1" }),
      expense({ id: "e2", import_batch_id: "batch-2" }),
      expense({ id: "e3", import_batch_id: "batch-2" }),
    ];
    expect(rollbackBatchConfirmBodyFrom(expenses, "batch-1", t)).toBe(t.rollbackBatchConfirmBody);
  });

  it("ignores hand rows (null import_batch_id) when counting", () => {
    const expenses = [
      expense({ id: "e1", import_batch_id: "batch-1" }),
      expense({ id: "e2", import_batch_id: null }),
    ];
    expect(rollbackBatchConfirmBodyFrom(expenses, "batch-1", t)).toBe(t.rollbackBatchConfirmBody);
  });
});
