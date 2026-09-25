---
title: 'Replace bulk assign-to-list panel with a reused review-sheet UX'
type: 'refactor'
created: '2026-09-25'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: 'ca047dd66f949a9e4b0761fc428dbcf79c4e0cb1'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `BulkReviewPanel.tsx` (assign-to-list flow) is a bespoke flat-list UI with a plain `<select>` list picker and immediate (non-staged, non-undoable) row delete — visually and behaviorally inconsistent with `ImportReviewSheet.tsx`, the equivalent final-confirm UI used after individual review (day-grouped rows, `Sheet` modal chrome, staged/undoable discard).

**Approach:** Replace `BulkReviewPanel.tsx` with a new sibling component, `BulkAssignSheet.tsx`, that reuses `ImportReviewSheet`'s reusable pieces (`groupRowsByDay`, `stagedImportDiscards`, the `Sheet` modal shell, sticky selection-bar pattern) instead of threading a new mode into `ImportReviewSheet` itself. All currently-pending rows are treated as bulk-assigned to a single list chosen via a new single-select list chip picker (built on `ui/components/ChipPicker/` primitives, shaped like `OriginChipPicker.tsx` but sourced from lists) rendered below the sheet's heading. `ImportReviewSheet.tsx` itself is untouched.

## Boundaries & Constraints

**Always:**
- Delete `BulkReviewPanel.tsx` entirely; `ui/app/upload/bulk/[sessionId]/page.tsx` renders `BulkAssignSheet` instead, unchanged otherwise.
- The sheet opens immediately on mount as the page's sole content (`Sheet` modal, `open` always true) — no separate pre-screen. `onClose` → `router.push("/upload")`, matching `ImportReviewSheet`'s existing close behavior.
- List chip picker renders inside the sheet body, directly below the title, single-select, sourced from the same membership-lists fetch `BulkReviewPanel` already used (`fetchLists`/`useMembershipLists`, with the `listId` query-param preselect behavior preserved).
- Selecting a list is pure local state (no network call from the picker itself) — actual assignment happens on Save.
- Rows shown are `session.statements[].rows` (pending only), day-grouped via `groupRowsByDay` (imported from `ImportReviewSheet.tsx`, already exported) — no list-grouping needed (single list).
- Per-row "move to a different list" (`assignRow`) and its bulk sticky-bar equivalent (shipped in spec-9-24) are preserved as an escape hatch, using a `SoftLedgerSelect`, options excluding the currently chip-picked list.
- Row delete is staged via `stagedImportDiscards` (`stageSheetDiscards`/`restoreStagedDiscard`), not immediate — mirrors `ImportReviewSheet`'s per-row and bulk discard + "Discarded" section with Restore.
- Save button: disabled until a list is chosen; on click, delete every staged-discard id (loop `deleteRow`, same pattern as `ImportReviewSheet.saveAction`), then call `bulkCommitSession(sessionId, chipListId, ...)` if any pending rows remain, else `finalizeSession` — mirrors `BulkReviewPanel.commit`'s existing branching exactly, just preceded by the staged-delete loop. On success, route via `routeAfterImportLanding` as today.
- Keep `useChromeHeader` with `DocsHelpButton` as `BulkReviewPanel` has it today.

**Ask First:** none anticipated — additive component swap, no API contract changes.

**Never:** Do not modify `ImportReviewSheet.tsx`. Do not add a "single-list mode" flag to it. Do not change `assignRow`/`deleteRow`/`bulkCommitSession`/`finalizeSession` contracts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No list chosen yet | `listId` unset | Rows still render (day-grouped, unassigned display), Save disabled | N/A |
| List chosen, rows pending | `listId` set, N pending rows | Save enabled; click loops staged deletes then `bulkCommitSession` | Same error surface as today's `commit.error` |
| Row staged for discard | Trash icon clicked on a row | Row moves to "Discarded" section with Restore, removed from day-grouped list and any selection | N/A |
| Restore discarded row | Restore clicked | Row returns to its day group | N/A |
| Per-row move to different list | Row's move-select chosen | `assignRow` loop (existing pattern), row leaves pending rows immediately | On failure, `rowActionError` shown, row stays pending |
| Bulk select then move/discard | 2+ rows checked, sticky bar action used | Loops per id (existing pattern), selection clears of processed/removed ids | On mid-loop failure, error shown, remaining ids stay selected |
| Save with zero pending rows (all moved/discarded) | `pendingRows.length === 0` | Calls `finalizeSession` directly (no `bulkCommitSession`) | Same as `commit.error` today |

