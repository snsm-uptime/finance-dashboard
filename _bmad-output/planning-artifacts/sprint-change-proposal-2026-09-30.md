# Sprint Change Proposal — 2026-09-30

**Triggering context:** Manual testing of `ui/app/lists/[listId]/page.tsx`'s "Move statement" action, discovered while working from an existing list detail page. Refined with a `bmad-ux` pass — see
[`ux-finance-dashboard-2026-09-30/DESIGN.md`](ux-designs/ux-finance-dashboard-2026-09-30/DESIGN.md) and
[`.../EXPERIENCE.md`](ux-designs/ux-finance-dashboard-2026-09-30/EXPERIENCE.md) (both `status: final`, accessibility-lens findings resolved).

## 1. Issue Summary

**Problem statement:** The only "move to another list" action available from a list's receipt row is `ListReceiptMenu`'s "Move statement," which calls `reassignStatement` → `POST /lists/{listId}/statements/{statementId}/reassign`. That endpoint (Story 5.3, FR-29) is **correctly implemented as designed** — it moves every ledger row tied to a statement's `batch_id` together, by intent ("batch identity does not fork or merge"). There is no path today to move a **single** ledger item to a different list while it stays linked to its originating bank statement.

**How it was discovered:** The user tried to move one out-of-place item from a bank-statement import to another list from the list detail page, and the whole statement's items moved instead — not a bug against Story 5.3's AC, but a **capability gap**: Story 5.3 never scoped single-item moves, and no other story does either.

**Second, related ask:** a way to go back and look at (and re-triage) a statement after it has already been committed, from a new `TabBar` entry point, reusing pieces of `IndividualReviewPanel`'s review UI — rather than only during the one-time upload/review flow.

**Third ask, surfaced during the UX pass:** each list detail page should get its own "Import statement" entry point that starts the upload/review flow with that list already set as the destination — instead of the destination being resolved later by card-routing config or a default-list setting.

**Evidence:**
- `ui/app/lists/ListReceiptMenu.tsx:99-111` (`confirmMove`) only calls `reassignStatement`.
- `api/application/reassign_statement.py` moves every row sharing `from_list_ids`/`batch_ids` for the statement — no per-entry filter.
- `api/application/expenses.py`'s `UpdateExpenseCommand`/`ExpenseRepository.update_ledger_entry` has no `list_id` field — editing an item never changes its list today.
- `ui/components/soft-ledger/TabBar.tsx` + `ui/components/AppShell.tsx:40-44` show tabs are a flat, easily-extended array (`home`, `budgets`, `cards`) — adding a `statements` tab is structurally cheap.
- `IndividualReviewPanel` (`ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`) is built entirely around `ImportSession`/`CandidateRow` (pre-commit), not committed `LedgerEntryRecord`s — the UX pass resolved this by scoping reuse to the card-identification/title-edit pieces only, not the swipe/four-direction interaction (see Section 4, Story 12.2).
- `ui/app/upload/UploadPanel.tsx` never lets a user pick a destination list up front — `uploadStatement(file, messages)` takes no `listId`; destination is always resolved later via card fixed-list routing or the review-routing default list (Story 4.3). No existing entry point supports "start an upload already scoped to list X."

## 2. Impact Analysis

### Epic Impact
- **Epic 5 (Import resilience)** — unaffected in its existing stories; Story 5.3 stays as-is (whole-statement reassign remains correct and needed). A **new story** (5.10) is added for single-item move.
- **Epic 4 (Statement upload & review)** — unaffected in its existing stories; a **new story** (4.17) is added for the list-scoped direct-import entry point, since it reuses the existing upload/review flow verbatim and only changes how the destination list is chosen.
- **No epic becomes obsolete.** This is additive scope, not a redefinition.
- A **new epic (12)** is needed for the statement-review/retouch surface — a new navigational surface (TabBar entry + statement list + per-statement retouch view), not a natural fit inside Epic 5's "resilience during import" framing or Epic 4's "one-time upload flow" framing.

