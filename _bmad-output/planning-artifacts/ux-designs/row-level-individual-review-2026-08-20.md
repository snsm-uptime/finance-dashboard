# Row-Level Individual Review — Design Spec

**Date:** 2026-08-20
**Branch:** `ad-hoc/filter-upload-rows`
**Problem:** Individual review currently assigns an entire statement to one list, making it functionally identical to bulk review. The parsed rows never reach the client.

---

## Conflicts with current code

Three items in the design direction are not sourceable from the pipeline as it exists today.

1. **"Store, if identified" (card subtitle)** — `CanonicalLine` (`api/domain/canonical_line.py`) has no merchant/store field, only a single `normalized_description` blob emitted by bank adapters. No adapter separates merchant from reference/description. The subtitle renders conditionally and stays blank until an adapter emits a structured field. Not a blocker ("if identified" already implies nullability), but it will not be populated at launch.

2. **"Time if available" (card bottom)** — `posted_date` is a SQL `Date` column end-to-end (migration `0016_import_sessions.py`, `ImportCandidateRowModel`, `CanonicalLine.posted_date: str`). There is no time value anywhere in the pipeline. The bottom row shows date only until time is added at the adapter/domain level.

3. **"Update split percentage / mark as even split" from the badge** — the mechanism already exists (`split_overrides` table, `subject_kind`/`subject_id`/`kind`/`payload`, `api/adapters/persistence/models.py:316`). But `ReceiptRowMenu`'s Edit item is commented as **not persisting yet**. This spec builds the badge and its dismissal hook only; wiring an actual split-edit control into `ReceiptRow` is a prerequisite it does not include.

**Structural blocker:** `import_batches` has a DB-level `uq_import_batches_statement_id` constraint (one batch per statement), and `commit_statement_batch` unconditionally flips the whole statement to `committed`. Per-row assignment cannot coexist with this — it must be replaced, not extended.

---

## 1. Data model changes

### `import_candidate_rows` (new migration, e.g. `0018_row_level_review.py`)

```
status                     VARCHAR(20) NOT NULL DEFAULT 'pending'
                            -- pending | committed | deleted | excluded_zero_amount
resolved_list_id           UUID NULL REFERENCES lists(id)
resolved_at                TIMESTAMPTZ NULL
sequence                   INTEGER NOT NULL
```

> **Revised after architecture review (2026-08-20).** An earlier draft of this spec also added
> `resolved_ledger_entry_id` here. It is dropped: the link is carried by the reverse FK
> `ledger_entries.import_candidate_row_id` (below), and two pointers that must agree is a drift
> hazard. Undo does its lookup through the reverse FK.

- `sequence` is new and necessary. Row order today relies on DB insertion order / `created_at`, which has no guaranteed ordering across a single bulk insert flush. Resumability requires a deterministic "next pending row," so `sequence` (0-based per statement, assigned in `create_session` from parse order) becomes the sort key.
- `excluded_zero_amount` is assigned at `create_session` time (where `validate_bulk_candidate_row` runs today) for any row with `amount == 0`. It never enters the review queue; its count is derivable per statement for the end-of-session summary.
- `normalized_description` becomes mutable pre-commit (the inline title edit target).

### `import_batches` and the commit guard

**Revised after architecture review (2026-08-20).** An earlier draft dropped `uq_import_batches_statement_id` and replaced it with *no* constraint, moving all protection to the guarded UPDATE. That understated the risk, for two reasons found in review:

1. `uq_import_batches_statement_id` is the schema encoding of **AD-4** (`ARCHITECTURE-SPINE.md:95`), which fixes the v1 batch boundary at one statement. AD-4 must be amended before this lands — batch boundary becomes "one commit action", the *"partial-commit vs batch fights"* Prevents clause needs rewriting, and rollback granularity for FR-30 / Story 5.6 shifts to per-row.
2. Today's commit path is **two-layered** — `validate_bulk_commit_eligible` plus the DB constraint — and `test_import_sessions_integration.py:316` names the constraint *"the real backstop"*, because two concurrent requests can both pass validation before either persists. `ledger_entries` has no `__table_args__` at all, so it is the only DB-enforced guard in the whole path.

**Resolution: translate the constraint to row grain, don't delete it.**

```
ledger_entries.import_candidate_row_id  UUID NULL UNIQUE
                                        REFERENCES import_candidate_rows(id)
```

A candidate row yields at most one ledger entry, enforced by Postgres. Manual entries keep NULL (UNIQUE permits unlimited NULLs, so no backfill). Ledger entries are hard-deleted (`repositories.py:284,672` — no soft-delete column), so undo-then-reassign reuses the value cleanly without needing a partial index.

