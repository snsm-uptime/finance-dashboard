---
date: 2026-09-23
trigger: Sebas's UX feedback after using an ad-hoc "manual entry" feature built during the Story 4.9.2 code-review session
scope: Direct Adjustment (Option 1)
---

# Sprint Change Proposal: Manual entry on the parse-failure surface (2026-09-23)

## 1. Issue Summary

During the same session as Story 4.9.2's code review (real Promerica adapter), a "manually add an expense for a failed statement" capability was built ad hoc against `ParseComparisonPanel` (Story 5.1's PDF-vs-extracted-items comparison surface). It was never a formally specced story — it was implemented reactively in response to a `/debug` detour.

The implementation used two patterns that don't fit, per Sebas's direct feedback after using it:

1. **A `Sheet` (bottom-sheet overlay)** wrapping the form — `ParseComparisonPanel` is already a dedicated full-screen review surface, not a small list-detail page where a Sheet overlay makes sense. Stacking a second overlay on top of the existing surface is the wrong pattern.
2. **List-first gating** — the expense form's fields (amount, description, currency, date, payer, split) were only rendered once a list was picked, because `ManualExpenseForm` needs `members`/`currentUserId` to render its payer/split controls. This traded away visible form fields for implementation convenience.

## 2. Impact Analysis

### Epic Impact

Epic 5 (parse failure/quarantine/hand-fix) is unaffected in scope or sequencing — this is a pure addition, not a redefinition. Story 5.2's own AC text already anticipated "a manual expense entry (FR-21)" as the intended path for a failed statement's data; this proposal formalizes wiring that path directly into the comparison surface with a fitting layout, rather than leaving it as a separate detour.

### Story Impact

- New story **5.2.1 — Manually enter a failed statement**, inserted after 5.2 (Dismiss), matching this codebase's existing decimal-insertion convention (e.g. 4.9.1/4.9.2).
- No other stories change.

### Artifact Conflicts

- **PRD:** new **FR-55** added (parse-failure inline manual entry). PRD's FR list now runs through FR-55 (`epics.md`'s own summary block is stale at FR-50 and was not touched — it tracks loosely, per repo convention, with the PRD as canonical source).
- **Architecture:** none. Reuses the existing `POST /lists/{id}/expenses` contract, including the `posted_date` field already shipped alongside the original ad-hoc build. No new AD.
- **UI/UX (`DESIGN.md`/`EXPERIENCE.md`):** none. The corrected layout stays within FR-25's existing "PDF beside items, phone PDF lower half" pattern — it reuses that same screen real estate for the form instead of introducing a new surface.

### Technical Impact

- `ManualEntrySheet.tsx` (the `Sheet`-based component) is removed and replaced by an inline layout owned by `ParseComparisonPanel.tsx` itself (no new top-level route/page).
- `ManualExpenseForm.tsx` needs to tolerate rendering with an empty `members` array (payer/split inert, not hidden, until a list is chosen) — a real but contained change to that component's existing assumptions.
- No backend changes — the `posted_date`/currency groundwork already shipped is reused as-is.

## 3. Recommended Approach

**Direct Adjustment (Option 1).** This is a scoped UI-layout correction to code that shipped within the last session, not a rollback candidate (the backend `posted_date` work and `ManualExpenseForm` currency/date fields are correct and stay) and not an MVP/PRD-goal conflict.

- Effort: **Low** — mostly UI recomposition of an existing, working feature; no new backend surface.
- Risk: **Low** — isolated to `ParseComparisonPanel`/`ManualExpenseForm`; existing tests for both already establish a regression baseline.

## 4. Detailed Change Proposals

### PRD (`prds/prd-finance-helper-2026-08-02/prd.md`)

**Added FR-55** (after FR-54):

> On the parse-failure comparison surface (FR-25), the user can hand-enter the failed statement's transaction as a manual expense (FR-21) inline, without leaving the surface. Desktop shows a third column (extracted items | original PDF | manual-entry form) alongside the existing two; phone swaps the extracted-items region for the form (PDF stays fixed in the lower half, unaffected — FR-25). The form is visible in full immediately, pre-filled from whatever the failed parse's evidence already extracted (description/amount/currency/date, per row); it is not gated behind picking a list first — payer/split fields populate once a list is chosen. Submitting creates the expense and dismisses the statement (FR-26) in one action. A back/close control returns to the prior view (extracted items on phone, two-column on desktop) without dismissing anything.

### Epics (`epics.md`)

**Added Story 5.2.1** (after Story 5.2, before Story 5.3) — full text and 6 ACs, see `epics.md`. Summary of the layout decisions it encodes (from this session's Q&A with Sebas):

| Decision | Chosen |
|---|---|
| Where the form lives | No overlay. Desktop: third column (items \| PDF \| form). Mobile: swaps the top (items) region; PDF stays fixed lower-half. |
| List-gating | Every field visible immediately; payer/split populate once a list is chosen, not hidden before. |
| Back/cancel | A back/close control on the form section returns to the prior view without dismissing the statement — symmetric on both platforms. |
| Submit behavior | Unchanged from the ad-hoc build: creates the expense, then also dismisses the statement, in one action. |
| Pre-fill | Unchanged: amount/description/currency/date pre-filled from the statement's `parse_evidence` first row item, when present. |

### Sprint tracking (`sprint-status.yaml`)

Added `5-2-1-manually-enter-a-failed-statement: ready-for-dev` under Epic 5, with a comment explaining the retroactive-story rationale.

## 5. Implementation Handoff

**Scope classification: Minor.** Direct implementation by the Developer agent — no PO/DEV backlog reorg, no PM/Architect replan.

- **Next step:** create the dev-ready story file (`_bmad-output/implementation-artifacts/5-2-1-manually-enter-a-failed-statement.md`) via the normal `create-story` flow, then implement directly against this session's context (the ad-hoc `ManualEntrySheet.tsx`/`ManualExpenseForm.tsx` code already exists and mostly needs recomposition, not a rewrite).
- **Success criteria:** Story 5.2.1's 6 ACs hold; existing `ManualExpenseForm`/`ParseComparisonPanel` test suites stay green; new tests cover the inline desktop/mobile layouts and the empty-members render state.
