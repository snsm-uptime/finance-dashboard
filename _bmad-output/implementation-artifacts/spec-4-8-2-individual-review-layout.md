---
title: 'Story 4.8.2: Individual review layout — card + file + list selection'
type: 'feature'
created: '2026-08-20'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: 'f7388e4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The individual review screen currently shows card identification, file details, and list selection scattered across separate sections. Users need a clear, organized view that leads with the matched/created card, then file info, then action buttons.

**Approach:** Restructure the IndividualReviewPanel to display identified card prominently at top, followed by file name and row count, with action buttons simplified to "Add to default" (button) and "Choose list" (dropdown). Hide secondary actions.

## Boundaries & Constraints

**Always:**
- Card info is the primary focus — shown first, clearly labeled
- File name and transaction count displayed inline below card
- Action buttons: "Add to default" (primary button) + "Choose list" (dropdown select)
- "Add to default" button is hidden when no default list exists
- Layout follows existing soft-ledger card styling (rounded border, padding, colors)
- Same information (card, file, row count) available in both bulk and individual flows

**Ask First:**
- Should the card be clickable/editable, or display-only after identification?

**Never:**
- Do not remove card identification logic or blocking of accept
- Do not change list selection backend behavior
- Do not hide the card info once identified

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Identified known card | IBAN matched to "My Visa" | Card: My Visa displayed at top | N/A |
| Newly registered card | User registered "New Card" for unknown IBAN | Card: New Card displayed at top | N/A |
| No default list set | User opens review, no default_import_list_id | "Add to default" button hidden | N/A |
| Has default list | User opens review, default_import_list_id set | "Add to default" button shown, enabled | N/A |
| Multi-statement session | 3 statements in session | Card info updates as user navigates between statements | N/A |

</frozen-after-approval>

## Code Map

- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` — restructure card/file/buttons layout
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx` — verify layout display (if exists)
- `ui/lib/i18n/upload.ts` — may need label updates for new layout

## Tasks & Acceptance

**Execution:**

- [x] `IndividualReviewPanel.tsx` -- Restructure to group card info (label), file/row-count, and action buttons into a cohesive card view. Current card showing product_id → replace with identified card name. Rationale: Users need clear visual hierarchy focused on card identity.

- [x] `IndividualReviewPanel.tsx` -- Hide "Add to default" button when `defaultListId` is empty. Show it enabled when default exists. Rationale: Avoid confusing actions with no target.

- [x] `IndividualReviewPanel.tsx` -- Ensure "Choose list" dropdown is always visible and primary action for list selection. Rationale: Explicit choice is clearer than implicit default.

- [x] Tests (if applicable) -- Update or add tests verifying card label displays, file info shows, buttons render correctly in both scenarios (with/without default list).

**Acceptance Criteria:**

- Given a statement with identified card, when the review screen loads, then the card label is displayed prominently at the top (e.g., "Card: My Visa").
- Given the same statement, when looking below the card, then the file name and transaction count are visible (e.g., "BAC_CRED_ECO_jan.pdf [1]").
- Given a user with a configured default list, when the review screen loads, then "Add to default" button is visible and enabled.
- Given a user with no default list, when the review screen loads, then "Add to default" button is hidden; only "Choose list" dropdown is available.
- Given both buttons visible, when the user clicks "Add to default", then the default list is selected and accept flow proceeds.
- Given "Choose list" dropdown, when the user opens it, then the same list options display as before (no backend change).

## Design Notes

**Layout structure (top to bottom):**
1. Progress indicator (existing, unchanged)
2. Card identification section (new/updated):
   - Label: "Card:"
   - Value: Card name (from identified card)
3. File information (new/updated):
   - File name + transaction count (from current.product_id, current.candidate_row_count)
4. List selection section (restructured):
   - Label: "Choose list" (same as before)
   - Dropdown: all lists (same as before)
5. Action buttons (restructured):
   - Primary: "Add to default" (hidden if no default; enabled/disabled based on state)
   - Secondary: "Choose list" + "Accept to [list name]" (existing buttons, unchanged logic)
6. Skip button (existing, unchanged)

No new colors, tokens, or design primitives needed — reuse existing soft-ledger spacing and card styling.

## Verification

**Manual checks:**

- Open individual review with identified card → card name displays at top
- Check file name and count below card info
- With default list: "Add to default" button visible
- Without default list: "Add to default" button hidden
- "Choose list" dropdown works as before
- Both accept paths (default + choose) proceed correctly