</frozen-after-approval>

## Code Map

- `ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx` -- NEW: replaces `BulkReviewPanel.tsx`; sheet UI reusing `ImportReviewSheet` patterns + new list chip picker
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` -- DELETE
- `ui/app/upload/bulk/[sessionId]/page.tsx` -- swap import/render to `BulkAssignSheet`
- `ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx` -- reference only: `groupRowsByDay` (exported, reused), `Sheet` usage pattern, discard-staging wiring, sticky-bar styling (lines ~359-394, ~396-527) -- not modified
- `ui/components/ChipPicker/SingleChipPicker.tsx` -- DEVIATION: a generic single-select chip picker already existed here (`options`/`selectedValue`/`onSelect`/`ariaLabel`/`disabled`) — reused as-is instead of creating a new `ListChipPicker.tsx`, avoiding a near-duplicate component
- `ui/app/upload/stagedImportDiscards.ts` -- reused as-is (already generic by `sessionId`)
- `ui/app/upload/uploadClient.ts` -- reused as-is: `assignRow`, `deleteRow`, `bulkCommitSession`, `finalizeSession`
- `ui/lib/i18n/upload.ts` -- add/rename copy keys for the new sheet (en block ~L66-87, es block ~L215-237)

## Tasks & Acceptance

**Execution:**
- [x] `ui/components/ChipPicker/SingleChipPicker.tsx` -- reused existing generic single-select chip picker in place of a new `ListChipPicker.tsx` (see Code Map deviation) -- reusable list-target picker, no per-selection network call
- [x] `ui/lib/i18n/upload.ts` -- added `bulkAssignChooseListPlaceholder` + `bulkAssignChooseListLabel` copy keys (en/es); reused existing `bulkReview*`/`importReviewSheet*` keys elsewhere -- copy for new UI surface
- [x] `ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx` -- implemented component per Boundaries above: session/lists fetch (ported from `BulkReviewPanel`), `SingleChipPicker` below sheet title, day-grouped pending rows (`groupRowsByDay`), staged discard + Discarded/Restore section, per-row/bulk move-to-list, Save wired to staged-delete loop + `bulkCommitSession`/`finalizeSession` -- delivers the reused UX
- [x] `ui/app/upload/bulk/[sessionId]/page.tsx` -- renders `BulkAssignSheet` instead of `BulkReviewPanel` -- wires the route
- [x] `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` -- deleted -- superseded
- [x] `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx` -- deleted and replaced by `BulkAssignSheet.test.tsx` covering: list selection enabling Save, staged discard + restore, per-row and bulk move, bulk commit vs. finalize-only branching, close routing, query-param preselect -- pins new behavior

**Acceptance Criteria:**
- Given a fresh bulk-assign session with pending rows, when the page loads, then rows render day-grouped inside a `Sheet` modal with a list chip picker below the heading, matching `ImportReviewSheet`'s visual pattern.
- Given a list chosen and a row's delete icon clicked, when Save is clicked, then that row is deleted (via staged-delete loop) and the rest are committed to the chosen list via `bulkCommitSession`.
- Given all pending rows moved to other lists individually, when Save is clicked, then `finalizeSession` is called directly (no `bulkCommitSession`).
- Given the sheet is closed (Esc/backdrop/close button), then the user lands on `/upload`.

## Spec Change Log

## Design Notes

`BulkAssignSheet` is a structural sibling of `ImportReviewSheet`, not a mode flag on it: `ImportReviewSheet` groups already-assigned rows by list+day; this component has exactly one implicit "list" (the chip-picked one) and groups only by day, using pending (not yet assigned) rows as its source. The list chip picker replaces `ImportReviewSheet`'s "Change List" unassign action — there is no unassign-to-pending concept here.

## Verification

**Commands:**
- `cd ui && npm run lint` -- expected: no new lint errors
- `cd ui && npx tsc --noEmit` -- expected: no new type errors
- `cd ui && npm test -- BulkAssignSheet` -- expected: new/updated tests pass

**Manual checks (if no CLI):**
- Upload a multi-row statement, land on `/upload/bulk/[sessionId]`, confirm the sheet UI matches individual review's final sheet visually, pick a list via the chip picker, stage a discard, restore it, move one row to a different list, then Save and confirm it lands on the chosen list's shared-expenses view.

## Suggested Review Order

**Component shape: sibling sheet, not a mode flag**

- New component's own doc comment states the design decision (sibling of `ImportReviewSheet`, not a mode on it) and how Save branches between `bulkCommitSession`/`finalizeSession`.
  [`BulkAssignSheet.tsx:86`](../../ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx#L86)

- Single-list chip picker reused from the existing generic `SingleChipPicker` primitive instead of a new near-duplicate component (deviation from the spec's Code Map, in a good direction).
  [`BulkAssignSheet.tsx:448`](../../ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx#L448)

**Save: staged-delete loop, then bulk-commit vs. finalize branching**

- `commit` deletes every staged-discard id first (mirrors `ImportReviewSheet.saveAction`'s per-id loop), then calls `bulkCommitSession` when pending rows remain or `finalizeSession` directly when the loop emptied them — the core behavioral contract from the spec.
  [`BulkAssignSheet.tsx:234`](../../ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx#L234)

- Post-review fix: `mountedRef` guard added around `setSession`/`routeAfterImportLanding` so a Save that outlives the sheet (Close/Esc during an in-flight request) doesn't write into an unmounted tree — matches `ImportReviewSheet`'s existing pattern, which this component's first draft omitted.
  [`BulkAssignSheet.tsx:118`](../../ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx#L118)

**Staged discard + Discarded/Restore section**

- `stageDiscard`/`restoreDiscarded` wire into the shared `stagedImportDiscards` module — same localStorage-backed staging `ImportReviewSheet` uses, upgrading the old panel's immediate, non-undoable delete.
  [`BulkAssignSheet.tsx:291`](../../ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx#L291)

**Per-row / bulk move-to-a-different-list escape hatch**

- `handleMoveRow`/`handleBulkMove` port `BulkReviewPanel`'s existing `assignRow`-loop pattern unchanged; post-review fix adds `commit.clearError()` so a stale commit error doesn't linger after a successful row action (and vice versa via the Save button's `setRowActionError(null)`).
  [`BulkAssignSheet.tsx:269`](../../ui/app/upload/bulk/[sessionId]/BulkAssignSheet.tsx#L269)

**Route wiring and deletion**

- Route now renders `BulkAssignSheet` in place of the deleted `BulkReviewPanel`.
  [`page.tsx:4`](../../ui/app/upload/bulk/[sessionId]/page.tsx#L4)

- New i18n keys for the chip picker's label/placeholder, added beside the existing `bulkReview*`/`importReviewSheet*` copy this component reuses.
  [`upload.ts:88`](../../ui/lib/i18n/upload.ts#L88)

**Tests**

- Full behavioral suite: list-selection gating, staged discard + restore, per-row/bulk move, `bulkCommitSession` vs. `finalizeSession` branching (including a post-review addition covering the discard-only exhaustion path), and close routing.
  [`BulkAssignSheet.test.tsx:226`](../../ui/app/upload/bulk/[sessionId]/BulkAssignSheet.test.tsx#L226)
