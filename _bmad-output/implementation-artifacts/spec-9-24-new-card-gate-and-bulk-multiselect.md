---
title: 'Fix New Card registration gate + bulk multiselect on assign-to-list'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
review_loop_iteration: 1
context: []
baseline_commit: '2396214f5172da55ed89ee060c7121b392f9f286'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** (1) `needsRegistration`/`needsCardRegistration` gates check `!statement.card_id` instead of whether the card has a real label, so an auto-created unlabeled card permanently shows static "New Card" text instead of the editable name input. (2) The bulk "assign to list" page (`BulkReviewPanel.tsx`) only supports one-row-at-a-time move/delete, unlike `ImportReviewSheet.tsx` which already has a validated checkbox multiselect + sticky bulk-action bar pattern.

**Approach:** Swap the gate condition to check `!card.cardLabel` in both `SessionReviewPanel.tsx` and `IndividualReviewPanel.tsx`. Add checkbox selection and a sticky bulk-action bar (bulk delete, bulk move-to-list) to `BulkReviewPanel.tsx`'s pending-row list, mirroring `ImportReviewSheet.tsx`'s pattern, without removing the existing per-row controls.

## Boundaries & Constraints

**Always:**
- Keep existing per-row single move/delete controls in `BulkReviewPanel.tsx` untouched and functional.
- Bulk delete loops `deleteRow` per selected id (mirrors `ImportReviewSheet.saveAction`'s per-id loop); bulk move loops `assignRow` per selected id.
- Selected ids not present after a session refresh (e.g. deleted by the loop) must not cause errors — drop ids no longer in `pendingRows` from selection.
- Use `SoftLedgerRadio type="checkbox"` for row selection, matching `ImportReviewSheet.tsx`.
- Sticky bar renders only when `selectedIds.size > 0`, styled like `ImportReviewSheet`'s `STICKY_BUTTON_CLASS` bar.

**Ask First:** none anticipated — both changes are additive/isolated to existing components.

**Never:** Do not change the API contracts (`deleteRow`, `assignRow`), the primary fixed-list commit button/flow, or introduce a shared "change to pending" unassign action (bulk move here targets a specific list, unlike `ImportReviewSheet`'s unassign-to-pending change-list action).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unlabeled auto-created card | `statement.card_id` set, `card.cardLabel` falsy, `!card.cardMatched`, `statement.iban` truthy | Editable name input renders (not static "New Card" text) | N/A |
| Labeled matched card | `card.cardLabel` truthy | Static label renders as before | N/A |
| Select multiple pending rows | User checks 2+ row checkboxes | Sticky bar appears with delete + move-to-list controls | N/A |
| Bulk delete | Bar delete clicked with N selected | Loops `deleteRow` per id, session refreshes, selection clears | On mid-loop failure, show `rowActionError`, keep remaining unprocessed ids selected |
| Bulk move | Bar move-to-list option chosen with N selected | Loops `assignRow(targetListId)` per id, session refreshes, selection clears | Same as above |
| Deselect after row removed by other action | A selected row is deleted via its own per-row control | Selection set drops the now-missing id, no crash | N/A |

</frozen-after-approval>

## Code Map

- `ui/app/upload/SessionReviewPanel.tsx` -- `StatementCard`'s `needsRegistration` gate (line ~386-388)
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` -- `needsCardRegistration` gate (line ~902-904)
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` -- `BulkReviewPanel` component + `PendingRowItem` (add selection state, sticky bar, checkbox)
- `ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx` -- reference pattern for checkbox selection, sticky bar styling, and per-id action loop (lines 184, 271-274, 331-394, 444-453)
- `ui/lib/i18n/upload.ts` -- add new copy keys for bulk selection bar (en block ~L82-84, es block ~L229-231)

## Tasks & Acceptance

**Execution:**
- [x] `ui/app/upload/SessionReviewPanel.tsx` -- change `!statement.card_id` to `!card.cardLabel` in `needsRegistration` -- fixes permanent "New Card" text for unlabeled auto-created cards
- [x] `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` -- change `!current?.statement.card_id` to `!card.cardLabel` in `needsCardRegistration` -- same fix, individual-review flow
- [x] `ui/lib/i18n/upload.ts` -- add `bulkReviewSelectedCount` (e.g. "{count} selected" / "{count} seleccionadas"), `bulkReviewBulkDelete` (may reuse `bulkReviewDeleteRow`), `bulkReviewBulkMovePlaceholder` (may reuse `bulkReviewMoveRowPlaceholder`) to both `en` and `es` blocks -- copy for the new sticky bar
- [x] `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` -- add `selectedIds: Set<string>` state, derive `visibleSelectedIds` filtered against current pending rows, add checkbox to `PendingRowItem`, render sticky bulk-action bar (delete + move-to-list select) above the row `<ul>` when selection is non-empty, loop `deleteRow`/`assignRow` per selected id on bar actions, clear selection and errors appropriately -- delivers the multiselect capability
- [x] `ui/app/upload/SessionReviewPanel.test.tsx` -- add regression test pinning the gate fix (matched=false, cardLabel falsy, needsRegistration false at hook level still shows the name input) -- prevents the old `!statement.card_id` bug from silently regressing
- [x] `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx` -- add tests for multi-row checkbox selection, bulk delete (loops `deleteRow`), and bulk move (loops `assignRow`) -- pins the new multiselect behavior

**Acceptance Criteria:**
- Given a statement whose card has a `card_id` but no label, when the review card renders (session or individual review), then the editable name input shows, not static "New Card" text.
- Given the assign-to-list page with 3+ pending rows, when the user checks 2 of them, then a sticky bar appears offering bulk delete and bulk move-to-list, and the existing per-row controls still work independently.
- Given 2 rows selected, when bulk move-to-list is used, then both rows move and disappear from the pending list, and selection clears.
- Given 2 rows selected, when bulk delete is used, then both rows are removed and selection clears.

## Spec Change Log

- **2026-09-24, review iteration 1 (bad_spec):** Adversarial + edge-case review flagged that this spec's Tasks list omitted a test task despite the I/O matrix defining concrete edge cases (per workflow rule: an I/O matrix present must have a corresponding test task). Amended: added test tasks for both the gate-fix regression (`SessionReviewPanel.test.tsx`) and the new bulk-selection behavior (`BulkReviewPanel.test.tsx`). KEEP: the implementation itself (gate condition swap, sticky bulk-action bar, `visibleSelectedIds` derivation instead of a `useEffect`+`setState` sync) was confirmed correct and lint/typecheck-clean; only test coverage was missing — no code changes were needed, only additive tests.
- Other reviewer findings were triaged as **reject** (e.g., "no select-all", "no confirm-before-bulk-delete", "SoftLedgerRadio-as-checkbox naming", "sequential per-id loop instead of batching") — each either mirrors an existing, already-accepted pattern in `ImportReviewSheet.tsx`/`PendingRowItem`'s single-row move select, or was outside this spec's approved scope (Design Notes already call out the immediate-trigger-on-select behavior as deliberate). Two `Edge Case Hunter` findings claiming the matched-card guard was missing were incorrect — `!card.cardMatched` already gates that branch.

## Design Notes

Bulk move triggers immediately on select-change (mirrors the existing single-row `PendingRowItem` move-select UX — no separate confirm button), rather than `ImportReviewSheet`'s two-button bar, since bulk move here needs an explicit list choice (not a single "change list" unassign action).

## Verification

**Commands:**
- `cd ui && npm run lint` -- expected: no new lint errors
- `cd ui && npx tsc --noEmit` -- expected: no new type errors

**Manual checks (if no CLI):**
- Run the app, upload a statement whose auto-detected card has no label; confirm the name input renders instead of "New Card" text, on both session-review and individual-review screens.
- On the assign-to-list page with a multi-statement session, select multiple pending rows, confirm the sticky bar appears, and confirm bulk delete and bulk move both work and leave the existing per-row controls untouched.

## Suggested Review Order

**Gate-condition fix**

- The one-line fix: gate now checks the card's actual label, not its id.
  [`SessionReviewPanel.tsx:386`](../../ui/app/upload/SessionReviewPanel.tsx#L386)

- Same fix mirrored in the individual-review flow.
  [`IndividualReviewPanel.tsx:902`](../../ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx#L902)

**Bulk multiselect**

- `visibleSelectedIds` derives selection as a pure filter against live pending rows instead of syncing state in an effect — avoids a `setState`-in-effect lint violation and keeps stale ids from lingering after a row is removed.
  [`BulkReviewPanel.tsx:160`](../../ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx#L160)

- Sticky bulk-action bar: selected count, move-to-list select, delete button — mirrors `ImportReviewSheet.tsx`'s bar styling.
  [`BulkReviewPanel.tsx:363`](../../ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx#L363)

- `handleBulkDelete` loops `deleteRow` per selected id, aborting on first failure.
  [`BulkReviewPanel.tsx:219`](../../ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx#L219)

- `handleBulkMove` loops `assignRow` per selected id to the chosen target list.
  [`BulkReviewPanel.tsx:240`](../../ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx#L240)

- Checkbox reuses `SoftLedgerRadio` in checkbox mode, same pattern as `ImportReviewSheet.tsx`.
  [`BulkReviewPanel.tsx:475`](../../ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx#L475)

**Tests**

- Regression test pins the gate fix against the old `!statement.card_id` bug.
  [`SessionReviewPanel.test.tsx:185`](../../ui/app/upload/SessionReviewPanel.test.tsx#L185)

- New tests cover multi-row selection, bulk delete, and bulk move.
  [`BulkReviewPanel.test.tsx:613`](../../ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx#L613)

- New/changed i18n copy for the sticky bar (en + es).
  [`upload.ts:85`](../../ui/lib/i18n/upload.ts#L85)
