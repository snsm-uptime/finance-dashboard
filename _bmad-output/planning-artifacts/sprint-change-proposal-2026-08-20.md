# Sprint Change Proposal — 2026-08-20

**Trigger:** Story 4.8's shipped individual-review UI (Epic 4, `done`) assigns an entire statement to one list per gesture. Reviewing a real upload this session, the operator found individual review produces the same outcome as bulk review — the parsed rows are never shown, so "one at a time" means one *file* at a time, not one *transaction* at a time.

## 1. Issue Summary

**Problem:** Individual review does not deliver per-transaction routing, which was its product purpose. The cause is a specification defect, not an implementation defect.

Story 4.8's own acceptance criteria say **"When I act on a statement"** (`epics.md:1139`) and specify swipes that commit a whole statement. `IndividualReviewPanel.tsx` implements exactly that. The dev built what the story asked for; the story asked for the wrong granularity. This distinction matters for status handling (Section 2) and means no rework is attributable to the 4.8 implementation.

Root cause runs deeper than the UI. Row data exists server-side — `CanonicalLine` fields are persisted per-row in `import_candidate_rows` (migration `0016_import_sessions.py`) — but:

1. `StagedStatementResponse` (`api/api/schemas/import_sessions.py`) serializes only `candidate_row_count`. Individual rows never reach the client, so no UI could show them.
2. `commit_statement_batch` (`api/adapters/persistence/import_sessions.py`) builds ledger entries from **all** of `statement.candidate_rows` in one shot, wraps them in one `ImportBatchModel`, and unconditionally flips the statement to `committed`.
3. `import_batches` carries a **DB-level** `uq_import_batches_statement_id` constraint — one batch per statement, enforced in Postgres. `AssignIndividualImportService` / `AssignBulkImportService` rely on it to reject double-commits.
4. `ImportCandidateRowModel` rows have no status, assignment, or batch linkage at all.

Net effect: per-row assignment is not reachable by any UI change. The whole review pipeline — schema, service layer, and client contract — is architected around "one statement = one atomic unit routed to one list."

**Discovered by:** operator review of a real upload against the Story 4.8 UI this session, then traced through the frontend and backend to the schema and constraint layer.

**Design resolved this session:** `_bmad-output/planning-artifacts/ux-designs/row-level-individual-review-2026-08-20.md` specifies the replacement — data model, API surface, card interaction, resume entry point, and the "new" badge. That document is this proposal's input and is referenced throughout Section 4 rather than restated.

## 2. Impact Analysis

**Epic impact:** Epic 4 remains completable as scoped, but this is a **rework of delivered 4.8 behavior**, not a pure addition — the distinction from Sprint Change Proposal 2026-08-19 (which was additive). No other epic is invalidated. Epic 5's Stories 5.1–5.3 (parse failure, quarantine, hand-fix) stay valid; they own the failure path, orthogonal to routing granularity. Epic 5's Story 5.6 ("Roll back an import batch") gains a mild simplification, since per-row batches are smaller rollback units — no AC change required. No epic resequencing needed.

**Story impact:**

- **Story 4.8 (`done`) — status unchanged, annotated as superseded.** It shipped and satisfied its own ACs; `done` remains factually accurate. `sprint-status.yaml` is **not** edited for 4.8. An annotation in `epics.md` and in its implementation-artifacts file records that its ACs no longer describe the product. Reopening it would both misattribute a spec defect to the implementation and erase the shipped-then-changed history this proposal exists to record. The status vocabulary has no `superseded` value, and inventing one risks breaking `bmad-sprint-status` and `bmad-create-story`, which parse that file.
- **Story 4.9 (`backlog`) — ACs amended** (Section 4). Two of its criteria collide with per-row commits: it journals "an Import Batch **for that statement**," and its completion summary reports only imported/skipped-duplicate counts. Because 4.9 is unstarted, amending it in place is cleaner than adding a contradicting story.
- **New Stories 4.12–4.16** added to Epic 4 (Section 4).
- No other existing story's ACs change.

**Artifact conflicts:**

