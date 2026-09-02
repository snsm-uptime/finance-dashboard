# Sprint Change Proposal — 2026-09-02

## 1. Issue Summary

After merging PR #107/#108 (`feat/budget-detail-crud-and-viewer-share` — budget update/delete endpoints, viewer share on history lines, bulk multi-select assign, budget detail chrome), the user reviewed a personal backlog note (`ui/todo.md`) written before that work and identified several ideas that overlap with Epic 7 (budgets as a standalone entity) plus one unrelated UI polish item. This is not a technical failure or a misunderstanding of requirements — it is new scope emerging from a backlog review, to be folded into the plan as new stories.

`ui/todo.md` contained 5 ideas. Triage against current epics:

| # | Idea | Epic |
|---|------|------|
| 1 | `PercentageSplitTrack.tsx`: center avatars, show muted bar at original position | Epic 3 (`done`) — split UI lives in Story 3.2 |
| 2 | Budgets: progress bar instead of colored circle, with tooltip, used on list + detail | Epic 7 |
| 3 | Budgets: date-range period; only assign in-period transactions; remove out-of-bounds on period change | Epic 7 |
| 4 | Archive budgets, lists, cards; box-icon toggle with auto-reset on navigation | Epic 7 (budgets only, in this proposal) |
| 5 | Statement upload: Promerica Credit, BAC Debit | Epic 4/5 — **out of scope for this proposal** |

Item 4's list/card archiving is cross-cutting and deferred (noted in epics.md, no story created yet). Item 5 belongs to the bank-adapter epics and is untouched here.

## 2. Impact Analysis