The guarded conditional UPDATE stays as the **fast path and clean-error path**, mirroring `skip_statement`; the UNIQUE constraint is the **backstop**, with `IntegrityError` caught via the existing `begin_nested()` SAVEPOINT pattern (`import_sessions.py:180-195`) and surfaced as `ImportRowNotAvailableError`. The guarded UPDATE must precede the ledger INSERT within the transaction.

```sql
UPDATE import_candidate_rows
SET status = 'committed',
    resolved_list_id = :list_id,
    resolved_at = now()
WHERE id = :row_id AND status = 'pending'
```

If `rowcount == 0`, raise `ImportRowNotAvailableError` (same shape as `ImportStatementNotAvailableError`). `ImportBatchModel` stays as-is — one batch still equals one commit action's ledger entries; per-row commits just produce mostly 1-row batches.

### `import_sessions` — undo pointer

```
last_resolved_row_id        UUID NULL
last_resolved_action        VARCHAR(20) NULL  -- assign | delete
last_resolved_prior_status  VARCHAR(20) NULL
```

### Statement status

Stops being flipped directly by a commit action. After every per-row assign/delete, recompute: if every non-`excluded_zero_amount` row on the statement is no longer `pending`, flip the statement to `committed`. Here that means "fully resolved," not "has ledger entries" — an all-deleted statement also reaches this state. Reuses the idle-check shape of `_release_source_pdf_if_idle` (`api/application/import_session.py:266`), checking row-level pending-ness instead of statement status.

### `ledger_entries` — "new" badge

Badge visibility is **not** a persisted review timestamp. A parser-imported row shows "New" while `created_at`'s calendar date in `America/Costa_Rica` is today. `posted_date` (statement transaction date) is ignored. Hand rows never show the badge. There is no explicit dismissal control; the badge drops off at Costa Rica midnight after the import day.

(`import_reviewed_at` was an earlier draft of this feature and is not the visibility rule.)

### Bulk review consistency

`AssignBulkImportService` must also skip `excluded_zero_amount` rows and mark every row it touches `committed`, so Bulk and Individual never disagree about what is resolved.

**A statement with partial per-row progress never reaches Bulk at all.** Rather than guarding Bulk against a half-reviewed statement, the ambiguous state is removed at the entry point — see §8. A session is either untouched (both Bulk and Individual are offered) or in progress (only Resume is offered). There is no third state for Bulk to reason about.

### Dead code to retire

Under row-level review, nothing commits or skips a whole statement from the Individual flow. Delete rather than leaving as parallel paths:

- `commit_individual_statement` / `skip_individual_statement` routes
- `AssignIndividualImportService`
- `SkipStatementService`
- `validate_individual_accept_eligible`
- `validate_individual_skip_eligible`

---

## 2. API shape

`GET /import/sessions/{sessionId}`, extended:

```jsonc
{
  "id": "...", "created_at": "...", "discarded_at": null,
  "statements": [
    {
      "id": "...", "product_id": "bac_credit", "status": "staged",
      "rows": [
        { "id": "...", "sequence": 0, "description": "...", "amount": "12345.00",
          "currency": "CRC", "posted_date": "2026-08-14", "status": "pending" }
      ],
      "zero_amount_excluded_count": 2
    }
  ],
  "failed_statements": [{ "id": "...", "product_id": "bac_credit" }],
  "undo": { "row_id": "...", "action": "assign" } | null
}
```

The client flattens `statements[].rows` (statement order, then `sequence`) into **one queue**. Review treats the session as a single flat stream of rows, not statement-grouped — line by line. Only `pending` rows appear. `failed` statements never contribute rows and are aggregated separately for the end screen.

### Endpoints

| Endpoint | Trigger | Behavior |
|---|---|---|
| `POST /import/sessions/{sessionId}/rows/{rowId}/assign` | left + right arrow | Body `{ "list_id": "..." }`. One endpoint, two callers — client sends `defaultListId` for left, `pickedListId` for right. Same pattern `commitIndividualStatement` uses today. |
| `POST /import/sessions/{sessionId}/rows/{rowId}/delete` | up arrow | Soft-marks the row `deleted`. Must be reversible for undo. |
| `POST /import/sessions/{sessionId}/undo` | down arrow | **Session-scoped, not row-scoped** — the button targets "whatever I just did." Reads `last_resolved_*`. If `assign`, deletes the created ledger entry and reverts the row to `pending`; if `delete`, reverts to `pending`. No-ops when nothing to undo. |
| `PATCH /import/sessions/{sessionId}/rows/{rowId}` | inline title edit | Body `{ "description": "..." }`. Only legal while `status == 'pending'`. |