- **PRD: yes — FR-17 and FR-18 both need amendment.** This differs from the 2026-08-19 proposal, which had no PRD impact. FR-17 (`prd.md:474-475`) states "statements are reviewed one at a time" and fixes the gesture map as `right → chosen list, left → default, down → skip`. FR-18 (`prd.md:477-485`) is written entirely in statement units and defines Skip as the negative outcome. Under row-level review the unit becomes a transaction, `down` is reassigned from skip to undo, and delete (`up`) replaces skip. Leaving these unamended would leave the PRD contradicting shipped behavior. Proposed replacement text in Section 4.
- **Architecture: AD-4 must be amended — resolved in architecture review this session.** `uq_import_batches_statement_id` is not an incidental constraint; it is the schema encoding of AD-4 (`ARCHITECTURE-SPINE.md:95`), which states the v1 batch boundary is *"one Statement's accept/commit (stable `batch_id` per statement)"*. Dropping it while AD-4 stands would leave the spine asserting a guarantee the database no longer makes. Three deltas: (1) batch boundary becomes "one commit action"; (2) the *"Prevents: partial-commit vs batch fights"* clause needs rewriting, since row-level review makes partial commit the normal case; (3) rollback granularity for FR-30 / Epic 5 Story 5.6 silently becomes per-row — arguably an improvement, but it must not happen by accident. AD-1 (domain purity) and AD-3 (PDF lifecycle) are unaffected.
- **Architecture: AD-9 must also be amended.** `ARCHITECTURE-SPINE.md:137` (AD-9 — Individual review gestures, ADOPTED) mandates the exact vectors *"right → chosen list, left → configurable default list, **down → skip**"* over a statement, and lists *"divergent L/R/D mappings across stories"* under Prevents. Row-level review changes the reviewed unit to a transaction, replaces skip with `up → delete`, and makes undo button-only on every platform. AD-9 is binding on Story 4.14, so it must be amended or 4.14 ships in violation of an adopted decision.
- **Constraint replacement, not removal.** Review found the original plan understated this risk. Today's commit path is two-layered: `validate_bulk_commit_eligible` (application) plus `uq_import_batches_statement_id` (database backstop) — and `test_import_sessions_integration.py:316` says so explicitly, calling the constraint *"the real backstop"* because two concurrent requests can both pass validation before either persists. The constraint was a Story 4.7 review finding; the guarded UPDATE was a Story 4.8 review finding. Both were added deliberately, at different layers, in response to review. A guarded-UPDATE-only design collapses them into one layer whose correctness depends on statement ordering inside a transaction that no schema enforces. `ledger_entries` carries no `__table_args__` at all, so that constraint is the only DB-enforced guard in the entire commit path. **Resolution:** add `ledger_entries.import_candidate_row_id` (nullable, UNIQUE, FK) so a candidate row yields at most one ledger entry, keeping the two-layer structure intact. Verified viable: ledger entries are hard-deleted (`repositories.py:284,672`, no soft-delete column) so undo-then-reassign reuses the value cleanly, and manual entries keep NULL under a UNIQUE that permits unlimited NULLs, so no backfill.
- **UI/UX:** the design contract added this session (see Section 1) is the authority. No conflict with the existing `ux-finance-dashboard-2026-08-09` spine — this extends it.
- **Other artifacts:** `IndividualReviewPanel.test.tsx` is written against statement-level actions and needs a full rewrite alongside the panel.

**Technical impact:** One migration (row status/sequence/resolution columns, session undo pointer, `ledger_entries.import_reviewed_at`, and **dropping** `uq_import_batches_statement_id`). New API endpoints for per-row assign/delete/undo/edit plus an active-session lookup. Near-full rewrite of `IndividualReviewPanel.tsx`. Five backend symbols retired as dead code.

**Known unpopulated fields (accepted, flagged):** the design specifies a store subtitle and a time on the review card. `CanonicalLine` has no merchant field (adapters emit one `normalized_description` blob) and `posted_date` is a SQL `Date` end-to-end. Both render conditionally and stay empty until adapter-level work supplies them. Neither blocks this proposal.

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment.** Amend two FRs, amend one unstarted story, annotate one shipped story, and add five new stories to Epic 4's existing structure.