### Story Impact
- New: **Story 5.10 — Move a single item to another list** (Epic 5).
- New: **Story 4.17 — Import statement directly into this list** (Epic 4).
- New: **Epic 12 — Statement browsing & retouch** with 2 stories:
  - **Story 12.1** — Statements tab, grouped by card/IBAN, with a period-summary step.
  - **Story 12.2** — Retouch view: a plain per-row list (not the swipe/four-direction card) with inline edit/delete/move, reusing only IndividualReviewPanel's card-identification and title-edit-in-place pieces.
- No existing story's acceptance criteria change.

### Artifact Conflicts
- **PRD/FRs:** three new functional requirements — **FR-56** (single-item move preserving statement link), **FR-57** (post-commit statement browsing/retouch surface), **FR-58** (list-scoped direct-import entry point). No existing FR is contradicted; FR-29's language governs *statement*-level reassign specifically and is unaffected.
- **Architecture:** additive only —
  - New application service (e.g. `ReassignLedgerEntryService`) alongside `ReassignStatementService` — entry-level move keeps `batch_id`/`statement_id`, re-validates split overrides/payer membership against the destination list, same invariant style as 5.3 at statement grain.
  - New API route, e.g. `POST /lists/{listId}/entries/{entryId}/reassign`.
  - New read endpoint(s) to list a user's statements (grouped by card/IBAN) and fetch one statement's committed rows for the retouch view.
  - Upload session creation gains an optional pre-bound destination `list_id` (Story 4.17) that short-circuits card-routing/default-list resolution for that session only; review-flow behavior (parse-failure, same-price-conflict, quarantine) is otherwise unchanged.
- **UI/UX — resolved by the `bmad-ux` pass, final spines linked above:**
  - `ListReceiptMenu` gets two explicit, separate move entries — "Move this item" and "Move whole statement" — each with its own confirm copy and a distinct, fully-worded `aria-label` (not a shared "Move").
  - Statements tab icon is new (none of `ui/app/icons/` fits), built in the `FileImportIcon` visual family for continuity with the upload flow.
  - Statements tab IA: grouped by card/IBAN (+ a trailing "No card"/"Manual entries" group, exposed as a real heading, not just visual grouping) → tapping a period opens a **period summary** (dates, item count, destination list, "View items") before drilling into the retouch list — not a direct jump.
  - Retouch view is a **plain per-row list** (`ReceiptRow` shell, inline edit/delete/move menu) — the swipe/four-direction/keyboard-legend model from `IndividualReviewPanel` is explicitly out of scope for retouch; only its card-identification banner and title-edit-in-place interaction are reused.
  - Accessibility: focus moves to the retouch list on entry and returns to the "View items" trigger on exit; row removal (move/delete) triggers a polite live-region announcement independent of the period summary's own count update; the list-scoped import entry's accessible name names its destination list, distinct from the global Upload button's label.

### Technical Impact
- Backend: one new service + route + repository method for single-item reassign (mirrors `reassign_statement.py`, scoped to one `entry_id`); one new read path for grouped statement browsing; one optional param on upload-session creation for the pre-bound destination list.
- Frontend: new menu action in `ListReceiptMenu`; new `/statements` route (tab, card groups, period summary, retouch list); new "Import statement" entry on the list detail page reusing the existing `UploadButton`/upload flow with a bound `listId`.
- The highest-uncertainty piece from the original proposal (how much of `IndividualReviewPanel` genuinely transfers to retouch) is now resolved: very little of its *interaction* model transfers — only its identification/title-edit sub-components — which lowers Story 12.2's implementation risk relative to the original open question.

## 3. Recommended Approach

**Direct Adjustment** — add new stories within the existing epic/backlog structure. No rollback, no MVP scope reduction; PRD needs three new FR entries, not a rewrite.

