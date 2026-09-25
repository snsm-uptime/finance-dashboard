# Sprint Change Proposal — 2026-09-24

## 1. Issue Summary

Two related UX issues were identified during ad-hoc review of the card-import review flow, not tied to a specific open story:

1. **Inconsistent multiselect support**: `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` ("assign to list" page, reached via `SessionReviewPanel`'s "Assign to list" button) only supports one-row-at-a-time actions (a per-row "move to list" dropdown and per-row delete). `ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx` (used from the individual-review flow) already implements a multiselect pattern — checkbox selection plus a sticky bulk-action bar for "Discard" / "Change list" — that solves the same underlying need: letting the user redirect a handful of rows to a different list than the rest of the batch.
2. **"New Card" bug**: in `ui/app/upload/SessionReviewPanel.tsx`'s `StatementCard` (and mirrored in `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`), the condition gating the editable card-name input checks `!statement.card_id` instead of whether the card actually has a label. When a statement's auto-detected card already has a `card_id` but no real label (e.g. an auto-created/unlabeled card), the gate resolves false, so the static fallback text (`t.newCardTitle`, "New Card") renders instead of the input — permanently, with no way to name the card.

## 2. Impact Analysis

- **Epic impact**: None. Both are implementation-level fixes to already-built screens (Story 4.7 assign-to-list flow, Story 4.13.1 individual-review sheet); no epic scope, sequencing, or acceptance criteria change.
- **Story impact**: No new stories required; changes are scoped to existing components.
- **Artifact conflicts**: None found in PRD, epics, architecture, or a dedicated UX spec for these two screens — no planning documents need edits.
- **Technical impact**: Two isolated frontend code changes, no backend/API/data-model changes, no migration.

## 3. Recommended Approach

**Direct Adjustment** (Option 1) — both issues are addressed by editing existing components in place. Effort: Low. Risk: Low (no data model, API, or navigation changes; purely presentational/interaction logic).

## 4. Detailed Change Proposals

### 4.1 Fix "New Card" registration gate

**File:** `ui/app/upload/SessionReviewPanel.tsx` (`StatementCard`)
```
OLD:
const needsRegistration =
  card.needsRegistration ||
  (!card.cardMatched && Boolean(statement.iban) && !statement.card_id);

NEW:
const needsRegistration =
  card.needsRegistration ||
  (!card.cardMatched && Boolean(statement.iban) && !card.cardLabel);
```

**File:** `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`
```
OLD:
const needsCardRegistration =
  card.needsRegistration ||
  (!card.cardMatched && Boolean(current?.statement.iban) && !current?.statement.card_id);

NEW:
const needsCardRegistration =
  card.needsRegistration ||
  (!card.cardMatched && Boolean(current?.statement.iban) && !card.cardLabel);
```

Justification: gates the editable name input on whether the card has an actual label, not on whether any `card_id` happens to be linked — fixes the case where an auto-created, unlabeled card permanently shows the static "New Card" text.

### 4.2 Reuse the multiselect sheet pattern in `BulkReviewPanel.tsx`

**File:** `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx`

Add checkbox selection (`SoftLedgerRadio type="checkbox"`, mirroring `ImportReviewSheet.tsx`) to each `PendingRowItem`, track `selectedIds` state, and render a sticky selection bar (styled like `ImportReviewSheet`'s `STICKY_BUTTON_CLASS` bar) above the row list when `selectedIds.size > 0`, offering:
- bulk delete (loops `deleteRow` per selected id, mirrors `ImportReviewSheet.saveAction`'s per-id loop)
- bulk "move to list" via a `SoftLedgerSelect` (loops `assignRow` per selected id, mirrors `ImportReviewSheet.changeListAction`)

Existing per-row single-item move/delete controls are kept for the common single-row case; the primary "fixed list for the whole batch" flow and commit button are unchanged.

Justification: reuses the interaction pattern already validated in individual review instead of introducing a new one, and directly enables the "multiselect items to change to list" capability requested.

## 5. Implementation Handoff

**Scope classification: Minor** — both changes are direct, self-contained code edits with no backlog reorganization or replanning needed.

**Route to:** Developer agent, for direct implementation.

**Deliverables:**
- `SessionReviewPanel.tsx` and `IndividualReviewPanel.tsx`: updated `needsRegistration` / `needsCardRegistration` gate (4.1)
- `BulkReviewPanel.tsx`: checkbox multiselect + sticky bulk-action bar for the pending-rows list (4.2)

**Success criteria:**
- A statement whose card has a `card_id` but no label shows the editable name input, not static "New Card" text, on both the session-review card and the individual-review card.
- On the "assign to list" page, selecting multiple pending rows surfaces a bulk action bar that can delete or move all selected rows to a chosen list in one action, without disrupting the existing single-row controls or the primary fixed-list commit flow.