- **Rollback (Option 2):** not viable and not desirable. Story 4.8's code is the working skeleton — `useDrag`, gesture thresholds, list-picker state, and error mapping all carry forward. Reverting it would discard reusable work to rebuild the same primitives.
- **MVP review (Option 3):** not applicable. Per-transaction routing was always the intent of FR-17's "individual" mode; this is a correctness fix inside committed MVP scope, not an expansion.
- **Effort:** Large — migration + service-layer rewrite + near-full panel rewrite + new entry point. **Risk:** Medium-High, concentrated in one place: dropping `uq_import_batches_statement_id` removes a database-enforced invariant and relies on the application-level guarded UPDATE to replace it. That guard must be correct before the constraint is dropped, and the migration is not trivially reversible once rows carry mixed statuses.

## 4. Detailed Change Proposals

### prd.md — amend FR-17

Replace the Consequences block at `prd.md:471-475`:

```
**Consequences (testable):**

- **Bulk:** the whole upload is assigned to one list chosen from lists the user belongs to.
- **Individual:** parsed transactions are reviewed one at a time, across the whole session — not grouped by statement.
- Individual review presents one transaction on a centered card over a dimmed backdrop.
- Phone Individual review uses true swipes: right → chosen list (after picker), left → configurable default, up → delete. Undo is a button on all platforms, never a gesture.
- Desktop uses labeled buttons for the same four outcomes.
```

Rationale: the unit changes from statement to transaction; `down` is reassigned from skip to undo; delete replaces skip. Undo stays button-only on both platforms so an accidental downward drag cannot fire it and so touch-scroll does not contend with a fourth swipe axis.

### prd.md — amend FR-18

Replace `prd.md:477-485` in full:

```
#### FR-18: Individual review outcomes

In individual review, each parsed transaction can be: assigned to a chosen list; assigned to the configurable default destination (FR-12); or deleted (never stored). The user can undo the most recent assign or delete, and can discard the remaining session.

**Consequences (testable):**

- Delete means no ledger row for that transaction.
- Undo is single-level: it reverses the most recent assign or delete and returns that transaction to the queue at its original position. Undo survives a reload.
- A transaction with a zero amount is excluded before review and never appears; the user is told how many were excluded when the session completes.
- Discarding a partially reviewed session abandons only the remaining unreviewed transactions. Already-assigned transactions keep their ledger rows.
- Assignment commits only after parse success (or after an explicit accept-with-quarantine under failure handling).
- Statements that failed to parse are reported when the session completes, so the user knows what to enter by hand.
```

Rationale: makes the transaction the unit, replaces Skip with Delete, introduces Undo as a first-class outcome, and pins the two behaviors most likely to be implemented wrong — that discard does not roll back committed rows, and that zero-amount exclusions must be reported rather than silently dropped.

### epics.md — annotate Story 4.8 as superseded

Insert immediately below the `### Story 4.8: Individual review (swipe / desktop buttons)` heading (`epics.md:1130`), before the "As a user" line:

```
> **⚠️ Superseded by Stories 4.12–4.16 (Sprint Change Proposal 2026-08-20).**
> This story shipped and satisfied its own acceptance criteria, which specify statement-level
> routing ("When I act on a statement"). That granularity was a specification defect: it makes
> individual review functionally identical to bulk review. The ACs below describe delivered-then-
> replaced behavior and are retained for history — they do not describe current product intent.
> Status remains `done`; the replacement is tracked as new stories, not as a reopening of this one.
```

Rationale: preserves the audit trail while making it impossible to read 4.8's ACs as current. Keeps the status machine untouched.

### epics.md — amend Story 4.9 acceptance criteria

Two criteria collide with per-row commits. Replace the first AC block (`epics.md:1170-1174`):

```
**Given** I assign a cleanly parsed transaction to a list
**When** commit runs
**Then** an Import Batch is journaled for that commit action and its ledger row is written with domain identity dedup (FR-20, FR-34, AD-4)
**And** payer defaults to me and remains editable (FR-19)
**And** FX materialization from Epic 3 applies to non-CRC lines
```

