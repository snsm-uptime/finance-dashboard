---
baseline_commit: 183bd8c01a3332f9dc12a846a18749380f0db55d
---

# Story 6.1: Mode switch on member count

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member,
I want list detail chrome to follow how many people are on the list,
so that a solo list is not a household settle screen, and inviting someone restores settle.

## Acceptance Criteria

1. **Given** a list with exactly one member **When** I open list detail **Then** split, settle, simplify, copy-plan, the Settle action, and the You are owed / You owe / Balance grid are not shown (FR-46). **And** Adjust split is not offered on the create/edit expense form.
2. **Given** a second member joins that list **When** I open list detail **Then** shared-expenses settle chrome from Epic 5 is shown exactly as it is today (FR-50) — no regression to the `member_count ≥ 2` path. **And** budget chrome (Epic 6.3+) is not introduced as primary UI in this story.
3. **Given** CI **When** member count is 1 vs ≥ 2 **Then** tests cover both chrome branches (a pure exported "which chrome" decision function plus a `ManualExpenseForm` split-block visibility test).

## Tasks / Subtasks

- [x] Task 1 — Gate settle chrome on live member count (AC #1, #2)
  - [x] 1.1 In `ui/app/lists/[listId]/page.tsx`, add an exported pure function `showSettleChromeFrom(memberCount: number, showBalancesGrid: boolean): boolean` returning `memberCount >= 2 && showBalancesGrid` (keep the existing `balancesLoadError`/`balances !== null` guard folded into `showBalancesGrid` as today — do not weaken it, only add the member-count gate).
  - [x] 1.2 Replace the ternary at the `BalanceStrip` call (`showBalancesGrid ? {grid...} : {simple...}`) so the grid branch (You are owed / You owe / Balance grid, `SimplifyColumn`, `SettleControls`) is chosen via `showSettleChromeFrom(members.length, showBalancesGrid)` instead of `showBalancesGrid` alone.
  - [x] 1.3 When `members.length === 1`, the strip must fall through to the existing "simple" (`who`/`amount`/`polarity`) variant unchanged — do not build new solo copy or a spend-by-origin hero here; that is Story 6.2. This is chrome suppression only.
  - [x] 1.4 `SimplifyColumn` is already gated at `members.length >= 3` (line ~742) — leave that condition as-is; it is subsumed by the new `showSettleChromeFrom` gate for the `member_count === 1` case and still correctly hides for `member_count === 2`.
- [x] Task 2 — Hide "Adjust split" on create/edit for solo lists (AC #1)
  - [x] 2.1 In `ui/app/lists/ManualExpenseForm.tsx`, wrap the `<div className={styles.splitBlock}>...</div>` block (the `TriSwitch` + whole/percentage/absolute sub-forms, ~lines 374–456) in `{members.length > 1 ? (...) : null}`. `members` is already a required prop on this component — no new prop needed.
  - [x] 2.2 When hidden, `buildSplitOverride()` must still work for the implicit single-member case: `mode` stays at its default `"percentage"` and `percentMapFromDefault` for a 1-member list already returns `{ [that member]: "100" }` via `evenPercentMap`, so `buildSplitOverride()` returns `{ ok: true, value: undefined }` (baseline match) — verify this with a test, do not add special-case branching in `buildSplitOverride`.
  - [x] 2.3 `canSubmit`'s `mode !== "whole_assignee" || !!activeAssigneeId` check is unaffected since `mode` can never become `"whole_assignee"` when the switch is hidden (state stays at its initial `"percentage"`).
- [x] Task 3 — Tests (AC #3)
  - [x] 3.1 Add `ui/app/lists/[listId]/page.memberChrome.test.ts` covering `showSettleChromeFrom`: `(1, true) → false`, `(2, true) → true`, `(1, false) → false`, `(2, false) → false`. Follow the existing pattern in sibling `page.*.test.ts` files (plain function import, no component render).
  - [x] 3.2 Add cases to `ui/app/lists/ManualExpenseForm.test.tsx`: with a 1-member `members` array the `splitBlock`/`TriSwitch` is absent from the rendered form; with a 2+-member array it is present (existing tests already cover the ≥2 case — add the 1-member negative case).
  - [x] 3.3 Do not touch `ui/components/soft-ledger/soft-ledger.test.tsx` — `BalanceStrip` itself is unchanged; only its caller's branch selection changed.

### Review Findings

- [x] [Review][Decision] `ReceiptRow.tsx` shrink-to-fit feature is undeclared scope — resolved: user chose to keep it bundled in this diff and fix its sub-issues now (see patch items below) rather than split it into a separate story/commit.
- [ ] [Review][Patch] `ManualExpenseForm` split state can go stale when `members` drops to 1 without a remount [ui/app/lists/ManualExpenseForm.tsx:142-224] — If a list's live `members` prop transitions from 2+ to 1 while the form stays mounted (e.g. via `router.refresh()` re-rendering the server tree without unmounting this client component), `mode`/`absoluteAmounts`/`percentages` are not reset. The `splitBlock` UI is now hidden per the new `members.length > 1` gate, so the user has no way to see or correct the stale split before submit, and `buildSplitOverride()` would submit a stale split payload (e.g. referencing a removed member, or a non-percentage `mode`). Fix: reset via `resetAdjustFields()` in a `useEffect` when `members.length <= 1`.
- [ ] [Review][Patch] `ReceiptRow` shrink effect's dependency array misses props that affect `meta` column width [ui/components/soft-ledger/ReceiptRow.tsx:129-160] — The `useLayoutEffect` deps list `[title, when, payerAlias, amount, originChip, newBadgeLabel, netLabel, directionLabel]` but omit `menu`, `menuSlot`, `rollback`, `originAction`, `originDisabled`, and `originPanel`. Since the grid's `menu` column is `auto`-sized, a change in `menu`/`menuSlot`/`rollback` shifts how much width remains for the `1fr` `meta` column without triggering a recalc; `originAction`/`originDisabled` render directly inside `meta` via `OriginMeta` and have the same gap. Fix: add these props to the dependency array (or switch to measuring via `ResizeObserver` on `meta` itself, which the effect already partially relies on).
- [ ] [Review][Patch] `ReceiptRow` net-amount shrink writes directly to a DOM style property React also owns [ui/components/soft-ledger/ReceiptRow.tsx:138,152,250] — `net.style.fontSize` is imperatively reset/set inside the effect, but the same element's `style` prop is `{ ...typeStyle.net, gridArea: "net" }`, which React reconciles independently. An imperative write can desync from what React believes is applied across renders that don't touch `typeStyle.net`. Fix: drive the shrink through a CSS custom property (e.g. `--net-scale`) referenced in `typeStyle.net.fontSize` via `calc()`, so React's owned style object and the imperative write don't collide on the same key.
- [ ] [Review][Patch] `ReceiptRow` shrink has no fallback once the 0.62 floor is hit [ui/components/soft-ledger/ReceiptRow.tsx:145-152] — When required shrink exceeds `NET_AMOUNT_MIN_SCALE`, `recalc` clamps to the floor and returns with no further mitigation, so very long combined `meta` content can still visibly overflow past the floor. Fix: apply `overflow-hidden text-ellipsis` (or similar truncation) to `meta`/`net` as a fallback once the floor is reached.

## Dev Notes

- **This is a UI-only chrome-gating story.** No API, schema, or domain changes (confirmed: no `member_count` field or division-by-member-count logic exists server-side that this touches; `/lists/{id}/members` already returns the live roster the UI already fetches on every page load). AD-29: "Mode is **live membership count**, not a list type" — member count must never be cached/derived from anything other than the live `members` fetch already in `page.tsx`.
- **Reuse the established gating idiom.** This codebase already gates member-count-sensitive UI the same way in three places — follow it exactly, don't invent a new pattern:
  - `ui/app/lists/[listId]/page.tsx:742` — `members.length >= 3` gates `SimplifyColumn`.
  - `ui/app/lists/TemporalNavigation.tsx:85,103` and `ui/app/lists/ListDetailMobileActions.tsx:74` — `members.length > 1` gates the default-split-settings icon/sheet (`DefaultSplitPanel`). **This one is already correct for AC #1's "split... is not offered" — no change needed there.** Only `ManualExpenseForm`'s per-expense "Adjust split" `TriSwitch` (a different control from the list-level default-split settings) is missing the gate; that is the actual Task 2 defect.
- **The bug being fixed:** today `showBalancesGrid` (page.tsx:680) is `!balancesLoadError && balances !== null` — it has no member-count term. A solo list (which always has a valid `balances` payload with empty `you_are_owed`/`you_owe` arrays and `balance_crc: "0"`) currently renders the full grid variant: `SettleControls` (the Settle button), the You are owed / You owe / Balance grid, and (since `members.length >= 3` is false anyway) no `SimplifyColumn` — so Settle + the grid are the two elements actually leaking through today for `member_count === 1`.
- **Scope boundary — do not build the solo hero.** FR-47 (spend-by-origin hero) is Story 6.2, explicitly out of this story. When chrome is suppressed for `member_count === 1`, the existing "simple" `BalanceStrip` variant (who/amount/polarity, already used today as the load-error/empty fallback) is the acceptable placeholder — it is neutral text ("Settled" / "No balances yet."), not an interactive settle control. Do not add new solo-specific copy, hero cards, or origin aggregation in this story.
- **Budgets (FR-48/49, Story 6.3+) are not introduced here.** AC #2's "budget chrome is not the primary shared UI in this epic" is a forward-looking constraint on future stories, not something to scaffold now.
- **Money/i18n/testing conventions apply as usual** (see project-context.md): no new copy needed since existing message keys (`balanceZero`, `detailSettleEmpty`, etc.) already cover the fallback strip; EN+ES already exist for those keys.
- **Test pattern:** this repo's convention (documented in project-context.md "Verified Soft-Ledger UI conventions") is to extract pure, testable logic out of the async Server Component into plain exported functions and unit-test them in a sibling `page.<feature>.test.ts` — e.g. `balanceStripPropsFrom` → `page.balanceStrip.test.ts`. Follow that exactly for `showSettleChromeFrom` (Task 3.1). Do not attempt to render `ListDetailPage` itself in a test (it is an async Server Component with `fetch`/`cookies()`, never rendered directly in this codebase's tests).

### Project Structure Notes

- Files touched: `ui/app/lists/[listId]/page.tsx` (add function + change one ternary condition), `ui/app/lists/ManualExpenseForm.tsx` (wrap one block in a conditional).
- New file: `ui/app/lists/[listId]/page.memberChrome.test.ts` (sibling to existing `page.balanceStrip.test.ts`, `page.cycles.test.ts`, etc. in the same directory).
- No new components, no new API routes, no new i18n domain files, no CSS changes.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1: Mode switch on member count] (lines 1875–1896, and duplicate summary at lines 329–333)
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-46] (line 896) — chrome follows live member count, `1` → individual-list, `≥2` → shared settle
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-50] (line 900) — second member flips chrome back to shared settle
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-29 — individual-list mode (post-v1) [ADOPTED]] (lines 241–245) — mode = live membership count, not a `list_kind` column; `member_count == 1` → spend-by-origin (Story 6.2, not this story); v1 did not implement this AD, Epic 6 is the pull
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-26-individual-list.md] — full rationale, FR/AD provenance, and explicit epic story breakdown (6.1–6.5)
- [Source: ui/app/lists/[listId]/page.tsx:680,729-774] — `showBalancesGrid` definition and the `BalanceStrip` grid/simple ternary this story modifies
- [Source: ui/app/lists/ManualExpenseForm.tsx:374-456] — the `splitBlock`/`TriSwitch` this story gates
- [Source: ui/app/lists/TemporalNavigation.tsx:85,103] and [Source: ui/app/lists/ListDetailMobileActions.tsx:74] — existing `members.length > 1` gate on default-split settings (already correct, reference only)
- [Source: _bmad-output/project-context.md#Verified Soft-Ledger UI conventions] — pure-function-in-sibling-test-file pattern to follow for `showSettleChromeFrom`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added exported pure `showSettleChromeFrom(memberCount, showBalancesGrid)` in `ui/app/lists/[listId]/page.tsx`, gating the `BalanceStrip` grid branch (You are owed / You owe / Balance grid, `SimplifyColumn`, `SettleControls`) on `member_count >= 2` on top of the existing balances-load guard. `member_count === 1` now falls through unchanged to the existing "simple" who/amount/polarity variant — no new solo copy added (that is Story 6.2 scope).
- Wrapped the `splitBlock` (`TriSwitch` + whole/percentage/absolute sub-forms) in `ui/app/lists/ManualExpenseForm.tsx` in `{members.length > 1 ? (...) : null}`. Verified (via test) `buildSplitOverride()` still returns `{ ok: true, value: undefined }` for the implicit single-member case since `mode` stays at its default `"percentage"` baseline — no special-case branching added.
- Added `ui/app/lists/[listId]/page.memberChrome.test.ts` (4 cases: `(1,true)→false`, `(2,true)→true`, `(1,false)→false`, `(2,false)→false`).
- Added 2 cases to `ui/app/lists/ManualExpenseForm.test.tsx`: split-adjust switch absent for a 1-member `members` array, present for a 2+-member array.
- Did not touch `ui/components/soft-ledger/soft-ledger.test.tsx` or `BalanceStrip` itself — only the caller's branch selection changed.
- Full suite: 75 test files / 574 tests pass, no regressions. `eslint .` clean on touched files. Pre-existing `tsc --noEmit` error on `page.tsx`'s `balanceStripPropsFrom` (Next.js route-export typing) confirmed pre-existing on `main` via `git stash` check — not introduced by this story.

### File List

- `ui/app/lists/[listId]/page.tsx` (modified)
- `ui/app/lists/ManualExpenseForm.tsx` (modified)
- `ui/app/lists/[listId]/page.memberChrome.test.ts` (new)
- `ui/app/lists/ManualExpenseForm.test.tsx` (modified)

## Change Log

- 2026-08-31: Implemented Story 6.1 — gated shared-expenses settle chrome and per-expense "Adjust split" on live member count (`member_count >= 2`); added `showSettleChromeFrom` pure function and member-chrome/split-adjust visibility tests. Status set to review.
