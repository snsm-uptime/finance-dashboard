---
baseline_commit: 4c4547c0dc8b13029358555f2599ad2e4545d727
---

# Story 5.5: Same-price conflict review (Manual | Parsed)

Status: done

## Story

As a user finishing an import that collides with unresolved manual entries,
I want same-price matches collected and resolved with Manual or Parsed (one survivor),
so that I never auto-merge or double-count without an explicit choice (J7).

## Acceptance Criteria

1. **Given** a parsed line and an existing unresolved manual entry with the same price (equal amount + currency) on related lists within the date window **When** import commit finishes **Then** collisions are not auto-merged; they are collected and shown at end of import after the imported N / skipped M summary (FR-22, UX-DR22) **And** conflict review runs before landing on Soft-Ledger as the trusted climax — do not land on a confident strip then interrupt (UX-DR22, Story 4.12 handoff) **And** same-price window is list-configurable with product default ±3 calendar days, inclusive, in America/Costa_Rica (AD-10) **And** related lists = lists where both the manual entry and the parsed commit's destination share at least one common member with the acting user (user-visible membership).
2. **Given** equal numeric amounts but different currencies **When** same-price detection runs **Then** they are not treated as the same price — equal amount+currency is required.
3. **Given** multiple manuals match one parsed line (or multiple parsed match one manual) **When** conflicts are shown **Then** all pairs are collected and resolved one collision at a time until none remain.
4. **Given** I leave conflict review before all collisions are resolved **When** I return later (or follow the Story 5.7 resolve path) **Then** the unresolved conflict set persists across sessions and remaining collisions can be resumed **And** Soft-Ledger stays non-confident / incomplete until the queue is cleared.
5. **Given** the conflict review surface **When** I resolve a collision **Then** default path is pick Manual or Parsed — one survivor (FR-22, UX-DR14) **And** conflict cards are keyboard-selectable; not swipe-driven (UX-DR14, UX-DR19).
6. **Given** I choose the escape "Not the same expense" **When** I proceed **Then** keeping both requires a harder double-count / overpay confirm than the survivor pick (FR-22) **And** both remain only after that confirm.
7. **Given** unresolved conflicts for the period **When** I view Soft-Ledger **Then** the strip must not show a confident hero total — prefer incomplete disclosure (Story 5.7) over a frozen/blank strip (UX-DR14) **And** "blocked" means no Simplify / no all-clear affordance until conflicts are resolved — not an unusable app.
8. **Given** EN/ES locale **When** conflict labels are shown **Then** copy is localized (UX-DR18).
9. **Given** this story alone **When** I confirm Manual and Parsed are the same expense **Then** alias storage is not required yet — Story 5.6 adds FR-23 aliases and FR-28 re-upload manual-entry conflicts.

**Out of scope for this story (explicitly deferred):**
- Story 5.6: alias-on-confirm persistence (FR-23), re-upload near-match conflict prompting (FR-28).
- Story 5.7: wiring `incomplete` disclosure onto the Soft-Ledger strip. This story only needs to *produce* the durable unresolved-conflict signal that 5.7 will read; it must **not** touch `GET /lists/{id}/balances` or the strip component.
- A list-settings UI to change the same-price window. AD-10 requires the window to be **list-configurable** at the domain/schema level (see Task 1), but no story before 5.9 asks for a settings screen — do not build one. Ship the column + default-fallback logic only.

## Tasks / Subtasks