Replace the third AC block (`epics.md:1181-1185`):

```
**Given** the session completes (no Epic 5 conflicts yet)
**When** the review queue is exhausted
**Then** I see a completion summary before landing: rows committed broken down by destination list, rows deleted, zero-amount rows excluded, and statements that failed to parse
**And** I land on shared-expenses for the list that received the most rows this session
**And** the Soft-Ledger settle strip reflects the new committed purchases — same strip as Epic 3, no parallel settle UI
**And** when Epic 5 same-price conflicts exist, Story 5.7 inserts conflict review after this summary and before Soft-Ledger land — do not land on a confident strip then interrupt (UX-DR22)
```

Rationale: a batch is now one commit *action* rather than one statement; "the list I mostly fed" needs a definition once one session feeds several lists; and the completion summary is the only place zero-amount exclusions and parse failures are surfaced, so it must be in the AC that owns the summary. Story 4.9 is `backlog`, so this is an edit, not a rework.

### epics.md — new Story 4.12

```
### Story 4.12: Row-level review data model + per-row commit

As a developer enabling per-transaction routing,
I want import_candidate_rows to carry independent status and resolution, and commits to operate on one row at a time,
So that a statement's rows can be routed to different lists instead of committing as one atomic unit.

**Acceptance Criteria:**

**Given** the import_candidate_rows table
**When** the migration runs
**Then** it gains status (pending | committed | deleted | excluded_zero_amount, default pending), resolved_list_id, resolved_at, and a non-null sequence column
**And** it does not gain a resolved_ledger_entry_id — the link is carried by the reverse FK below, and two pointers that must agree is a drift hazard

**Given** row ordering must be deterministic across sessions
**When** rows are created
**Then** sequence is assigned 0-based per statement from parse order — insertion order and created_at are not relied upon, because neither is guaranteed stable across a single bulk-insert flush

**Given** uq_import_batches_statement_id encodes AD-4's per-statement batch boundary
**When** per-row commits are introduced
**Then** the constraint is dropped — one statement now legitimately spawns many batches — and its job is translated to row grain, not deleted, via ledger_entries.import_candidate_row_id (UUID, nullable, UNIQUE, FK to import_candidate_rows)
**And** AD-4 is amended before this story starts: batch boundary becomes "one commit action", the "partial-commit vs batch fights" Prevents clause is rewritten (partial commit is now the normal case), and the rollback-granularity shift for FR-30 / Story 5.6 is recorded

**Given** double-commit protection must stay two-layered
**When** a row is committed
**Then** the guarded conditional UPDATE (WHERE id = :row_id AND status = 'pending') remains the fast path and clean-error path, and the new UNIQUE constraint is the database backstop — an IntegrityError is caught via the existing begin_nested() SAVEPOINT pattern and surfaced as ImportRowNotAvailableError
**And** the guarded UPDATE must precede the ledger INSERT in the same transaction
**And** both layers exist before the old constraint is dropped, not after — today's commit path has an application check plus a DB backstop, and ledger_entries carries no __table_args__ at all, so dropping uq_import_batches_statement_id without a replacement would leave the commit path with no database-enforced guard whatsoever

**Given** manual (non-import) ledger entries
**When** the UNIQUE column is added
**Then** they keep import_candidate_row_id NULL and are unaffected — Postgres permits unlimited NULLs under UNIQUE, so no backfill is required
**And** undo-then-reassign reuses the value cleanly because ledger entries are hard-deleted (no deleted_at / is_deleted column), so no partial index is needed

**Given** the concurrent-commit race regression test at test_import_sessions_integration.py:316
**When** commit moves to row grain
**Then** an equivalent row-grain race test exists, so the backstop keeps the regression coverage that test was written to provide

**Given** a parsed row with a zero amount
**When** the session is created
**Then** the row is persisted with status excluded_zero_amount and never enters the review queue, and its per-statement count remains queryable for the completion summary

**Given** a row resolves (assigned or deleted)
**When** the commit completes
**Then** the statement flips to committed only once every non-excluded row has left pending — an all-deleted statement also reaches this state, reusing the idle-check shape of _release_source_pdf_if_idle

**Given** bulk review runs against a session
**When** it commits
**Then** it skips excluded_zero_amount rows and marks every row it touches committed, and rejects any statement already carrying non-pending rows with import_row_not_available — a backstop, since Story 4.15 makes that state unreachable from the UI

**Given** statement-level individual review is retired
**When** this story lands
**Then** AssignIndividualImportService, SkipStatementService, validate_individual_accept_eligible, validate_individual_skip_eligible, and the commit_individual_statement / skip_individual_statement routes are deleted, not left as unused parallel paths
```