### New error codes

Following the `code` convention in `mapIndividualReviewError`:

- `import_row_not_found`
- `import_row_not_available` — guarded UPDATE affected 0 rows; already resolved by a concurrent action
- `import_nothing_to_undo`

---

## 3. Card component and gesture mapping

Replaces the statement-card + button-list layout in `IndividualReviewPanel.tsx`. New layout: dimmed full-viewport overlay, one `ReceiptRow`-style card centered, fixed medium size, not a scrolling list.

### Card content

| Slot | Source |
|---|---|
| Title | `row.description` (`normalized_description`), inline-editable |
| Subtitle | merchant/store — conditional, blank today (conflict #1) |
| Body | `row.amount` formatted with `row.currency` |
| Bottom | `row.posted_date` only, no time (conflict #2) |

### Directional actions

Arrow affordances sit at the four card edges as visible buttons (always present, not swipe-only hints), each doubling as a gesture zone on touch.

| Direction | Action | Call | Touch gesture | Button |
|---|---|---|---|---|
| Left | Assign to default list | `assign` w/ `defaultListId` | swipe left | always visible |
| Right | Assign to selected list | `assign` w/ `pickedListId` | swipe right | always visible |
| Up | Delete (exclude from ledger) | `delete` | swipe up | always visible |
| Down | Undo last action | `undo` | **none** | always visible |

"Selected list" is chosen via a `SoftLedgerSelect` above the card, persisted in component state across the whole session (not reset per row) — the same `pickedListId`/`defaultListId` state `IndividualReviewPanel.tsx` already holds, repointed at row actions. Left/right disable under the same conditions the existing `canAcceptChosen`/`canAcceptDefault` booleans encode.

**Why down is button-only on both platforms:** avoids an accidental downward drag firing an irreversible-feeling action, and avoids touch-scroll conflicting with a fourth swipe axis on a viewport already using all four directions.

On successful assign/delete: card removed from the queue optimistically, next row slides in, session's `last_resolved_*` updates so undo becomes available. `useDrag` threshold/velocity logic carries over unchanged from the current `SWIPE_DISTANCE_THRESHOLD` implementation, re-targeted to row actions.

---

## 4. Undo semantics

Single-level only — no undo stack. A second `undo` immediately after a successful one no-ops via `import_nothing_to_undo` (button disables client-side once `undo` returns null).

Undo of an `assign` deletes the just-created `ledger_entries` row (no `split_overrides` row would exist yet for a same-session entry, so nothing is orphaned) and reverts `import_candidate_rows.status` to `pending`, re-inserting the row **at its original `sequence` position** in the queue, not at the front.

### Undo persistence — decided

**Server-persisted.** The undo pointer lives on `import_sessions` (`last_resolved_row_id` / `last_resolved_action` / `last_resolved_prior_status`), single action, cleared once used or superseded by a newer action. Undo survives a reload or app close, consistent with the resumability requirement — a user who closes the app right after a mis-swipe can reopen and still take it back.

Cost: three nullable columns and one extra write per resolve action. Accepted.

---

## 5. Zero-amount filtering + end-of-session summary

Zero-amount rows are excluded at `create_session` time (status `excluded_zero_amount` from creation), so they never enter the queue path.

When the flattened queue is exhausted, show a summary screen instead of redirecting straight to `/lists/{id}`:

- N rows committed, broken down by destination list
- K rows deleted this session
- `zero_amount_excluded_count` total across statements — "check the PDF if you expected a transaction here"
- `failed_statements` — statements that never parsed, so the user knows to add them by hand

This replaces today's per-statement Skip card for failed statements.

---

## 6. Title inline-edit (two-click), mirroring `ListsPanel.tsx`

Structure carries over from `startRename` / `cancelRename` / `commitRename`, the focus+select effect, the outside-pointerdown-cancel effect, `onRenameKeyDown`, and `styles.listNameEdit` — simplified, because only one row is ever on screen (no `Record<string, ...>` maps keyed by id).

**State:** `titleState: "idle" | "primed" | "editing"`, `draft: string`, `error: string | null`. Resets to `idle` whenever `row.id` changes (card advancing) — same idea as `ListsPanel`'s effect keyed on `editingId`, keyed here on `row.id`.

**Flow:**

1. **First click** on the title while `idle` → `primed`. Adds a soft border class only (occupying the space the input will take). No input mounted yet.
2. **Second click** while `primed` → `editing`, mounts the `<input>`, and a `useEffect` on `titleState === "editing"` focuses + `.select()`s it — identical to `ListsPanel`'s `renameInputRef` effect.

This is deliberately **not** the native `dblclick` event. It is explicit click-count state, so two clicks with any gap between them both count — matching the literal "first click… second click" behavior and more forgiving than timing-based double-click.

**Cancel:** outside `pointerdown` while `primed` **or** `editing` → back to `idle`, discarding the draft. Extends `ListsPanel`'s existing outside-pointerdown effect to also cover `primed`, since a stray click elsewhere should un-prime, not just un-edit.

**Keys:** Enter → `commitEdit()` (calls `PATCH .../rows/{rowId}`, mirroring `commitRename`'s draft-trim / empty-check / no-op-if-unchanged logic). Escape → `cancelEdit()`.

**Errors:** render as `renameErrors[list.id]` does today — inline, `role="alert"`, cleared on next attempt.

**Guard:** edits legal only while the row is `pending`, server-enforced via the same guarded-UPDATE idiom. If the row was resolved concurrently between prime and commit, PATCH returns `import_row_not_available` and the card refreshes from the next `GET`.

---

## 7. "New" badge in the destination list

`ReceiptRow` gets one optional prop (`newBadgeLabel?: string`), rendered as a `Chip` (`tone="accent"`) near the amount — reusing the existing `Chip`/`ChipTone` component rather than a bespoke element. `ui/app/lists/[listId]/page.tsx` wires it from `newBadgeLabelFrom`: `provenance === 'parser'` and `created_at`'s calendar date in `America/Costa_Rica` equals today. The statement `posted_date` is not used.

The badge is not dismissed by editing the row. It lasts until the Costa Rica calendar day of `created_at` is over. There is no "mark reviewed" menu item.

---

## 8. Resume entry point

Resumability (§ data model) is only half the feature — the user also needs a way back in. Today `UploadPanel.tsx` holds the session in component state *after an upload in that same visit* and renders three actions: Discard, Bulk (`/upload/bulk/{id}`), Review Individually (`/upload/review/{id}`). There is no discovery of an existing session on page load, so closing the tab mid-review strands the session.

**New:** `GET /import/sessions/active` returns the caller's most recent non-discarded session with at least one `pending` row, or `null`. `ui/app/upload/page.tsx` is already a server component (`force-dynamic`) — it fetches this alongside `fetchSession()` and passes it to `UploadPanel` as an initial prop.

`UploadPanel` then renders one of three states:

| Session state | Actions offered |
|---|---|
| None active | Upload a PDF (today's default) |
| Active, **untouched** (every row still `pending`) | Discard · Bulk · Review Individually — today's three actions |
| Active, **partially resolved** (≥1 row non-`pending`, ≥1 still `pending`) | **Resume review** · Discard |

A partially-resolved session offers **no** Bulk path and no new upload. Resume deep-links to `/upload/review/{sessionId}`, which picks up at the first `pending` row by `sequence` — the queue and the undo pointer are both already server-side, so the card comes back exactly where it was left.

**Amended 2026-08-21 (Sprint Change Proposal 2026-08-21):** a session with **zero pending** rows that has **not** been Saved on ImportReviewSheet is still active. Resume opens the sheet. Last-card does not complete the session.

This is why §1 needs no Bulk-side guard against half-reviewed statements: the state that would have confused Bulk is unreachable from the UI. Bulk only ever sees an untouched session. The API-level guard still belongs in `AssignBulkImportService` as defense in depth (a direct API call could still attempt it), returning `import_row_not_available` — but it is a backstop, not the user-facing mechanism.

Discarding a partially-resolved session must **not** roll back already-committed ledger entries — those are real entries the user deliberately assigned. Discard only abandons the remaining `pending` rows and releases the source PDF via the existing `_release_source_pdf_if_idle` path. The discard confirmation copy should say so explicitly, since "discard" otherwise reads as "undo everything."

---

## Files touched

**Backend**
- `api/adapters/persistence/migrations/versions/` — new revision
- `api/adapters/persistence/models.py`
- `api/adapters/persistence/import_sessions.py`
- `api/application/import_session.py`
- `api/domain/import_session.py`
- `api/domain/errors.py`
- `api/api/schemas/import_sessions.py`
- `api/api/routes/import_sessions.py`

**Frontend**
- `ui/app/upload/uploadClient.ts`
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` — near-full rewrite
- `ui/app/upload/page.tsx` — fetch active session (§8)
- `ui/app/upload/UploadPanel.tsx` — three-state entry point (§8)
- `ui/components/soft-ledger/ReceiptRow.tsx` — badge prop
- `ui/app/lists/[listId]/page.tsx` — badge wiring