**Epic Impact:**
- **Epic 7** (`in-progress`, 7.1–7.3 already `review`/`done`) gains three new stories: 7.4, 7.5, 7.6. None of the existing 7.1–7.3 ACs are invalidated — purely additive.
- **Epic 3** (`done`) gains one appended polish story, 3.7 — same pattern already used elsewhere in this project for post-hoc amendment stories (e.g. Epic 4's inserted 4.13.1).
- No other epic is invalidated, resequenced, or blocked by this change.

**Artifact Conflicts:**
- **PRD:** FR-48 needs a short amendment to mention the optional period. A new FR-51 is needed for budget archiving (no existing FR covers archiving anything in this project).
- **Architecture:** minor — budget schema gains optional `period_start`/`period_end` and an `archived_at` (or `is_archived`) column; no port/adapter/pattern changes.
- **UX/UI:** BudgetsPanel tile visual changes (top-border bar replacing circle), a new reusable `TopProgressBar`-style component, a confirmation Sheet pattern (reused from existing Sheet conventions), and a box-icon toggle. No conflicts with DESIGN.md/EXPERIENCE.md spines — additive within Warm Balance/Soft-Ledger tokens.
- **Other artifacts:** no CI/deploy/infra impact. Testing strategy: standard UI test-after + API unit tests for the new date-bound assignment/rule-matching logic (must-cover edge: period narrowed to exclude previously-rule-matched lines).

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment.** Add 4 new stories (7.4, 7.5, 7.6, 3.7) within the existing epic structure; no rollback, no MVP scope change (this is all post-v1, Epic 7 already post-v1).

- Effort estimate: Medium (7.5 is the heaviest — schema change + confirmation-Sheet flow + rule re-evaluation on period change).
- Risk: Low — additive, no changes to already-`done` ACs, no rollback of merged work.

## 4. Detailed Change Proposals

### 4.1 PRD amendment — FR-48

**OLD:**
> **FR-48:** **Budgets** tab: named budgets with caps and near-cap treatment, **independent of any single list**. Each budget selects one or more lists (from any list the user belongs to) as its **spend sources**. Budget **detail** shows cap and **related transaction history** pulled from all source lists. *(Amended 2026-09-01 — see Sprint Change Proposal 2026-09-01.)*

**NEW:**
> **FR-48:** **Budgets** tab: named budgets with caps and near-cap treatment, **independent of any single list**. Each budget selects one or more lists (from any list the user belongs to) as its **spend sources**. Budget **detail** shows cap and **related transaction history** pulled from all source lists. A budget **may optionally** carry a date-range period (`from`/`to`); when set, only transactions posted within that range are eligible for attribution, and narrowing/setting the period requires explicit confirmation of any lines it will unassign. *(Amended 2026-09-01, 2026-09-02 — see Sprint Change Proposal 2026-09-02.)*

Rationale: Story 7.5 (period range) is a direct FR-48 extension — same FR family as the multi-source-list amendment.

### 4.2 PRD addition — new FR-51

> **FR-51:** A budget owner can **archive** a budget. Archived budgets are hidden from the default `/budgets` view and excluded from create-form interactions; a toggle (box icon) switches the view to archived-only, resetting to non-archived on navigation away. Archiving preserves all budget data and history and is reversible (unarchive). *(New 2026-09-02 — see Sprint Change Proposal 2026-09-02.)*

Rationale: no existing FR covers archiving anything in this project; this scopes it to budgets only per this proposal's boundary (lists/cards archiving deferred, see 4.5).

### 4.3 Epics.md — Epic 7 section update

Update the Epic 7 header FRs line and append three stories after 7.3:

**OLD header line:**
> **FRs covered:** FR-48, FR-49 (amended 2026-09-01), FR-50 (amended 2026-09-01)

**NEW header line:**
> **FRs covered:** FR-48 (amended 2026-09-01, 2026-09-02), FR-49 (amended 2026-09-01), FR-50 (amended 2026-09-01), FR-51 (new 2026-09-02)

**New stories appended after Story 7.3** (full text — approved with the user, incremental mode):

---

#### Story 7.4: Budget progress-bar visualization

As a budget owner, I want the budget's cap progress shown as a thin bar instead of a colored circle — on the tile's top border in the budgets list, and as a full-width bar at the very top of the budget detail page — with a hover/focus tooltip showing current/total,
So that I can read near-cap state at a glance, and the app gets a reusable top-of-page progress affordance for future use (e.g. import progress, CSV export).

**Acceptance Criteria:**

**Given** `BudgetsPanel.tsx` renders a budget tile
**When** it shows spend against the cap
**Then** the colored circle is replaced by a thin progress bar along the top border of the tile card, using the same severity colors (near-cap/over-cap) as today

**Given** a user hovers (or focuses, for keyboard/a11y) a tile's top-border bar
**When** the pointer/focus rests on it
**Then** a tooltip shows "current/total" formatted in the budget's currency

**Given** `/budgets/[budgetId]/page.tsx`
**When** the page renders
**Then** a full-width progress bar spans the very top of the page (above `BudgetDetailChrome`), reflecting this budget's cap usage with the same severity coloring, and is reachable/focusable for the same current/total tooltip

**Given** this top-of-page bar is introduced
**When** it's implemented
**Then** it's built as a generic, reusable component (e.g. `TopProgressBar`) parameterized by ratio/color/tooltip — not hardcoded to budgets — so a later story can reuse it for import/export progress without rework

**Given** the previous bottom-of-card placement idea
**When** this story lands
**Then** no bottom-of-card bar is added — the cap card on detail keeps its existing content, only the page-top bar communicates progress

**Given** the budget detail page
**When** the source-list chips render
**Then** they appear below the cap card (not beside or above it)

#### Story 7.5: Budget period range

As a budget owner, I want to optionally set a date-range period (from/to) on a budget via a date-range picker in the create/update form,
So that spend and attribution can be scoped to a specific window when I choose to set one.

**Acceptance Criteria:**

**Given** the budget create or update form
**When** I open it
**Then** it includes an optional date-range picker (from/to); leaving it unset keeps the budget open-ended (no date bound), matching today's behavior

**Given** a budget with a period set
**When** a transaction is considered for manual assignment or rule-matching in any of its source lists
**Then** only transactions posted within `[from, to]` are eligible; out-of-period transactions are not offered/attributed

**Given** an existing budget (open-ended or already period-bound)
**When** the owner changes the period (narrows `from`/`to`, or sets a period for the first time) such that some already-assigned lines fall outside the new bounds
**Then** before applying the change, a confirmation Sheet lists exactly which assigned lines will be removed from the budget, and the change is only applied on explicit confirm (irreversible, so no silent removal)

**Given** the owner confirms a period change that excludes lines
**When** the change is applied
**Then** those lines are unassigned from the budget (manual assignment and rule attribution both cleared for those lines) and detail/history/spend immediately reflect the new period only

**Given** the owner cancels out of the confirmation Sheet
**When** they do so
**Then** the period change is discarded and the budget keeps its previous period/state

**Given** budgets created before this story (Epic 6/7.1 migration)
**When** this story ships
**Then** they default to open-ended (no period), no data loss, no forced backfill

#### Story 7.6: Archive budgets

As a budget owner, I want to archive a budget and toggle a filtered "archived" view via a box icon on the budgets page, so I can hide budgets I no longer track without deleting their history.

**Acceptance Criteria:**

**Given** the `/budgets` page title
**When** the page renders
**Then** a box icon appears at the opposite end of the title, acting as a toggle (closed box = showing active budgets, open box = showing archived budgets)

**Given** the toggle is OFF (closed box)
**When** the page renders
**Then** only non-archived budgets are shown, and the create form is visible as today

**Given** the user clicks the toggle to turn it ON
**When** it activates
**Then** the icon morphs to an open box, the list filters to archived budgets only, and the create form is hidden

**Given** the toggle is ON
**When** the user clicks it again
**Then** it morphs back to closed, and the view returns to non-archived budgets with the create form visible

**Given** the toggle is ON
**When** the user navigates away from `/budgets` to a different screen
**Then** the toggle resets to OFF; returning to `/budgets` later shows non-archived budgets by default

**Given** a budget (from the list tile or its detail page)
**When** the owner archives it
**Then** it's excluded from the default (non-archived) view, its data/history is preserved, and it can be unarchived from the archived view

**Given** this story
**When** scope is considered
**Then** archiving lists and cards (also mentioned in the originating backlog note) is out of scope here — tracked as a deferred note in epics.md, not a story in this epic

---

**Sequencing note to add to Epic 7:** Stories 7.4–7.6 build after 7.1–7.3 (no reordering); 7.4 is independent UI-only and can parallelize with 7.5/7.6; 7.6 (archive) should land after 7.5 (period range) since both touch the budget update form.

### 4.4 Epics.md — Epic 3 addendum

Epic 3 is `done`. Append, using the project's existing convention for post-hoc amendment stories (cf. Epic 4's inserted 4.13.1):