Rationale: isolates the highest-risk change — dropping a database-enforced invariant — into one story with an explicit ordering requirement (guard before drop). Retiring the dead services here prevents two commit paths coexisting.

### epics.md — new Story 4.13

```
### Story 4.13: Row-level review API — rows, assign, delete, undo, edit

As a client rendering per-transaction review,
I want the session payload to carry individual rows and endpoints to resolve them one at a time,
So that the review UI can act on a transaction instead of a file.

**Acceptance Criteria:**

**Given** GET /import/sessions/{sessionId}
**When** a staged session is fetched
**Then** each statement carries a rows array (id, sequence, description, amount, currency, posted_date, status) plus zero_amount_excluded_count, and the session carries the current undo pointer or null
**And** only pending rows are included in the queue payload

**Given** left and right card actions
**When** either fires
**Then** both call POST /import/sessions/{sessionId}/rows/{rowId}/assign with a list_id body — one endpoint, with the client supplying the default list or the picked list, mirroring how commitIndividualStatement already serves both accept paths

**Given** the up action
**When** it fires
**Then** POST /import/sessions/{sessionId}/rows/{rowId}/delete soft-marks the row deleted so undo can restore it

**Given** undo must target the last action rather than a row
**When** POST /import/sessions/{sessionId}/undo is called
**Then** it reads the session's undo pointer; an assign is reversed by deleting the created ledger entry and returning the row to pending; a delete is reversed by returning the row to pending
**And** the restored row re-enters the queue at its original sequence position, not at the front
**And** undo is single-level — a second consecutive call returns import_nothing_to_undo

**Given** the undo pointer must survive a reload
**When** a row resolves
**Then** last_resolved_row_id, last_resolved_action, and last_resolved_prior_status are persisted on import_sessions and cleared once used or superseded

**Given** a pending row's description needs correcting
**When** PATCH /import/sessions/{sessionId}/rows/{rowId} is called with a description
**Then** it succeeds only while the row is pending, enforced server-side by the same guarded-UPDATE idiom

**Given** row-level failure modes
**When** an operation cannot proceed
**Then** import_row_not_found, import_row_not_available, and import_nothing_to_undo are returned following the existing code convention consumed by mapIndividualReviewError
```

Rationale: undo is session-scoped rather than row-scoped because the button targets "what I just did," not a visible row. Server-persisted so it survives the app closing mid-review, which is the same requirement resumability imposes.

### epics.md — new Story 4.14

