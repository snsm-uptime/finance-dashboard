# Sprint Change Proposal — 2026-08-21

**Trigger:** Story 4.11 code review. Last pending assign/delete must not end the session or release the source PDF. The operator wants **ImportReviewSheet**: assigned items grouped by destination list, **per-row discard**, **one Save** at the bottom. Discard returns that row to card review; when the pending queue is empty again, the sheet opens again, until Save.

## 1. Issue Summary

**Problem:** The individual-review loop treats “no pending rows” as session complete. That skips a grouped validation step and (in current code) can idle-release the PDF via `_release_source_pdf_if_idle` before the user has confirmed placements.

**Intended loop (operator, this session):**

1. 4.13 card until the pending queue is empty.
2. **ImportReviewSheet** opens. PDF **stays**.
3. One **Save** at the bottom finalizes the session (PDF may then delete per AD-3; 4.14 summary; 4.12 land).
4. **Discard is per row**, not sheet-level. Discarded row → `pending`, ledger reverse (same hard-delete as undo-assign).
5. If any pending rows remain, 4.13 resumes in original `sequence`. When pending is empty again, **the sheet opens again**. Repeat until Save.

**Discovered by:** 4.11 code review (2026-08-21), then product correction in Correct Course: last-row is **not** PDF-drop; the sheet is the confirm gate.

**Ledger default:** Keep 4.10/4.11 `done`. Assign still writes a ledger row. Save **confirms** (finalizes). Sheet discard **reverses** that row. Do not defer ledger writes until Save.

## 2. Impact Analysis

**Epic impact:** Epic 4 remains completable. **No new epic.** Insert **Story 4.13.1** between 4.13 and 4.14. Epic 5 unchanged except that 5.2’s “PDF delete follows 4.12 clean-commit” now means **after Save**, not after last-card. No epic resequence.

**Story impact:**

| Story | Status | Change |
| --- | --- | --- |
| 4.10 / 4.11 | done | No reopen. Assign still commits a row. |
| 4.12 | backlog | Queue exhausted + PDF delete only after **Save**. Bulk path unchanged. |
| 4.13 | backlog | Last pending assign/delete **hands off** to 4.13.1; not session complete. |
| **4.13.1** | **new, backlog** | ImportReviewSheet. |
| 4.14 | backlog | `active` includes unsaved sheet; resume routes to sheet vs card; summary only after Save. |
| 4.15 / 4.16 | backlog | No AC change. 4.15 still parallel after 4.11. |

**Artifact conflicts:**

- **PRD FR-18:** add sheet outcomes (per-row discard, Save finalizes). FR-17 stays the card. FR-20 stays “after successful import” = Save.
- **AD-3:** review includes the sheet until Save; last pending assign is not “no longer needs the PDF.”
- **AD-4:** statement “all rows left pending” still true at sheet-open; **session finalized** only on Save (or bulk commit / upload discard).
- **UX J1:** insert sheet beat before completion summary.
- **Tracking:** `epics.md` build order, `sprint-status.yaml` key `4-13-1-import-review-sheet`, close 4.11 deferred-work bullet as owned by 4.13.1.

**Technical impact:** Session must persist **not finalized** (status or flag — `create-story` for 4.13.1). Idle PDF release must not run at last-card. Sheet discard reuses undo-assign ledger hard-delete. No new Compose services.

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment.**

- **Rollback:** not viable (would undo 4.10/4.11).
- **MVP cut:** not applicable; this is a missing confirm loop inside committed review, not extra product.
- **Effort:** Medium (one new story + AC patches on three backlog stories + FR/UX/AD notes). **Risk:** Low–medium (`active` session + PDF timing).

## 4. Detailed Change Proposals

All proposals below were **approved** in incremental review this session.

### 4.1 New Story 4.13.1 (epics.md)

Insert after 4.13, before 4.14.

### Story 4.13.1: ImportReviewSheet — grouped validation, discard, save

As a user who just routed every pending transaction,  
I want a sheet of those items grouped by destination list, with Save or per-row discard,  
So that I can confirm placements before the session is finalized and the source PDF is released.

**Acceptance Criteria:**

**Given** individual review has no remaining pending rows  
**When** the last assign or delete succeeds  
**Then** ImportReviewSheet opens; the source PDF is **not** deleted yet  
**And** items are grouped by the list they were assigned to (deleted/excluded rows are not in those groups)

**Given** the sheet is open  
**When** it renders  
**Then** there is **exactly one Save** control, at the **bottom** of the sheet  
**And** each assigned row has its **own discard** control — there is no bulk/sheet-level discard

