---
title: 'Receipt row: origin chip, viewer share/net, overflow menu'
type: 'feature'
created: '2026-08-19'
status: 'in-review'
baseline_commit: '19df60264ce66b1c1b80d9aa9ce5e707c123f75c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Shared-expense receipt rows only show title, date, and total. The viewer cannot see origin, their stated share, or whether this line puts them in the green or the red.

**Approach:** Enrich GET `/lists/{id}/expenses` with a per-row viewer lens (stated share + CRC net) by calling the existing 2.6 allocation use-case once per expense (N+1 accepted). Render a denser `ReceiptRow`: leading 1:1 type-icon slot (empty), origin chip, accent share, trailing total plus owe/owed net, and a home-list-style dots menu with unwired Edit/Delete.

## Boundaries & Constraints

**Always:** Server owns share and net (Decimal → JSON strings); UI formats only. Stated share is the winning spec (percentage / even / whole_assignee → `%`; absolute → CRC), never a ratio from allocated cents. Payer net = `amount_crc − viewer_share_crc` (owed if > 0); non-payer net = `−viewer_share_crc`. Hide share/net when the lens is missing. Origin chip: blank → none; cash → “Cash”; card + payer → `get_card_for_owner` label; otherwise generic “Card” (never another member’s label). Empty 1:1 icon slot with equal padding. Dots menu like home list cards; Edit/Delete do not call APIs. EN+ES in `lists.ts`. New UI is Tailwind.

**Ask First:** If the 2.6 resolution path cannot yield a stated share without a second allocator, halt. If N+1 on GET expenses would require loading a different ACL action than `read_expenses`, halt.

**Never:** Recompute shares or FX in the browser. N+1 `share-allocations` fetches from the UI. A batched allocations API (explicitly deferred). Expense-type icons. Wiring edit/delete (no confirm dialog, no mutations). Changing `BalanceStrip` or POST create-expense. Leaking card labels to non-payers. Failing the whole expense list because one row’s allocation errors.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Payer, 10% of ₡1000 | Percentage spec 10/90 | Share `10%` accent; total ₡1,000; net `+₡900` owed | N/A |
| Non-payer, absolute ₡400 of ₡1000 | Friend paid | Share `₡400` accent; net `-₡400` owe | N/A |
| Even default, two members | No item override | Share `50%`; payer `+` half; non-payer `-` half | N/A |
| Net zero | Share equals what viewer paid | Hide net; keep share + total | N/A |
| Card origin | Payer vs other member | Payer: card label. Else: “Card”, no label | Missing owned card → “Card” |
| Cash / blank | `cash` / `null` | “Cash” chip / no chip | N/A |
| One-row allocation error | 2.6 raises for that subject | Null lens on that row; list still 200 | Omit lens; do not 422 the list |
| Overflow menu | Dots click | Edit + Delete visible; neither mutates | N/A |

</frozen-after-approval>

## Code Map

- `api/domain/splits.py` + `api/domain/default_split.py` -- allocations, winning spec, even %
- `api/application/splits.py` + `api/application/expenses.py` -- per-row `ComputeShareAllocationsService`; list expenses
- `api/api/schemas/lists.py` + `api/api/routes/lists.py` -- `ExpenseItemResponse` / GET expenses
- `api/adapters/persistence/repositories.py` -- `get_card_for_owner`
- `ui/components/soft-ledger/ReceiptRow.tsx` -- denser row
- `ui/app/cards/CardRoutingControl.tsx` -- chip visual to copy (display-only)
- `ui/app/lists/ListsPanel.tsx` + `IconButton` + `DotsIcon` -- overflow menu pattern
- `ui/app/lists/listsClient.ts` + `ui/app/lists/[listId]/page.tsx` + `ui/lib/i18n/lists.ts` -- parse, wire, copy
- `api/tests/test_manual_expense_api.py` + `ui/components/soft-ledger/soft-ledger.test.tsx` + `page.receiptRowFx.test.ts`

## Tasks & Acceptance

**Execution:**
- [x] `api/domain/` (+ colocated pytest) -- Pure viewer-lens helper: stated share from winning spec + net CRC/polarity from allocations and payer. Cover the I/O matrix happy paths and net-zero.
- [x] `api/application/expenses.py` + `api/api/schemas/lists.py` + `api/api/routes/lists.py` -- Attach optional lens fields on each listed expense; N+1 `ComputeShareAllocationsService` inside GET expenses; card label only via `get_card_for_owner` when actor is payer. One row failure → null lens, list still returns.
- [x] `api/tests/test_manual_expense_api.py` -- Integration: even/percentage/absolute, payer vs member, card-label privacy, cash/blank, one-row omit-on-error.
- [x] `ui/components/` Chip + `ReceiptRow.tsx` + client overflow menu -- Layout as in Design Notes. Empty 1:1 icon slot. Display chip (not a toggle). Dots menu with Edit/Delete no-ops. Keep empty-state row and FX `<details>`.
- [x] `ui/lib/i18n/lists.ts` + `ui/app/lists/listsClient.ts` + `ui/app/lists/[listId]/page.tsx` -- Parse lens fields; map origin chip; format share (`10%` / `₡100`) and signed net; do not invent numbers when fields are null.
- [x] `ui/components/soft-ledger/soft-ledger.test.tsx` + `page.receiptRowFx.test.ts` -- Row layout, chip/share/net polarity, menu open, FX regression, asExpenses/lens parse.

**Acceptance Criteria:**
- Given I paid ₡1000 at 10%, when I open the list, then the row shows `10%` in accent, total ₡1,000, and `+₡900` in owed green.
- Given a friend paid ₡1000 and my absolute share is ₡400, when I view the row, then I see `₡400` in accent and `-₡400` in owe red.
- Given I am not the payer and origin is a card, when the row renders, then the chip says “Card” with no label.
- Given I am the payer and origin is my card, when the row renders, then the chip shows that card’s label.
- Given allocation fails for one expense, when GET expenses succeeds, then that row still lists title and total without share/net, and other rows are unaffected.
- Given I click the dots control, when the menu opens, then I see Edit and Delete and neither persists a change.

## Spec Change Log

## Design Notes

Layout (leading → trailing):

```
[ 1:1 icon ] [ title     origin chip ] [ ₡1,000 ] [ ⋯ ]
             [ date      10% / ₡100  ] [ +₡900  ]
```

Share uses `text-accent`. Net uses `text-owed` / `text-owe`. Total stays muted tabular. Icon slot has equal padding; no glyph yet. Chip visual matches the routing chip (`border`, compact type) but is not a button.

Suggested lens fields (snake_case): `viewer_share_kind` (`percentage`|`absolute`|null), `viewer_share_value` (string), `viewer_net_crc` (unsigned string), `viewer_net_polarity` (`owe`|`owed`|`zero`|null), `origin_card_label` (string|null). Reuse existing `origin_kind`.

## Verification

**Commands:**
- `cd api && uv run pytest tests/test_manual_expense_api.py tests/test_split_override_api.py -q` -- list-expenses lens cases green; 2.6 still green
- `cd ui && npm run typecheck && npm run lint && npm test` -- ReceiptRow / FX / parse tests green