- Effort: **Medium** for 5.10 and 4.17 (both mirror existing, well-understood patterns — statement reassign and the existing upload/review flow, respectively). **Medium** for Epic 12 (now that the UX pass ruled out reusing the swipe interaction, 12.2 is a more conventional list-with-menu build, not a novel interaction adaptation).
- Risk: **Low** across all three — 5.10 and 4.17 reuse existing, tested backend/UI patterns; 12.2's scope is now well-bounded by the finalized EXPERIENCE.md (plain list, no swipe gesture, accessibility requirements spelled out).
- Timeline impact: additive backlog growth; does not block or reorder Epic 4/5's remaining stories or other in-flight epics.

## 4. Detailed Change Proposals

### PRD — new Functional Requirements

```
FR-56: A list member can move a single ledger item (not the whole statement) to another
list they belong to; the item keeps its originating statement_id/batch_id, and split
allocations follow destination-list default rules unless item-level overrides already
exist (same continuity rule as FR-29).

FR-57: A user can browse their previously-imported bank statements, grouped by card,
from a dedicated tab; opening one shows a period summary before drilling into a
retouch list where committed items can be edited, deleted, or moved individually.

FR-58: From a list's detail page, a user can start an import whose destination list is
that page's list, without going through card-routing or default-list resolution; the
statement still passes through the normal review flow (parse, comparison,
individual/bulk review) unchanged.
```

Rationale: all three are net-new capabilities the current FR list (FR-1..FR-55/AD-*) does not cover; FR-29 explicitly governs statement-grain reassignment only, and Story 4.3's routing/default-list mechanism has no "explicit per-launch override" path today.

### Epic 5 — new Story 5.10

```
### Story 5.10: Move a single item to another list

As a list member,
I want to move one ledger item to a different list I belong to,
So that a single mis-filed transaction can be corrected without disturbing the rest
of its bank statement's items.

**Acceptance Criteria:**

**Given** a committed ledger item on list A that originated from a statement (or was
entered by hand)
**When** I move it to list B that I belong to
**Then** only that item moves — its statement_id and batch_id are unchanged, and every
other item from the same statement/batch stays on list A
**And** balances on both lists reflect the move (FR-56)
**And** share allocations on the moved item follow list B's default split rules unless
an item-level override already exists (FR-56, FR-9/10 continuity)

**Given** I am not a member of the destination list
**When** I attempt the move
**Then** the action is rejected (NFR-3), mirroring Story 5.3's ACL check

**Given** the list detail page's per-row menu, on a row that belongs to a statement
**When** I open it
**Then** I see two distinct actions — "Move this item" and "Move whole statement" —
each with its own confirm copy naming what will move, and each with a distinct,
fully-worded aria-label (never a shared "Move") so they're distinguishable to
assistive tech, not just visually — the existing statement-reassign action
(Story 5.3) is not replaced, only joined
```

OLD (`ListReceiptMenu.tsx` messages): `moveStatementLabel` is the only move action offered.
NEW: add `moveItemLabel` as a sibling action with its own `aria-label` and confirm copy; `moveStatementLabel` stays for the existing whole-statement flow.

### Epic 4 — new Story 4.17

```
### Story 4.17: Import statement directly into this list

As a list member,
I want to start a statement import right from a list's detail page,
So that I don't have to rely on card-routing or a default-list setting to land a
statement where I already know it belongs.

**Acceptance Criteria:**

**Given** I am viewing a list's detail page
**When** I activate its "Import statement" entry point
**Then** the existing upload/review flow opens (parse, comparison, individual/bulk
review) exactly as it does from the global Upload entry — no destination-list
picker step is shown or needed, because this list is already the destination (FR-58)

**Given** a statement imported this way
**When** parse failures, same-price conflicts, or quarantine would normally apply
**Then** they apply identically to today's behavior — this entry point changes only
how the destination list is chosen, nothing about review/safety behavior

**Given** the list detail page's "Import statement" control
**When** a screen-reader user encounters it alongside the app's global Upload control
**Then** its accessible name names the destination list (e.g. "Import statement to
{list name}"), distinct from the global Upload button's label
```