```
### Story 4.14: Individual review card — four-direction actions + inline title edit

As a user reviewing transactions one at a time,
I want a focused card with four directional actions and an editable title,
So that routing each transaction is deliberate but fast.

**Acceptance Criteria:**

**Given** individual review starts
**When** the panel renders
**Then** the screen shows a dimmed backdrop with one medium card centered — not a scrollable list of rows
**And** the card shows the transaction description as title, the store as subtitle when a structured merchant field exists (blank today), the amount as body, and the posted date at the bottom (date only — no time exists in the pipeline)

**Given** the four card actions
**When** I act
**Then** left assigns to the default list, right assigns to the selected list, up deletes, and down undoes
**And** left, right, and up are available as both edge buttons and touch swipes; down is a button on all platforms including mobile, never a gesture

**Given** the selected list
**When** I move between transactions
**Then** the picker selection persists across the whole session rather than resetting per row, and left/right disable under the same conditions the existing canAcceptChosen / canAcceptDefault booleans encode

**Given** a successful assign or delete
**When** the action resolves
**Then** the card is removed optimistically, the next row advances, and undo becomes available

**Given** accessible / Reduce Motion needs
**When** review is used
**Then** every outcome is operable without swiping (UX-DR19) — the edge buttons are the primary affordance, not swipe theatre

**Given** the transaction title needs correcting
**When** I click it once
**Then** it enters a primed state showing a soft border in the space the input will occupy, with no input mounted yet
**And** a second click mounts the input and focuses-and-selects it, mirroring ListsPanel's renameInputRef effect
**And** this uses explicit click-count state rather than the native dblclick event, so two clicks with any gap between them both count

**Given** an active title edit
**When** I press Enter, press Escape, or click outside
**Then** Enter commits via PATCH (trimming, rejecting empty, no-op if unchanged — mirroring commitRename), Escape cancels, and an outside pointerdown cancels from either primed or editing back to idle
**And** errors render inline with role="alert" as renameErrors does today

**Given** the card advances to the next transaction
**When** row.id changes
**Then** title edit state resets to idle and any draft is discarded

**Given** the row was resolved concurrently between prime and commit
**When** the PATCH returns import_row_not_available
**Then** the card refreshes from the next GET rather than showing a stale edit
```

Rationale: matches Story 4.8's granularity precedent (one story for the review surface). The title-edit ACs are explicit about mirroring `ListsPanel` because reimplementing that state machine from scratch is the likely failure mode.

### epics.md — new Story 4.15

```
### Story 4.15: Resume entry point + session completion summary

As a user who closed the app mid-review,
I want to resume where I left off instead of re-uploading,
So that a long review survives interruption and never leaves a half-reviewed session in an ambiguous state.

**Acceptance Criteria:**

**Given** GET /import/sessions/active
**When** called
**Then** it returns the caller's most recent non-discarded session holding at least one pending row, or null

**Given** the upload page
**When** it loads
**Then** it fetches the active session server-side (page.tsx is already force-dynamic) and passes it to UploadPanel as an initial prop — today UploadPanel only knows about a session uploaded in the same visit, which is why closing the tab currently strands it

**Given** an active session with every row still pending
**When** the upload page renders
**Then** Discard, Bulk, and Review Individually are all offered — today's three actions, unchanged

**Given** an active session with at least one resolved row and at least one pending row
**When** the upload page renders
**Then** only Resume review and Discard are offered — no Bulk path and no new upload
**And** Resume deep-links to /upload/review/{sessionId}, which picks up at the first pending row by sequence with the undo pointer intact

**Given** a partially reviewed session
**When** I discard it
**Then** already-committed ledger rows are retained — only the remaining pending rows are abandoned and the source PDF is released via the existing _release_source_pdf_if_idle path
**And** the confirmation copy states this explicitly, because "discard" otherwise reads as "undo everything"

**Given** the review queue is exhausted
**When** the session completes
**Then** a summary reports rows committed by destination list, rows deleted, zero-amount rows excluded across all statements, and statements that failed to parse — the failed-statement report replaces Story 4.8's per-statement skip card (FR-18)
```

Rationale: resumable data without a way back in is not a feature. This story is also what makes the bulk-vs-partial conflict unreachable from the UI, which is why Story 4.12's bulk guard is only a backstop.

### epics.md — new Story 4.16

```
### Story 4.16: "New" badge on freshly imported rows

As a user who just imported transactions,
I want newly imported rows marked in the destination list,
So that I can find them to adjust splits without hunting through history.

**Acceptance Criteria:**

**Given** a row-level commit creates a ledger entry
**When** the entry is written
**Then** ledger_entries.import_reviewed_at is null

**Given** a ledger entry in a list view
**When** it has provenance 'parser' and a null import_reviewed_at
**Then** ReceiptRow renders a badge via a new optional prop, using the existing Chip / ChipTone component rather than a bespoke element

**Given** I interact with a badged entry
**When** I edit it in any way
**Then** import_reviewed_at is set and the badge clears — dismissal is not gated on split fields specifically, so it stays correct once a split-edit control exists

**Given** no split-edit control is wired into ReceiptRow yet
**When** I want to clear a badge I have finished with
**Then** an explicit dismissal affordance exists, so the badge cannot become permanently stuck

**Given** this story's scope
**When** the badge points the user at adjusting a split
**Then** wiring an actual split-edit control into ReceiptRow remains out of scope — ReceiptRowMenu's Edit item is currently non-persisting, and that gap is tracked separately
```