**Given** I Save (bottom button)  
**Then** the session is finalized: AD-3 PDF delete + path clear may run (4.12 rules: clean, no unresolved quarantine), and the 4.14 completion summary / 4.12 landing proceed  
**And** Save is always present; an empty pending queue does not skip the sheet

**Given** I discard **a single row**  
**Then** that row returns to `pending` and its ledger row is reversed (same hard-delete as undo-assign)  
**And** if any pending rows remain, 4.13 resumes on those rows in original `sequence`; if the pending queue is empty again, the sheet opens again  
**And** the loop continues until Save

**Given** I leave mid-sheet  
**When** I return  
**Then** resume opens the sheet (zero pending + not Saved still counts as active)

### 4.2 Story 4.13 — last-row handoff

Add AC: last pending assign/delete navigates to ImportReviewSheet (4.13.1), not 4.14 summary and not an empty complete state. 4.13 does not implement the sheet. Card undo still applies on the card before the sheet.

### 4.3 Story 4.12 — Save is exhausted + PDF

- “Review queue exhausted” = pending empty **and** Save on 4.13.1. Without Save: no land, no PDF delete.
- AD-3 delete runs as part of Save finalization (quarantine/incomplete skip unchanged).
- Bulk (4.7) unchanged.

### 4.4 Story 4.14 — active + resume + summary

- `GET /import/sessions/active`: most recent non-discarded **not-finalized** session (pending rows **or** zero pending but not Saved).
- Resume: pending → 4.13 first pending `sequence`; zero pending not Saved → sheet.
- Upload: sheet-waiting uses Resume + Discard (no Bulk, no new upload).
- Upload Discard: keep assigned ledger rows; abandon pending; PDF may release; copy warns discard is not undo-all.
- Completion summary **only after Save**. 4.14 owns summary surface; 4.12 owns commit correctness and land.

### 4.5 PRD FR-18

Keep existing outcomes. Add: after pending queue empty, ImportReviewSheet; one bottom Save finalizes; per-row discard returns that row to the queue (ledger reverse); sheet repeats until Save; FR-20 / PDF on Save, not last-card.

### 4.6 UX J1 (`EXPERIENCE.md` + 2026-08-20 row-level note)

Insert sheet beat after last card, before completion summary. Note stale `review-individual.html`; no mock rewrite in this proposal.

### 4.7 AD-3 / AD-4 (`ARCHITECTURE-SPINE.md`)

- AD-3: review includes ImportReviewSheet until Save.
- AD-4: session **finalized** on Save (or bulk commit / upload discard). Statement “all rows left pending” still marks sheet-open, not PDF-delete.

### 4.8 Tracking

- Build order: `4.9 → 4.10 → 4.11 → 4.12 → 4.13 → 4.13.1 → 4.14` (4.15 still after 4.11).
- `sprint-status.yaml`: `4-13-1-import-review-sheet: backlog` between 4.13 and 4.14.
- Do **not** renumber 4.14–4.16.
- `deferred-work.md`: 4.11 PDF-sheet deferral **owned by 4.13.1**.

## 5. Implementation Handoff

**Scope:** Moderate — backlog reorganization (new story + AC edits) then implementation.

**Handoff:**

1. **This Correct Course (step 5):** apply Section 4 to `epics.md`, PRD, UX, architecture spine, `sprint-status.yaml`, `deferred-work.md`.
2. **Create Story** (fresh chat): `/bmad-create-story 4-13-1-import-review-sheet`
3. **Do not implement 4.13.1 before 4.13** (card handoff). 4.12 AC text can land now; 4.12 *code* that lands on empty queue should wait for Save once 4.13.1 exists — if 4.12 is built first, do not treat empty pending as complete.
4. **Build** 4.13.1 after 4.13 via `/bmad-build`.

**Success criteria:**

- Last pending assign/delete opens the sheet; PDF still present.
- One Save at bottom; discard only per row.
- Discard → 4.13 → sheet again until Save.
- Save → PDF rules + 4.14 summary + 4.12 land.
- Unsaved zero-pending session is `active` and resumes the sheet.
- 4.10/4.11 remain `done`.

**Approved:** yes — Sebas, 2026-08-21 (Correct Course incremental review).

**Applied:** epics.md, prd.md FR-18, EXPERIENCE.md J1, row-level UX spec note, ARCHITECTURE-SPINE.md AD-3/AD-4, sprint-status.yaml, deferred-work.md.

## Checklist (Correct Course)

- Section 1–5: [x] Done
- 6.3–6.5: [x] Done — approved and applied
