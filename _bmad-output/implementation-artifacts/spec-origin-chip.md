---
title: 'Receipt row: origin chip SlideDown'
type: 'refactor'
created: '2026-08-19'
status: 'done'
baseline_commit: '3973520b9ed14481cd59ea0b8d0b93920e96064e'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Origin assignment lives in a list-level `NoOriginFilter` above the receipts, so it is unclear which row still needs (or should change) an origin.

**Approach:** Remove that filter. Every **payer** origin chip (No Origin, Cash, or card) is a toggle that expands a `SlideDown` under that receipt row. The panel is a horizontal row of origin chips; the current origin is omitted. Choosing one PATCHes and collapses.

## Boundaries & Constraints

**Always:** Only the entry payer can assign (`PATCH .../origin`, `not_entry_payer`). Payer-blank shows warning **No Origin** (`text-owe` / `border-owe`, no new hex). Non-payer chips (Unknown, Cash, or card on someone else's row) are **disabled**: not interactive, no SlideDown, no PATCH; origin label is muted/`text-muted`; reduced opacity so the chip does not look clickable. Accent `@alias:` may stay inside that chip (identity). Payer chips are clickable. Chip click expands `SlideDown` under that row — same family as `CardRoutingControl` (`open`, `id`, `labelledBy`; `role="region"`; `aria-hidden` / `inert` when closed). While open, the **SlideDown panel surface uses `border-accent`**. The origin **trigger chip** (closed and open) always shows accent `@alias:` plus the origin label inside the same chip — never outside it. Trigger tones: No Origin = warning/`--owe`; Cash/card = existing muted/named chip tones. Panel content is a horizontal row of origin chips, not `SoftLedgerSelect` and not a form. Options = assignable origins minus current: blank → Cash + all viewer cards (do not repeat No Origin); Cash → warning No Origin + cards; a card → warning No Origin + Cash + other cards. Choosing No Origin PATCHes `{ origin_kind: null, origin_card_id: null }`. Empty alternative set → chip stays visible but not a toggle. Choosing an option calls `updateExpenseOrigin` then collapse + `router.refresh()`. Escape or a second chip click dismisses with no PATCH. `ReceiptRow` stays API-free (chip + below-row slots). Lists client island owns `fetchCards` (on open, not idle) + PATCH. EN+ES in `lists.ts`. New UI is Tailwind.

**Ask First:** If a dedicated warning token is required instead of `--owe`. If origin cannot be updated from the row via the existing PATCH.

**Never:** Keep `NoOriginFilter` or bulk assign. Use `SoftLedgerSelect` or native `<select>` for this picker. Let non-payers PATCH or open a picker (including Unknown). Style non-payer origin chips as clickable (no hover/focus ring, no caret). Give the open SlideDown a muted or owe border — it is `border-accent`. Label the clear option "None"/`expenseOriginBlank` — use **No Origin** / `expenseOriginNone`. Move the payer alias outside the origin chip or drop it while the panel is open. Invent `--warning` or re-pick DESIGN.md hexes. Change `ManualExpenseForm` create-time origin. Recompute shares or FX in the browser.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Payer, blank | Viewer is payer, `origin_kind` null | Warning chip `@alias: No Origin`; click → SlideDown with Cash + all cards (no No Origin in panel); alias stays inside the trigger | N/A |
| Payer, Cash | `origin_kind` cash | Muted chip `@alias: Cash`; click → SlideDown with warning No Origin + viewer cards; alias stays inside the trigger | N/A |
| Panel open | SlideDown expanded | Trigger still shows accent `@alias:` + current origin label inside the chip; **panel has `border-accent`** | N/A |
| Payer, card A | Card A current; cards A, B | Card-A chip; click → SlideDown with No Origin + Cash + B (A omitted) | N/A |
| Pick No Origin | Current is Cash or a card | PATCH `{ origin_kind: null, origin_card_id: null }`; collapse; refresh | N/A |
| Pick Cash or a card | Click a panel chip | PATCH; panel collapses; row shows new origin after refresh | N/A |
| Non-payer blank | Viewer ≠ payer, origin null | Disabled chip: muted **Unknown** origin label, reduced opacity, not a button; alias may stay accent | N/A |
| Non-payer Cash/card | Other member paid | Disabled chip: muted origin label, reduced opacity, not a toggle | N/A |
| Cash, zero cards | Payer cash, `fetchCards` = [] | SlideDown is warning No Origin only | N/A |
| Dismiss | Open panel, Escape or chip toggle | Collapse; no PATCH | N/A |
| PATCH fails | `updateExpenseOrigin` not ok | Panel stays open; `text-owe` error; no refresh | Mapped client error |
| Cards fetch fails | `fetchCards` not ok | Panel still opens; No Origin if not current; Cash if not current; no invented cards | `text-owe` error |
| No cards, blank | Payer blank, zero cards | SlideDown is Cash only | N/A |

</frozen-after-approval>

## Code Map

- `ui/components/Chip/Chip.tsx` -- add `tone: "warning"` (`border-owe text-owe`); display chips stay spans
- `ui/components/SlideDown/SlideDown.tsx` -- reuse as-is (`open`, `id`, `labelledBy`, 200ms grid rows, `motion-reduce`)
- `ui/app/cards/CardRoutingControl.tsx` -- pattern ref: chip `<button>` + `aria-expanded` / `aria-controls` + Escape + `SlideDown`
- `ui/components/soft-ledger/ReceiptRow.tsx` -- origin chip slot + below-row slot for `SlideDown`; no fetch/PATCH
- `ui/app/lists/OriginChipPicker.tsx` -- new client island: payer chip button, option chips, `fetchCards` + `updateExpenseOrigin`
- `ui/app/lists/[listId]/page.tsx` -- `originChipFrom` payer-blank → No Origin; wire picker for payer rows; unmount `NoOriginFilter`
- `ui/app/lists/NoOriginFilter.tsx` + `ui/app/lists/NoOriginFilter.test.tsx` -- delete
- `ui/lib/i18n/lists.ts` -- `expenseOriginNone` ("No Origin" / "Sin origen"); drop `noOriginFilter*`
- `ui/app/lists/listsClient.ts` -- reuse `updateExpenseOrigin` (no API change)
- `ui/app/lists/[listId]/page.receiptRowFx.test.ts` -- payer-blank → No Origin; other-blank → Unknown
- `ui/components/soft-ledger/soft-ledger.test.tsx` -- warning No Origin chip; below-row slot
- `ui/app/lists/lists.module.scss` -- `.softReceiptsChrome` may shrink to the section label

## Tasks & Acceptance

**Execution:**
- [x] `ui/components/Chip/Chip.tsx` -- add warning tone using `--owe` -- No Origin color
- [x] `ui/app/lists/OriginChipPicker.tsx` -- payer chip toggles `SlideDown` under the row; option chips omit current; PATCH on choose; Escape/toggle dismiss -- row-level assign
- [x] `ui/app/lists/OriginChipPicker.test.tsx` -- cover I/O matrix (open options, omit current, PATCH, dismiss, errors, Unknown inert, empty alternatives) -- replace NoOriginFilter tests
- [x] `ui/components/soft-ledger/ReceiptRow.tsx` -- chip slot + below-row `SlideDown` slot; stay API-free -- panel expands from the receipt
- [x] `ui/app/lists/[listId]/page.tsx` -- `originChipFrom` + picker on payer rows; remove `NoOriginFilter` -- list surface
- [x] `ui/app/lists/NoOriginFilter.tsx` + `ui/app/lists/NoOriginFilter.test.tsx` -- delete -- filter is the confusion
- [x] `ui/lib/i18n/lists.ts` -- add `expenseOriginNone`; remove `noOriginFilter*` -- EN+ES
- [x] `ui/app/lists/[listId]/page.receiptRowFx.test.ts` + `ui/components/soft-ledger/soft-ledger.test.tsx` -- update originChipFrom + row chip/slot cases -- matrix coverage

**Acceptance Criteria:**
- Given the viewer paid a blank-origin expense, when the list renders, then that row shows a warning **No Origin** chip and the list chrome has no no-origin filter.
- Given a payer Cash or card chip, when the viewer clicks it, then a `SlideDown` opens under that row with a horizontal chip row that omits the current origin and includes warning **No Origin**.
- Given the viewer clicks **No Origin** in the panel, when PATCH succeeds, then origin is cleared (`null`) and the row shows the warning chip after refresh.
- Given the viewer clicks an option chip, when PATCH succeeds, then the panel collapses and the row shows the new origin.
- Given another member paid a blank-origin expense, when the list renders, then the chip is disabled (muted **Unknown** label, reduced opacity) and is not a picker.
- Given the viewer is not the payer, when they see Cash or card, then that chip is disabled and does not open a panel.
- Given a payer origin chip with a payer alias, when the SlideDown is open, then the trigger chip still contains accent `@alias:` plus the origin label, and the panel has an accent border.

## Spec Change Log

## Design Notes

Map "warning" to Chip `tone="warning"` = `border-owe text-owe`. Do not add a hex.

Clickable origin chips are `<button>`s (CardRoutingControl classes: `aria-expanded`, `aria-controls`, focus ring), not the display `Chip` span. The accent `@alias:` handle is a child of that button (and of the display `Chip` when non-interactive) — closed and open. Option chips in the panel are also buttons in `flex flex-wrap gap-2` and do **not** include the alias. `SlideDown` stays mounted while closed (`inert` + `aria-hidden`).

Non-payer origin chips use Chip `disabled` (opacity + no pointer) with the origin label in `text-muted`. Alias inside the chip stays `text-accent`. Open SlideDown inner surface: `border border-accent` — not `--owe` and not `--border`.

`ReceiptRow` must not import `listsClient`. Pass the chip control and the panel node (panel is a sibling below the row grid, still inside the row wrapper).

`originChipFrom`: payer-blank → `expenseOriginNone`; other-blank → Unknown. Interactivity: `payer_id === currentUserId` and at least one alternative origin after omit-current.

Omit-current compares `origin_kind` + `origin_card_id`, not label text. Panel **No Origin** uses `expenseOriginNone` (warning tone), never `expenseOriginBlank` ("None").

## Verification

**Commands:**
- `cd ui && npm test -- OriginChipPicker.test.tsx page.receiptRowFx.test.ts soft-ledger.test.tsx` -- expected: pass; NoOriginFilter tests gone
- `cd ui && npm run typecheck` -- expected: clean
- `cd ui && npm run lint` -- expected: clean

## Suggested Review Order

**Entry point**

- Payer rows get a client island; everyone else gets a disabled display chip.
  [`page.tsx:594`](../../ui/app/lists/[listId]/page.tsx#L594)

**Omit-current options + PATCH**

- Blank → Cash+cards; Cash → No Origin+cards; a card → No Origin+Cash+others.
  [`OriginChipPicker.tsx:43`](../../ui/app/lists/OriginChipPicker.tsx#L43)

- Fetch on open; failed loads retry; options stay inert until cards settle.
  [`OriginChipPicker.tsx:161`](../../ui/app/lists/OriginChipPicker.tsx#L161)

- Successful choose updates local origin immediately, then refresh.
  [`OriginChipPicker.tsx:114`](../../ui/app/lists/OriginChipPicker.tsx#L114)

**Chip + panel chrome**

- Accent `@alias:` stays inside the trigger while SlideDown is open.
  [`OriginChipPicker.tsx:208`](../../ui/app/lists/OriginChipPicker.tsx#L208)

- Open panel surface uses `border-accent`, not owe or muted.
  [`OriginChipPicker.tsx:237`](../../ui/app/lists/OriginChipPicker.tsx#L237)

- Non-payer origin label is muted; whole chip is `opacity-55` and not a button.
  [`ReceiptRow.tsx:87`](../../ui/components/soft-ledger/ReceiptRow.tsx#L87)

- Warning tone is `--owe`; disabled chips are not clickable.
  [`Chip.tsx:18`](../../ui/components/Chip/Chip.tsx#L18)

**List chrome**

- List-level NoOriginFilter is gone; receipts chrome is the section label only.
  [`page.tsx:559`](../../ui/app/lists/[listId]/page.tsx#L559)

**Copy**

- EN+ES **No Origin** / **Sin origen**; filter strings removed.
  [`lists.ts:89`](../../ui/lib/i18n/lists.ts#L89)

**Tests**

- Matrix: omit-current, clear-to-null, alias-in-trigger, fetch retry, disabled non-payer.
  [`OriginChipPicker.test.tsx:75`](../../ui/app/lists/OriginChipPicker.test.tsx#L75)