> **Amendment (2026-09-02):** Story 3.7 is appended as a UI polish addendum — see Sprint Change Proposal 2026-09-02. Does not reopen 3.1–3.6 ACs.

#### Story 3.7: Percentage split track — centered avatars + default-position reference bar

As a user adjusting a percentage split, I want each member's avatar centered under its own segment, and a muted bar showing where the list's default split originally was, so I can see how far I've moved from the default at a glance.

**Acceptance Criteria:**

**Given** `PercentageSplitTrack.tsx` renders member avatars below the track
**When** it lays them out
**Then** each avatar is horizontally centered relative to the width of its own segment's div, not left-aligned within a flex row

**Given** a member's percentage differs from the list's current default split (Story 2.5/2.6 default)
**When** the track renders
**Then** a muted bar renders at the position corresponding to the original default split, as a visual reference against the current custom position

**Given** a member's percentage equals the list default
**When** the track renders
**Then** no muted reference bar is shown for that segment (nothing to contrast against)

**Given** this is a UI-only refinement
**When** implemented
**Then** no changes to FR-9/FR-10, the split-sum-to-100 validation, or `orderPercentageSplitUserIds` ordering logic

### 4.5 Deferred note (no story yet)

Add to epics.md near Epic 7, as a deferral marker (matches existing convention, e.g. the 2026-08-26 individual-list deferral note):

> **Deferred (2026-09-02):** Archiving for **lists** and **cards** (raised alongside Story 7.6's budget archiving) is out of scope for Epic 7. No FR or story yet — revisit in a future correct-course once budget archiving (7.6) ships and the box-icon toggle pattern is validated.

### 4.6 sprint-status.yaml update

Add under the Epic 7 block:

```yaml
  7-4-budget-progress-bar-visualization: backlog
  7-5-budget-period-range: backlog
  7-6-archive-budgets: backlog
```

Add under the Epic 3 block (find existing `3-6-...` entry and append after it):

```yaml
  3-7-percentage-split-avatar-centering-and-reference-bar: backlog
```

## 5. Implementation Handoff

**Scope classification: Moderate** — requires backlog reorganization (epics.md edits, FR-48 amendment + new FR-51, sprint-status.yaml entries) before story-level dev work starts. Once artifacts are updated, each story is independently sized for direct Developer-agent implementation (`bmad-create-story` → `bmad-dev-story`).

- **Product Owner / Developer:** apply the epics.md, PRD, and sprint-status.yaml edits in Section 4 (this proposal, once approved).
- **Developer agent:** implement 7.4 → 7.5 → 7.6 → 3.7 (7.4 can run in parallel with 7.5/7.6 prep since it's UI-only; 3.7 is fully independent and can run anytime).
- **Success criteria:** each story's ACs pass as written; Epic 7 demo gate (unaffected, still: budget sourcing two lists shows combined near-cap state, Rule badge behavior, non-owner cannot see budget) remains valid after 7.4–7.6 land.

## Approval

Approved by Sebas on 2026-09-02, incremental mode — stories 7.4, 7.5, 7.6, 3.7 individually reviewed and approved before compiling this proposal.