### New Epic 12 — Statement browsing & retouch

```
## Epic 12: Statement browsing & retouch

Adds a persistent way to look back at previously-imported bank statements after their
one-time upload/review flow is done, and retouch (edit/delete/move) their committed
items via a plain, accessible list — reusing only the identification and
title-edit-in-place pieces of the import review experience, not its swipe interaction.
**FRs covered:** FR-57 (new 2026-09-30)
**Demo gate:** from the TabBar, a user opens a past statement's period summary, views
its items, and edits/moves/deletes one of them; every list involved reflects the
change immediately

### Story 12.1: Statements tab + statement list surface

As a user,
I want a "Statements" tab in the app's bottom navigation,
So that I can find and revisit any bank statement I've previously imported.

**Acceptance Criteria:**
- A new TabBar entry ("Statements") is visible alongside Home/Budgets/Cards, backed
  by a new icon in the FileImportIcon visual family.
- Activating it shows statements grouped by card/IBAN (mirroring the Cards panel's
  grouping), most-recent period first per group; statements with no card get their
  own "No card"/"Manual entries" group — each group exposed as a real heading, not
  just a visual section break.
- Selecting a period opens a period-summary screen (dates, item count, destination
  list(s), "View items" action) — not a direct jump into the retouch list.
- "View items" opens the statement's retouch view (Story 12.2); on entry, focus
  moves to the retouch list; backing out returns focus to the "View items" trigger.

### Story 12.2: Retouch a committed statement's items

As a user,
I want to revisit a statement I already committed and adjust its items,
So that I can fix mistakes noticed after the fact without re-uploading.

**Acceptance Criteria:**
- The retouch view is a plain, scrollable per-row list (ReceiptRow shell) — not the
  four-direction swipe card; each row has an inline menu (edit / delete / move).
- Only IndividualReviewPanel's card-identification banner and title-edit-in-place
  interaction are reused; no swipe gesture or directional keyboard legend is
  introduced here.
- From this view a user can edit an item's description/amount details (existing edit
  path), delete an item (existing delete path), or move a single item to another list
  (Story 5.10, same "Move this item" label/confirm copy — no third move string) without
  leaving the statement view.
- Removing a row (move or delete) triggers a polite live-region announcement on the
  retouch list ("Item moved to {list}" / "Item deleted"), independent of the period
  summary's own item-count update; if the statement reaches zero items, its period
  summary still shows rather than disappearing.
- Actions taken here immediately reflect on every list's Soft-Ledger balance affected
  (same balance path as Epic 3/4/5 — no parallel settle math).
```

## 5. Implementation Handoff

**Scope classification: Moderate** — backlog reorganization (two new stories in
existing epics, one new epic with two stories) plus three new FRs; no PRD MVP
redefinition, no architecture rewrite, no rollback. The `bmad-ux` pass is complete
(spines finalized, accessibility-lens findings resolved), so the earlier open UX
question is closed and no further design work blocks story-sizing.

- **Route to:** Product Owner / Developer (Sebas, wearing both hats) for backlog
  placement and `bmad-create-story`/dev sizing of all four stories — none are held
  for further UX work.
- **Deliverables produced by this proposal:**
  - FR-56 / FR-57 / FR-58 additions to the PRD's FR inventory and FR Coverage Map.
  - Story 5.10 added to Epic 5, Story 4.17 added to Epic 4, in `epics.md`.
  - New Epic 12 with Stories 12.1/12.2 added to `epics.md`.
  - Finalized `DESIGN.md`/`EXPERIENCE.md` delta at
    `ux-designs/ux-finance-dashboard-2026-09-30/`.
- **Success criteria:** `epics.md`'s FR Coverage Map accounts for FR-56/57/58; all
  four stories (5.10, 4.17, 12.1, 12.2) are independently dev-ready as written,
  referencing the finalized UX spines for their UI acceptance criteria.
```