Rationale: the badge is buildable now and independently useful. Its scope boundary is called out explicitly because the badge implies a split-edit affordance that does not yet persist — shipping the badge without naming that gap would create a dead-end for the user.

### sprint-status.yaml — new backlog entries

```yaml
  4-12-row-level-review-data-model-per-row-commit: backlog
  4-13-row-level-review-api-rows-assign-delete-undo-edit: backlog
  4-14-individual-review-card-four-direction-actions-inline-title-edit: backlog
  4-15-resume-entry-point-session-completion-summary: backlog
  4-16-new-badge-on-freshly-imported-rows: backlog
```

Inserted after `4-11-bac-credit-real-statement-compatibility-fix`, before `epic-4-retrospective`. `epic-4` stays `in-progress` (unchanged). **`4-8-individual-review-swipe-desktop-buttons` stays `done` — not edited.**

## 5. Implementation Handoff

**Scope classification:** Major — backlog reorganization (this proposal) plus a multi-story implementation spanning migration, service layer, and a near-full panel rewrite. Not a same-session direct edit.

**Sequencing:** **4.11 → 4.12 → 4.13 → 4.9 → 4.14 → 4.15.**

- **4.11 first** (already in `review`). Without a working BAC adapter, real uploads yield `candidate_row_count == 0` — there are no real rows to review, so nothing downstream is verifiable against a real statement.
- **4.9 moved.** It was next in line before this proposal, but amending its ACs to per-transaction semantics made it depend on 4.12/4.13: its batch journaling, dedup, and PDF-cleanup criteria all attach to a per-row commit path that does not exist until then. It is no longer buildable in numeric order.
- **4.16** depends only on 4.13 (entries must be created with a null `import_reviewed_at`) and can run in parallel with 4.14–4.15.
- **4.10** (multi-file upload) is independent — entirely upload-stage, never touching review granularity — and can run at any point.

**Story ownership boundary (4.9 vs 4.15):** Story 4.15 owns the completion summary surface. Story 4.9 owns commit correctness (dedup, FX, batch journaling, PDF cleanup) and the post-summary landing, and exposes its imported-new / skipped-duplicate counts for 4.15 to render. Both stories originally specified the summary; that duplication was corrected.

**Handoff:**

1. **Product Owner** — ✅ FR-17 and FR-18 amendments landed in `prd.md` this session, with dated amendment notes retaining the superseded wording. The mirrored copies in `epics.md`'s Requirements Inventory and UX-DR11 were updated to match. Unlike the 2026-08-19 proposal, this one did change the PRD.
2. **Architect** — ✅ resolved and landed this session. AD-4 and AD-9 are both amended in `ARCHITECTURE-SPINE.md` (dated amendment notes retain the superseded wording). No new AD was needed. The constraint is translated to row grain rather than dropped outright.
3. **Product Owner / Developer** — land this proposal's edits to `prd.md`, `epics.md`, and `sprint-status.yaml`.
4. **Developer agent** — run `bmad-create-story` against `4-12-row-level-review-data-model-per-row-commit`, then `bmad-dev-story`. Proceed in the sequence above.

**Success criteria:** a real multi-transaction statement can be reviewed one transaction at a time with different transactions routed to different lists; closing the app mid-review and returning resumes at the next unreviewed transaction with undo still available; discarding a partially reviewed session retains already-committed rows; zero-amount rows never appear in review but are reported at completion; bulk review behavior for untouched sessions is unchanged.

**Rollback posture:** Story 4.12's migration is the one-way door — once rows carry mixed statuses, restoring `uq_import_batches_statement_id` requires resolving statements that legitimately span multiple batches. Both protection layers — the guarded UPDATE and the new `ledger_entries.import_candidate_row_id` UNIQUE backstop — must be in place and covered by a row-grain race test before the old constraint is dropped.