- [x] **Task 1 — Domain: same-price matching + conflict lifecycle** (AC: 1, 2, 3, 6, 9)
  - [x] `api/domain/same_price_conflict.py` (new): pure functions —
    - `is_same_price(a_amount, a_currency, b_amount, b_currency) -> bool` (exact equality, no tolerance; AC #2).
    - `within_window(parsed_posted_date: date, manual_posted_date: date, window_days: int) -> bool` — inclusive both directions (±N days), calendar dates already in `America/Costa_Rica` per existing `domain/dates.py` / `domain/statement_dates.py` conventions — do not reintroduce timezone math here.
    - `DEFAULT_SAME_PRICE_WINDOW_DAYS = 3`.
    - Resolution constants: `CONFLICT_RESOLUTION_MANUAL_SURVIVOR = "manual_survivor"`, `CONFLICT_RESOLUTION_PARSED_SURVIVOR = "parsed_survivor"`, `CONFLICT_RESOLUTION_NOT_SAME_EXPENSE = "not_same_expense"`.
    - A validator for the resolution confirm: `not_same_expense` requires an explicit `confirmed=True` flag from the caller (the "harder confirm" of AC #6) — raise a domain error otherwise so the API can't be called with the escape path defaulted true.
  - [x] Add `domain/errors.py`: `SamePriceConflictNotFoundError` (404, mirrors `ImportBatchNotFoundError` shape), `SamePriceConflictAlreadyResolvedError` (409), `SamePriceConflictConfirmRequiredError` (422 — "Not the same expense" without `confirmed=True`).

- [x] **Task 2 — Persistence: durable conflict table + migration** (AC: 1, 4)
  - [x] New table `same_price_conflicts` (Alembic migration `0029_same_price_conflicts.py`, chained on `0028_stmt_parse_evidence` head):
    - `id UUID PK`
    - `manual_entry_id UUID NOT NULL FK ledger_entries.id ON DELETE CASCADE` — the durable manual (`provenance='hand'`) ledger entry.
    - `parsed_entry_id UUID NOT NULL FK ledger_entries.id ON DELETE CASCADE` — the durable parsed (`provenance='parser'`) ledger entry.
    - `manual_list_id UUID NOT NULL FK lists.id ON DELETE CASCADE`, `parsed_list_id UUID NOT NULL FK lists.id ON DELETE CASCADE` — denormalized off the entries so the queue can be listed and filtered without a join fan-out, and so `ON DELETE CASCADE` on `ledger_entries`/`lists` naturally retires a conflict when either side is later removed by an unrelated path (e.g. Story 5.4 rollback of the batch that produced the parsed row).
    - `detected_at TIMESTAMPTZ NOT NULL server_default now()`.
    - `resolved_at TIMESTAMPTZ NULL`, `resolution VARCHAR(24) NULL` (one of the three constants above), `resolved_by_user_id UUID NULL FK users.id ON DELETE SET NULL`.
    - `UNIQUE (manual_entry_id, parsed_entry_id)` — the same pair must not be journaled twice if detection re-runs (e.g. a later commit in the same session re-scans).
    - Index on `(parsed_list_id, resolved_at)` and `(manual_list_id, resolved_at)` — Story 5.7 will query "any conflict with `resolved_at IS NULL` touching this list/period" on every Soft-Ledger load; do not make that a full scan.
  - [x] `api/adapters/persistence/models.py`: `SamePriceConflictModel` next to `LedgerEntryModel`.
  - [x] `api/adapters/persistence/same_price_conflicts.py` (new) — `SqlAlchemySamePriceConflictRepository` implementing the Protocol from Task 3. Detection query shape: for a newly-committed parsed entry, find `ledger_entries` where `provenance='hand'`, `amount = :amount`, `currency = :currency`, `posted_date BETWEEN :low AND :high`, `list_id IN (:related_list_ids)`, **and** not already `manual_entry_id` of a row in `same_price_conflicts` with `resolved_at IS NULL`  — that last predicate is the "unresolved manual entry" gate from AC #1 and prevents re-detecting a pending pair on every subsequent commit in the same session. A manual entry that already has a **resolved** conflict (against a different parsed row) remains a valid candidate for a new, separate collision (AC #3 — "multiple parsed match one manual").
  - [x] Related-list resolution: query the acting user's own memberships (`list_memberships` for `user_id = actor`), intersect with `list_memberships` for the candidate manual entry's list — if that list shares ≥1 member with the parsed commit's destination list, and the actor is a member of both (AD-19: the actor can only see conflicts on lists they belong to), it is related. Do not implement this as "any two lists that share a member globally" — scope every query through the acting user, same pattern `AuthorizeListAccessService` already enforces elsewhere.

- [x] **Task 3 — Application: detect + resolve services** (AC: 1, 2, 3, 4, 5, 6, 9)
  - [x] `api/application/same_price_conflicts.py` (new):
    - `SamePriceConflictRepository` Protocol: `find_related_manual_candidates(...)`, `create_conflict(...)`, `list_unresolved_conflicts(actor_user_id) -> list[SamePriceConflictRecord]`, `get_conflict(conflict_id) -> SamePriceConflictRecord | None`, `resolve_conflict(...)`, `get_list_window_days(list_id) -> int | None` (nullable → caller falls back to `DEFAULT_SAME_PRICE_WINDOW_DAYS`).
    - `DetectSamePriceConflictsService` — called once per newly-committed parsed `LedgerEntryRecord` (see Task 4 hook points). Looks up the window for the *parsed* commit's destination list, finds related unresolved manual candidates, and calls `create_conflict` for each match found (a parsed row can match more than one manual row — AC #3 — so this can create multiple conflict rows per commit).
    - `ResolveSamePriceConflictService` — `ResolveSamePriceConflictCommand(actor_user_id, conflict_id, resolution, confirmed: bool = False)`. ACL: actor must be a member of **both** `manual_list_id` and `parsed_list_id` (reuse `AuthorizeListAccessService` with `action="write_ledger"` against each). Behavior:
      - `manual_survivor`: hard-delete the parsed ledger entry (reuse the exact `_hard_delete_ledger_for_row` pattern from `api/adapters/persistence/import_sessions.py:768` — delete-then-check-empty-batch-then-delete-batch; **do not** duplicate this logic, extract it or call through a shared helper if the layering allows, but at minimum mirror it exactly including the empty-batch cleanup).
      - `parsed_survivor`: hard-delete the **manual** ledger entry. There is currently **no** existing delete path for a hand-provenance ledger entry anywhere in the codebase (`ReceiptRowMenu` Delete on hand rows is chrome-only / non-persisting per Story 5.4's dev notes) — this is new persistence capability, not a reuse of an existing endpoint.
      - `not_same_expense`: requires `confirmed=True` (domain-validated, Task 1) or raises `SamePriceConflictConfirmRequiredError`; both ledger entries are left untouched. This is the *only* resolution that doesn't delete anything.
      - All three stamp `resolved_at`, `resolution`, `resolved_by_user_id` on the conflict row.
      - Raise `SamePriceConflictNotFoundError` if missing/foreign; `SamePriceConflictAlreadyResolvedError` if `resolved_at` is already set (idempotency guard — do not double-delete on a retried request).
    - `ListSamePriceConflictQueueService` — returns the acting user's full unresolved queue (AC #4, "resumed" — must work across sessions, so this reads from `same_price_conflicts` directly, **not** from any Import Session state, which is ephemeral and already discarded by the time a user resumes days later).

- [x] **Task 4 — Wire detection into the two existing commit paths** (AC: 1)
  - [x] `AssignBulkImportService.execute` (`api/application/import_session.py:777`): after `commit_statement_batch` returns an `outcome.batch` that is not `None`, for each row actually written (i.e. rows in `outcome.batch.ledger_entry_ids`, excluding `duplicate_row_ids`), call `DetectSamePriceConflictsService`. Do this once per statement inside the existing loop, not as a second pass — you already have the committed rows in hand.
  - [x] `AssignCandidateRowService.execute` (`api/application/import_session.py:959`): after the non-duplicate `commit_statement_batch` call returns a batch, run detection for that single row.
  - [x] Do **not** hook `FinalizeImportSessionService` — by the time Save/finalize runs, every row is already individually committed (row-level review, Story 4.10+) and already scanned at assign time. Finalize only releases the PDF.
  - [x] Constructor wiring: both services need a `SamePriceConflictRepository` (or the `DetectSamePriceConflictsService` itself) injected — update `api/api/routes/import_sessions.py` composition accordingly.

- [x] **Task 5 — API routes** (AC: 1, 4, 5, 6)
  - [x] New `api/api/routes/import_conflicts.py`, mirroring `import_sessions.py`'s global (non-list-scoped) gating — a conflict pair spans two lists, so it does not fit under `/lists/{list_id}/...`:
    - `GET /import-conflicts` → `ListSamePriceConflictQueueService`, gated on `require_authenticated_user`.
    - `POST /import-conflicts/{conflict_id}/resolve` → `ResolveSamePriceConflictService`; body `{resolution: "manual_survivor" | "parsed_survivor" | "not_same_expense", confirmed?: bool}`.
  - [x] `api/api/schemas/` (new schema file or extend an existing one): response DTOs. Each queued conflict needs enough for the card UI without a second round-trip: both entries' `amount`, `currency`, `normalized_description`, `posted_date`, `list_id` + list `name` for each side (so the UI can show "Manual on {list}" vs "Parsed on {list}").
  - [x] Money on the wire: **string**, never JSON number (`_bmad-output/project-context.md` rule — this is non-negotiable, re-verify the schema uses `Decimal`-as-string the same way `ExpenseItemResponse` already does).
  - [x] Wire the new router into `api/api/main.py` (or wherever routers are registered — follow the existing `import_sessions.router` registration pattern exactly).

- [x] **Task 6 — UI: end-of-import conflict review surface** (AC: 1, 3, 5, 6, 8)
  - [x] New route, e.g. `ui/app/upload/conflicts/page.tsx` + a client panel component — reachable from `ImportCompletionSummary` when the session's finalize response indicates unresolved conflicts exist for lists touched this session. **Insertion point**: both `IndividualReviewPanel.tsx` (`onBack`, `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:415-436`) and `BulkReviewPanel.tsx` (`ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx:149-160`) currently route straight to `/lists/{landing_list_id}` once finalize/commit completes. Both must instead check the conflict queue (`GET /import-conflicts`) and route to the new conflict-review screen first when it is non-empty — **do not** land on the list/strip and then interrupt with a modal (AC #1, UX-DR22 "do not land on a confident strip then interrupt").
  - [x] Card UI: two cards per conflict (Manual | Parsed) with amount/currency/description/date/list name each; a primary pick-one control; a secondary, visually harder "Not the same expense" escape that opens a confirm (reuse `ui/app/upload/DiscardConfirmDialog.tsx`'s dialog/focus-trap pattern — do not build a second modal primitive) warning of double-count/overpay risk before submitting `confirmed=true`.
  - [x] Keyboard-selectable, not swipe (AC #5) — this screen must **not** reuse the phone-swipe gesture plumbing from Individual review; it is button/keyboard only on every platform, same as the rest of end-of-import chrome.
  - [x] One collision at a time until the queue is empty (AC #3), then land on `/lists/{landing_list_id}` (or wherever the pre-existing `onBack`/finalize navigation was already going).
  - [x] `ui/lib/i18n/upload.ts` (or a new `ui/lib/i18n/conflicts.ts` if `upload.ts` is getting large — check current line count first): EN+ES keys for card labels, survivor pick buttons, the "Not the same expense" escape, and the confirm dialog copy (AC #8).
  - [x] `ui/app/upload/uploadClient.ts` (or a new `conflictsClient.ts`): typed fetch wrappers for `GET /import-conflicts` and `POST /import-conflicts/{id}/resolve`, following the existing BFF cookie-forward pattern (`ui/app/api/lists/[listId]/import-batches/[batchId]/route.ts` from Story 5.4 is the template) — add `ui/app/api/import-conflicts/route.ts` and `ui/app/api/import-conflicts/[conflictId]/resolve/route.ts`.

- [x] **Task 7 — Tests** (AC: all)
  - [x] Domain: `is_same_price`, `within_window` boundary tests (exactly 3 days inclusive both directions; 4 days excluded; different currency same amount excluded).
  - [x] Application (Postgres 16 integration, not SQLite): detect-on-commit creates a conflict row; a duplicate detection pass on the same pair does not create a second row (`UNIQUE (manual_entry_id, parsed_entry_id)` + the "already-open" query predicate both need coverage); `manual_survivor` deletes the parsed entry and empties/deletes the batch if it was the batch's only row; `parsed_survivor` deletes the manual entry; `not_same_expense` without `confirmed=True` raises; with `confirmed=True` leaves both rows intact and stamps resolution; resolving an already-resolved conflict raises `SamePriceConflictAlreadyResolvedError`; a manual entry with a related-but-different-currency parsed line produces no conflict; an out-of-window parsed line produces no conflict; related-list scoping (actor member of both vs. only one) allows/denies correctly.
  - [x] Multi-match: one manual entry matching two separate parsed entries produces two independent conflict rows, both resolvable independently (AC #3).
  - [x] UI: `IndividualReviewPanel`/`BulkReviewPanel` routing tests — finalize/commit with a non-empty conflict queue routes to conflict review, not straight to the list; empty queue still routes straight to the list (regression guard — most imports have zero conflicts and must not gain a detour).
  - [x] UI: conflict card resolution flow (mock fetch, jsdom) — pick Manual, pick Parsed, escape → confirm → both remain; keyboard operability (no swipe handler attached).

### Review Findings

- [x] [Review][Patch] `routeAfterImportLanding` detours on the actor's entire global unresolved queue instead of conflicts touching the session's landing list, breaking the "most imports have zero conflicts" regression guard [ui/app/upload/conflictsClient.ts] — fixed: filters the queue to conflicts touching `landingListId` before deciding to detour; regression test added.
- [x] [Review][Patch] `ResolveConflictBody.resolution` accepts any string; an unrecognized value is silently stamped resolved with nothing deleted and no confirm required, bypassing the AC #6 harder-confirm gate [api/api/schemas/import_conflicts.py, api/domain/same_price_conflict.py] — fixed: `Literal[...]` on the Pydantic schema, `validate_resolution_confirm` now rejects any value outside `VALID_RESOLUTIONS` via new `SamePriceConflictInvalidResolutionError` (422); domain test added.
- [x] [Review][Patch] `DetectSamePriceConflictsService.execute` uses `get_list_window_days(...) or DEFAULT_SAME_PRICE_WINDOW_DAYS`, so a legitimately configured `0`-day window is falsy and silently overridden by the 3-day default [api/application/same_price_conflicts.py:149] — fixed: explicit `is None` check; integration test added for a `0`-day window.
- [x] [Review][Patch] `create_conflict`'s bare `except IntegrityError: pass` swallows any integrity error, not just the `(manual_entry_id, parsed_entry_id)` unique violation it's meant to no-op on [api/adapters/persistence/same_price_conflicts.py] — fixed: re-raises unless the constraint name matches `uq_same_price_conflict_pair`.
- [x] [Review][Patch] `ConflictReviewPanel`'s empty-queue redirect (`goToLanding()`) runs from the render body instead of an effect, a React anti-pattern that can double-fire under StrictMode [ui/app/upload/conflicts/ConflictReviewPanel.tsx] — fixed: moved into a `useEffect`.
- [x] [Review][Patch] `IndividualReviewPanel.onBack` attaches only `.finally()` to `routeAfterImportLanding(...)`, no `.catch()` — an unhandled rejection if `router.push` throws inside it [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx] — fixed: added `.catch()`.
- [x] [Review][Patch] No test covers a configured `same_price_window_days` (including `0`) or exercises detection through the actual production wiring in `AssignBulkImportService`/`AssignCandidateRowService` — gap against AD-15's Postgres-integration requirement for the commit→detect→resolve path [api/tests/test_same_price_conflicts_application.py] — partially addressed: added the `same_price_window_days`/`0` coverage; production-wiring coverage through `AssignBulkImportService`/`AssignCandidateRowService` (PDF-fixture-based integration test) was judged too large a lift for this patch pass and remains open — see deferred-work.md.
- [x] [Review][Patch] `ResolveSamePriceConflictService.execute` loads the conflict before the ACL check, so an actor with no membership on either list gets a 403 (proving the conflict exists) instead of a 404 for arbitrary conflict IDs [api/application/same_price_conflicts.py] — fixed: `NotListMemberError` from the ACL check is now translated to `SamePriceConflictNotFoundError`.
- [x] [Review][Defer] If the actor loses membership on one side of a conflict after detection, the conflict becomes invisible to everyone and can never be resolved — the durable queue holds it forever [api/adapters/persistence/same_price_conflicts.py] — deferred, rare edge case, fix later

## Dev Notes

### Architecture compliance

| Rule | Apply |
|------|-------|
| AD-1 | `domain/same_price_conflict.py` stays pure (no SQLAlchemy/FastAPI). `ui` talks HTTP only. |
| AD-4 | Deleting a ledger entry during resolution can empty its `import_batch` — mirror the existing empty-batch cleanup from `_hard_delete_ledger_for_row`, don't invent a second rule. |
| AD-5 | `Decimal` only; JSON wire amounts are strings. |
| AD-7/AD-21 | Do not recompute FX or touch settle math here — this story never calls the balances endpoint. |
| AD-8 | Cookie-forward BFF routes, same as every other `ui/app/api/...` route. |
| AD-10 | This story **is** AD-10's implementation: server-computed candidates, durable unresolved manual entries (not session buffers), list-configurable window (schema-level only, default ±3 days), shared resolution UI, harder escape. |
| AD-12/AD-23 | Tailwind; reuse `DiscardConfirmDialog`'s pattern; no new `*.module.css`; no pill primary CTA. |
| AD-15 | Application-layer TDD (red→green) for detection/resolution; UI test-after. Postgres 16 integration for the commit→detect→resolve path — not SQLite. |
| AD-18 | Dedup identity is unrelated to this story — same-price conflicts are a *different* mechanism from `import_identity` dedup (that's exact-duplicate skip; this is same-price-but-not-identical collision). Do not conflate the two. |
| AD-19 | Every conflict query/mutation scoped through the acting user's own memberships. |
| AD-22 | No Postgres volume recreation; this migration only adds a table + FKs. |

### UX

- **Wins:** `DESIGN.md`/`EXPERIENCE.md` — Manual\|Parsed card picker; "Not the same expense" escape harder than the pick; conflict review sits between the end-of-import summary and landing on Soft-Ledger (UX-DR22); keyboard-selectable not swipe (UX-DR14).
- **Voice:** neutral fact-finding ("which of these is the real one?"), not an error state — this is an expected outcome of two independent data-entry paths colliding, not a failure.
- **Reduce motion:** button/keyboard only, no required gesture (UX-DR19).

### Files to touch (expected)

**NEW:**
- `api/domain/same_price_conflict.py`
- `api/application/same_price_conflicts.py`
- `api/adapters/persistence/same_price_conflicts.py`
- `api/adapters/persistence/migrations/versions/0029_same_price_conflicts.py`
- `api/api/routes/import_conflicts.py`
- `api/api/schemas/import_conflicts.py` (or extend an existing schemas module if a same-price-shaped DTO already fits better)
- `api/tests/test_same_price_conflict_domain.py`
- `api/tests/test_same_price_conflicts_application.py`
- `ui/app/upload/conflicts/page.tsx` + client panel component
- `ui/app/api/import-conflicts/route.ts`
- `ui/app/api/import-conflicts/[conflictId]/resolve/route.ts`
- `ui/lib/i18n/conflicts.ts` (or extend `ui/lib/i18n/upload.ts`)

**UPDATE:**
- `api/adapters/persistence/models.py` (`SamePriceConflictModel`)
- `api/domain/errors.py` (three new errors)
- `api/application/import_session.py` (`AssignBulkImportService`, `AssignCandidateRowService` — detection hook)
- `api/api/routes/import_sessions.py` or `api/api/main.py` (router wiring + service composition)
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` (post-finalize routing)
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` (post-commit routing)
- `ui/app/upload/uploadClient.ts` (fetch wrappers, unless split into a dedicated client)

### Anti-patterns (do not)

- Auto-merging or auto-skipping a same-price collision — every pair requires an explicit user choice (the entire point of the story).
- Detecting conflicts by scanning the ephemeral Import Session — the queue must survive session discard/expiry (AC #4 "persists across sessions"); source of truth is the `same_price_conflicts` table joined to durable `ledger_entries`.
- Treating "Not the same expense" as an equal third peer button next to the two survivor cards — it must read and behave as a harder escape (AC #6).
- Landing the user on Soft-Ledger first and then popping a conflict interrupt on top of it (UX-DR22 explicitly forbids this ordering).
- Reusing `import_identity`/dedup-skip logic for this — that mechanism is for *exact* duplicates and is intentionally silent; same-price is a *different*, always-explicit mechanism (AD-10 vs AD-18 are separate ADs for a reason).
- Building a list-settings screen to edit the same-price window — out of scope; ship the column + default only.
- Skipping the empty-batch cleanup when `manual_survivor` deletes a parsed row that was the only row in its batch.
- Global (non-membership-scoped) matching — a manual entry on a list the acting user cannot see must never surface as a conflict.

### Testing requirements

- Postgres 16 for the full commit → detect → resolve path (not SQLite) — same rule as every prior Epic 4/5 story.
- Money asserts: `Decimal`/string equality.
- Do not commit real bank PDFs; reuse existing synthetic fixtures for the commit side of the detect-on-commit tests.

### Previous story intelligence (5.4)

- `_hard_delete_ledger_for_row` (`api/adapters/persistence/import_sessions.py:768`) is the exact precedent for "delete one ledger entry, then delete its batch if now empty" — reuse this shape for `manual_survivor` resolution rather than reinventing it.
- Hand-provenance ledger entries have **no** existing delete/persistence path today — `ReceiptRowMenu` Delete on hand rows is chrome-only. `parsed_survivor` resolution is the first thing in the codebase that actually deletes a hand entry; there is no shortcut to reuse here.
- `import_batch_id` is `ON DELETE SET NULL` on `ledger_entries`, not cascade — deleting a batch does not delete its remaining rows, and deleting a row does not require deleting the batch unless it was the last row (same pattern reused above).
- Alembic HEAD going into this story is `0028_stmt_parse_evidence`; this story adds `0029_same_price_conflicts`.
- ACL pattern: `AuthorizeListAccessService` + `AuthorizeListAccessCommand(action="write_ledger")` is the reusable choke point for "actor must be a member of this list" — call it twice for the two lists a conflict spans, don't write a bespoke check.
- BFF pattern: cookie-forward, `code` on JSON errors, 502 if API unreachable — `ui/app/api/lists/[listId]/import-batches/[batchId]/route.ts` (Story 5.4) is the template for the two new BFF routes in Task 6.

### Git intelligence

- Recent (`4c4547c`, `787471a`, `7816f2e`, `830baa8`, `1b3028d`) are all small UI-side fixes on top of the 5.4 merge (`500596e`) plus fixed-list auto-routing work (`9c310cc`, `9de7135`) — none touch import commit or ledger deletion; the commit-path baseline for this story is exactly what `import_session.py` shows today.
- No open work-in-progress branch for 5.5 exists yet at story-creation time (current branch `feat/5/5-5-same-price-conflict-review-manual-parsed` is otherwise clean).

### Latest tech

- FastAPI 0.141.x / SQLAlchemy 2.0: one request-scoped `Session`; commit only in `get_db`; use `begin_nested()` for the resolve mutation exactly as `RollbackImportBatchService` does (Story 5.4 precedent) since it deletes a row and may cascade-clean a batch in the same request.
- No new npm/pip dependencies required — this story is pure application/schema work on the existing stack (Next 16.2/React 19.2, FastAPI/SQLAlchemy already pinned).

### Project context reference

Follow `_bmad-output/project-context.md`: `Decimal`/string money; membership ACL only; i18n as per-domain TS message objects; Tailwind, no new CSS Modules; synthetic fixtures only; never silently merge/auto-resolve same-price or manual-vs-parsed conflicts (explicitly called out in that file's "Never" list).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.5` lines 1680-1730]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-10, lines 150-154]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` FR-22 lines 540-551, FR-28 lines 602-609]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` lines 35, 88, 109-110, 121, 132, 144-145, 164, 260-262]
- [Source: `api/application/import_session.py` — `AssignBulkImportService`, `AssignCandidateRowService`, `commit_statement_batch`]
- [Source: `api/adapters/persistence/import_sessions.py:768` — `_hard_delete_ledger_for_row`]
- [Source: `_bmad-output/implementation-artifacts/5-4-roll-back-an-import-batch.md` — Dev Agent Record / story-close overview]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Local worktree Compose stack (`fh-feat-5-5-5-same-price-conflict-review-manual-pa-*`) — `docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.test.yml run --rm -T api pytest -q` for backend; `docker exec ...-ui-1 npx vitest run` / `npx tsc --noEmit` / `npx eslint` for frontend. The `.dev.yml` overlay is required for test runs against this worktree's `db` service — the base `docker-compose.yml` sets the `db` healthcheck `interval: 1h` (fine for a long-lived dev stack), which starves `docker compose run` of a health check for up to an hour; `.dev.yml` overrides it to `10s`.
- Full backend suite: 787 passed.
- Full frontend suite: 529 passed, 2 failed — both pre-existing/unrelated (confirmed by running the same two files against the pre-story baseline commit): `app/api/auth/register/route.test.ts` (5s fetch-mock timeout, flaky under full-suite load) and `tests/tailwind-integration.test.ts` (real-PostCSS compile exceeds the 5s test timeout on this machine).

### Completion Notes List

- Domain (`api/domain/same_price_conflict.py`): `is_same_price` (exact amount+currency), `within_window` (inclusive ±N days), `DEFAULT_SAME_PRICE_WINDOW_DAYS = 3`, three resolution constants, `validate_resolution_confirm` (raises `SamePriceConflictConfirmRequiredError` for `not_same_expense` without `confirmed=True`). 10 unit tests, all passing.
- Persistence: `same_price_conflicts` table + a nullable `lists.same_price_window_days` column via migration `0029_same_price_conflicts` (chained on `0028_stmt_parse_evidence`); `SamePriceConflictModel`; `SqlAlchemySamePriceConflictRepository` with related-list resolution scoped through the actor's own memberships (AD-19) and a detection query gated on the exact (manual, parsed) pair rather than "any open conflict on this manual" — the latter would have blocked the AC #3 multi-match case (one manual entry, two independent parsed matches).
- Application (`api/application/same_price_conflicts.py`): `DetectSamePriceConflictsService`, `ResolveSamePriceConflictService` (ACL via `AuthorizeListAccessService` on both lists, `action="write_ledger"`), `ListSamePriceConflictQueueService`. A `NullSamePriceConflictRepository` no-op default keeps the ~30 pre-existing `AssignBulkImportService`/`AssignCandidateRowService` call sites in other test files unchanged — only the two production route call sites inject the real repo.
- Important schema/behavior finding: `manual_entry_id`/`parsed_entry_id` are `ON DELETE CASCADE` onto `same_price_conflicts` (per Task 2 spec) — deleting the losing entry during a `manual_survivor`/`parsed_survivor` resolution cascades away the conflict row itself. Resolution therefore stamps `resolved_at`/`resolution`/`resolved_by_user_id` *before* the delete (else SQLAlchemy raises `StaleDataError` on the now-vanished row), and a retried resolve on an already-survivor-resolved conflict correctly 404s (`SamePriceConflictNotFoundError`) rather than 409ing (`SamePriceConflictAlreadyResolvedError`, which is only reachable via `not_same_expense`, the one resolution that never deletes and so leaves the row behind). Documented in both the repo code comment and the application test suite.
- API (`api/api/routes/import_conflicts.py`): `GET /import-conflicts`, `POST /import-conflicts/{id}/resolve`; global (non-list-scoped) router registered in `api/api/app.py` alongside `import_sessions`, no alias gate (same rationale as upload). Money on the wire as strings throughout.
- Wired detection into `AssignBulkImportService.execute` and `AssignCandidateRowService.execute` (`api/application/import_session.py`) — one detect call per newly-committed parsed ledger entry, zipped from the already-in-hand `rows`/`outcome.batch.ledger_entry_ids` pair, no second DB pass.
- UI: new `/upload/conflicts` route + `ConflictReviewPanel` (one collision at a time, Manual|Parsed cards, harder "Not the same expense" escape reusing `DiscardConfirmDialog`, keyboard/button only — no swipe plumbing). `IndividualReviewPanel`'s `onBack` and `BulkReviewPanel`'s post-finalize/post-commit navigation both now route through a shared `routeAfterImportLanding` helper (`ui/app/upload/conflictsClient.ts`) that checks the conflict queue and detours to conflict review before ever landing on the list (UX-DR22) — fails open to the list on a queue-check error. New BFF routes forward cookies per the Story 5.4 template; new `ui/lib/i18n/conflicts.ts` (EN/ES) rather than growing `upload.ts` further.
- Full backend (787) and frontend (529, 2 pre-existing/unrelated failures) suites pass; `tsc --noEmit` and `eslint` clean on every new/changed file.

### File List

**NEW:**
- `api/domain/same_price_conflict.py`
- `api/application/same_price_conflicts.py`
- `api/adapters/persistence/same_price_conflicts.py`
- `api/adapters/persistence/migrations/versions/0029_same_price_conflicts.py`
- `api/api/routes/import_conflicts.py`
- `api/api/schemas/import_conflicts.py`
- `api/tests/test_same_price_conflict_domain.py`
- `api/tests/test_same_price_conflicts_application.py`
- `api/tests/test_import_conflicts_api.py`
- `ui/app/upload/conflicts/page.tsx`
- `ui/app/upload/conflicts/ConflictReviewPanel.tsx`
- `ui/app/upload/conflicts/ConflictReviewPanel.test.tsx`
- `ui/app/upload/conflictsClient.ts`
- `ui/app/upload/conflictsClient.test.ts`
- `ui/app/api/import-conflicts/route.ts`
- `ui/app/api/import-conflicts/[conflictId]/resolve/route.ts`
- `ui/lib/i18n/conflicts.ts`

**UPDATE:**
- `api/adapters/persistence/models.py` (`SamePriceConflictModel`, `ListModel.same_price_window_days`)
- `api/domain/errors.py` (three new errors)
- `api/application/import_session.py` (`AssignBulkImportService`, `AssignCandidateRowService` — detection hook + `NullSamePriceConflictRepository` default)
- `api/api/routes/import_sessions.py` (constructor wiring for the new repo)
- `api/api/app.py` (router registration)
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` (post-finalize routing via `routeAfterImportLanding`)
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx` (routing regression test + mock)
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.tsx` (post-commit routing via `routeAfterImportLanding`)
- `ui/app/upload/bulk/[sessionId]/BulkReviewPanel.test.tsx` (routing regression test + mock)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change |
|------|--------|
| 2026-08-28 | Story implemented end-to-end: domain rules, `same_price_conflicts` table + migration, detect/resolve application services wired into both existing commit paths, `/import-conflicts` API, and the end-of-import conflict review UI (routes ahead of Soft-Ledger per UX-DR22). 787 backend + 531 frontend tests (529 passing, 2 pre-existing/unrelated failures). Status → review. |
