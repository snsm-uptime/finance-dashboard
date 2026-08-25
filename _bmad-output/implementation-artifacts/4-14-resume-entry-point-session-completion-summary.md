---
baseline_commit: 4e5753a
---

# Story 4.14: Resume entry point + session completion summary

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **This story owns two user-facing surfaces:** (1) discovering an in-flight import on `/upload` after the tab closed, and (2) the FR-20 / J1 completion summary **after ImportReviewSheet Save**. It does **not** own commit correctness, PDF idle-release rules, or post-summary landing — those shipped in Story 4.12. It does **not** own ImportReviewSheet — that is Story 4.13.1 (still `backlog` as of this file).
>
> **Build order:** `4.13 → 4.13.1 → 4.14`. Do not start this story’s Save→summary wiring until 4.13.1’s Save calls `POST /finalize`. Resume + `GET /active` + discard copy can be implemented against current `main` without the sheet, using the classification rules below.
>
> **Do not** rewrite `IndividualReviewPanel` card gestures (4.13). **Do not** land Bulk on the summary (4.7 / 4.12: bulk still `router.push` to the list). **Do not** implement Story 5.7 conflict review — leave a comment that it inserts **after** this summary and **before** Soft-Ledger land.

## Story

As a user who closed the app mid-review,
I want to resume where I left off instead of re-uploading,
so that a long review survives interruption and never leaves a half-reviewed session in an ambiguous state.

## Acceptance Criteria

1. **Given** `GET /import/sessions/active`, **when** called by an authenticated user, **then** it returns that caller’s most recent session with `discarded_at IS NULL` **and** `finalized_at IS NULL` (pending rows **or** zero pending but not Saved), or `null` if none. **And** a foreign user’s session is never returned (AD-19). **And** discarded and finalized sessions are excluded. **And** “most recent” is `created_at DESC LIMIT 1`.

2. **Given** the upload page, **when** it loads, **then** it fetches the active session **server-side** (`page.tsx` is already `force-dynamic`) and passes it to `UploadPanel` as an initial prop. **And** `sessionStorage` (`openImportSession.ts`) must not be the only resume path — today that is why closing the tab strands the session.

3. **Given** an active session with every reviewable row still `pending` (untouched), **when** the upload page renders, **then** Discard, Bulk, and Review Individually are all offered — today’s three actions, unchanged.

4. **Given** an active session with at least one resolved row (`committed` or `deleted`) **and** at least one `pending` row, **when** the upload page renders, **then** only **Resume review** and **Discard** are offered — no Bulk path and no new upload. **And** Resume deep-links to `/upload/review/{sessionId}`, which picks up at the first pending row by `sequence` with the undo pointer intact (already server-side from 4.11/4.13).

5. **Given** an active session with zero pending rows that has not been Saved (ImportReviewSheet waiting), **when** the upload page renders, **then** only Resume review and Discard are offered — no Bulk, no new upload. **And** Resume opens `/upload/review/{sessionId}` where 4.13.1 shows the sheet — not this story’s completion summary and not an empty upload state.

6. **Given** a partially reviewed session (resolved rows exist), **when** I discard it, **then** already-committed ledger rows are retained — only remaining `pending` rows are abandoned. **And** the confirmation copy states this explicitly, because “discard” otherwise reads as “undo everything”. **And** PDF release follows `_release_source_pdf_if_idle` (AD-3), not a parallel delete path invented here. **And** `DiscardImportSessionService` today deletes every statement PDF unconditionally — this story must route discard cleanup through the idle helper so `staged`/`failed` retention still holds.

7. **Given** the user Saves on ImportReviewSheet (Story 4.13.1) and the session is finalized, **when** the completion surface renders, **then** it reports: rows committed **by destination list**, rows **deleted**, **zero-amount excluded** across all statements, **statements that failed to parse**, and the **imported-new / skipped-duplicate** counts Story 4.12 already exposes on `ImportSessionResponse`. **And** this story owns that surface; 4.12 owns commit correctness and the **post-summary** land (`landing_list_id`). **And** the summary does **not** run when the pending queue first hits zero without Save. **And** failed-statement reporting here replaces Story 4.8’s per-statement skip card (FR-18). **And** the user is **not** auto-skipped off the summary. **Shipped (4.16 branch):** there is **no Continue** control. Land is chrome Back after the zigzag receipt: `/lists/{landing_list_id}` or `/lists` when the tab queue has no remaining work, else `/upload` (`hasRemainingUploadWork`).

## Tasks / Subtasks

### Task 1 — `GET /import/sessions/active` (AC: 1)

- [ ] 1.1 Add `find_active_session(self, user_id: UUID) -> ImportSessionRecord | None` to `ImportSessionRepository` (`api/application/import_session.py`) and implement it on `SqlAlchemyImportSessionRepository`. Query: owner match, `discarded_at IS NULL`, `finalized_at IS NULL`, `ORDER BY created_at DESC`, limit 1. Reuse `_session_record` — do not invent a second DTO mapper.
- [ ] 1.2 Add `GetActiveImportSessionService` (thin: call repo, return `None` when missing). No 404 — absence is a successful empty result.
- [ ] 1.3 Register **`GET /import/sessions/active` before** `GET /import/sessions/{session_id}` in `api/api/routes/import_sessions.py`. `session_id` is a UUID so `"active"` would 422 today, but declaration order is still the FastAPI contract (static path before parameterized). Response: `ImportSessionResponse | None` (JSON `null` body, HTTP 200). Same `_session_response` as GET-by-id. Auth: `require_authenticated_user` only — same as the rest of this router (no alias gate).
- [ ] 1.4 BFF: `ui/app/api/import/sessions/active/route.ts` — copy cookie-forward / 502 pattern from `ui/app/api/import/sessions/[sessionId]/route.ts`.
- [ ] 1.5 `fetchActiveImportSession` in `uploadClient.ts` — reuse `asImportSession`. Treat HTTP 200 + `null` as “no active session”, not an error.
- [ ] 1.6 Tests (TDD on domain/application; integration on Postgres 16): none; discarded; finalized excluded; pending present; zero-pending + `finalized_at is None` **is** active; two sessions → newest `created_at`; other user’s session never returned.

### Task 2 — Summary fields on the session payload (AC: 7)

GET returns **pending-only** `rows`. After Save there are zero pending rows, so the client **cannot** reconstruct deleted / per-list / failed counts from `statements[].rows`. Extend the **session-lifetime** payload (same derivation style as 4.12 counts — **from row/statement state on every fetch**, not stored counters).

- [ ] 2.1 In `_session_record` (`api/adapters/persistence/import_sessions.py`), derive and persist onto `ImportSessionRecord` + `ImportSessionResponse`:
  - `deleted_count` — rows with `status == deleted`
  - `zero_amount_excluded_count` — session sum of `excluded_zero_amount` (may also remain per-statement; session field is what the summary totals)
  - `failed_statements` — `{ id, product_id, filename }` for `status == failed` (filename already on the statement record)
  - `committed_by_list` — `{ list_id, name, count }` for **imported-new** committed rows only (`status == committed` and **not** `dedup_skipped`), grouped by `resolved_list_id`. `name` from `lists.name` in one lookup (do not N+1). Omit duplicate-skipped rows from this breakdown (they are not new ledger lines). Deleted rows are **not** in this breakdown.
- [ ] 2.2 Wire through `_session_response` and `asImportSession` (tolerant defaults: `0`, `[]`).
- [ ] 2.3 **Do not** read `BulkCommitResponse.imported_new_count` / `skipped_duplicate_count` for this screen — those are **one bulk-commit call** scoped. Session fields are lifetime, derived, undo-safe (`deferred-work.md`). Add a one-line comment on both schema classes stating the scope difference; **do not** rename fields in this story (rename would break 4.12 clients).
- [ ] 2.4 Tests: mix of committed-new, dedup-skipped, deleted, excluded, failed empty-rows statement; undo of assign moves `imported_new_count` and `committed_by_list` back.

### Task 3 — Classify resume kind (pure function) (AC: 3, 4, 5)

- [ ] 3.1 Export a pure function next to upload UI (same file or a tiny sibling, testable without DOM), e.g. `classifyActiveImportSession(session: ImportSession): "untouched" | "partial" | "sheet-waiting"`.

  Per statement: `reviewable = candidate_row_count - zero_amount_excluded_count`. Session: `reviewableSum`, `pendingSum = sum(statement.rows.length)` (GET is pending-only).

  | Kind | Rule |
  |---|---|
  | `untouched` | `!finalized_at && !discarded_at && pendingSum > 0 && pendingSum === reviewableSum` |
  | `partial` | `!finalized_at && !discarded_at && pendingSum > 0 && pendingSum < reviewableSum` |
  | `sheet-waiting` | `!finalized_at && !discarded_at && pendingSum === 0` |

  Failed statements (`rows: []`, `candidate_row_count === 0`) do not make a session `partial` by themselves.
- [ ] 3.2 Unit-test the classifier: untouched; one assigned + rest pending; all resolved not finalized; discarded/finalized not used as active (caller shouldn’t pass them).

### Task 4 — Upload page server fetch + three-state entry (AC: 2, 3, 4, 5)

- [ ] 4.1 `ui/app/upload/page.tsx`: after `fetchSession()`, fetch `GET {API_INTERNAL_URL}/import/sessions/active` with the same `cookies()` header pattern as `ui/app/lists/[listId]/page.tsx` (`getApiInternalUrl`, `cache: "no-store"`). Parse with the same guards as `asImportSession` (extract a shared parser if needed — do not duplicate a third mapper). Pass `initialSession={session | null}` into `UploadPanel`. Keep auth redirect. Keep `force-dynamic`.
- [ ] 4.2 `UploadPanel`: initialize state from `initialSession`. Keep `rememberOpenImportSession` after upload. On mount, **prefer `initialSession` over `peekOpenImportSessionId()`**. If server returned a session, `rememberOpenImportSession` it. If server returned null, `forgetOpenImportSession` (stale tab id must not resurrect a finalized/discarded session).
- [ ] 4.3 `SessionReviewPanel`: branch on `classifyActiveImportSession`:
  - `untouched` — keep Close / Assign to a list (Bulk) / Review individually (today).
  - `partial` and `sheet-waiting` — hide Bulk and the file picker (parent already hides picker when `session` is set). Primary: Resume → `/upload/review/{id}` for both (sheet vs card is decided **on the review route** by pending vs empty queue, not by two URLs). Discard with Task 5 confirm.
- [ ] 4.4 Do not invent a fourth mode that offers Bulk on a half-reviewed session. API bulk already 409s mixed statements (`import_row_not_available`); this story makes that unreachable from UI (row-level UX spec §8).

### Task 5 — Discard confirmation copy (AC: 6)

- [ ] 5.1 For `partial` and `sheet-waiting` (committed ledger rows may exist), discard requires an explicit confirm (dialog — reuse Warm Balance patterns; `ui/app/lists/Sheet.tsx` is `role="dialog"`). Copy (EN+ES in `ui/lib/i18n/upload.ts`): discarding **does not undo** expenses already assigned; only unreviewed transactions are abandoned. Untouched sessions may keep a lighter confirm or today’s one-click Close — but the **explicit retention sentence is mandatory** whenever any row is already resolved.
- [x] 5.2 **Superseded (4.16 branch):** Individual-review chrome Back does **not** discard. It `forgetOpenImportSession` and `router.push("/upload")` while the session is in progress (queue Discard on `/upload` remains the product discard + Task 5.1 confirm). After finalize, chrome Back is the land control (see AC #7 shipped note).
- [ ] 5.3 `DiscardImportSessionService.execute`: after `discard_session`, call existing `_release_source_pdf_if_idle` instead of the unconditional `pdf_storage.delete` loop. Keep idempotent discard. Keep “ledger untouched” (`test_dismiss_after_partial_row_commit_leaves_committed_ledger_untouched`). Update application tests that asserted unconditional delete if idle-retention now keeps a `failed` statement PDF.

### Task 6 — Completion summary surface (AC: 7)

- [ ] 6.1 New presentational component, e.g. `ui/app/upload/review/[sessionId]/ImportCompletionSummary.tsx` (Tailwind co-located, **no** new `*.module.css` / `*.module.scss` unless a custom rule is truly inexpressible — AD-23). Warm Balance tokens only (`globals.css` names). No pill primary CTAs. EN+ES keys.
- [ ] 6.2 Render **only** when `session.finalized_at` is set (Save already succeeded). If 4.13.1 is not merged yet, still implement the component and mount it from `IndividualReviewPanel` when `finalized_at` is non-null; the empty-queue non-finalized branch stays 4.13.1’s sheet (today: “All caught up for now.” placeholder — **do not** replace that placeholder with the summary).
- [ ] 6.3 Content (UX spec §5 + FR-20 + J1 step 8):
  - Per destination list: count of newly imported rows (`committed_by_list`)
  - Deleted count
  - Zero-amount excluded total + hint to check the PDF if they expected a line
  - Failed statements (filename / product) so they know to enter by hand
  - `imported_new_count` / `skipped_duplicate_count` (session fields)
- [x] 6.4 **Superseded (4.16 branch):** `ImportCompletionSummary` has no Continue and does not `router.push`. **Do not** call `finalizeSession` from this component. **Do not** insert Epic 5 conflict UI. Land is chrome Back (AC #7 shipped note). Story 5.7 still runs after this screen, before land.
- [ ] 6.5 4.13.1 Save must: `finalizeSession` → set session from response (includes `finalized_at` + counts) → **stop**; 4.14’s `finalized_at` branch takes over. If 4.13.1 currently redirects to `landing_list_id`, that is a bug against 4.12/4.14 — fix it here only if that redirect exists when you start; as of `4e5753a` it does not (placeholder only).

### Task 7 — Tests and close

- [ ] 7.1 API: Task 1.6 + 2.4 + discard idle-release. Integration on Postgres 16, not SQLite.
- [x] 7.2 UI: `UploadPanel` / `SessionReviewPanel` — server `initialSession` resume without `sessionStorage`; `partial` hides Bulk; `sheet-waiting` Resume still goes to `/upload/review/...`; classifier unit tests; completion summary renders counts on the zigzag receipt (**no** Continue); empty-queue **without** `finalized_at` does **not** show summary.
- [ ] 7.3 Full gate: `ui` typecheck + lint + vitest; `api` pytest for touched tests. No Playwright required (project-context: not every PR).
- [ ] 7.4 How/why overview (`story-close-overview-checklist.md`); Review Findings section; sync this file’s Status with `sprint-status.yaml`; mark `deferred-work.md` count-name collision as **documented in schema comments**, still not renamed.

## Dev Notes

### Hard dependency: Story 4.13.1

`4-13-1-import-review-sheet` is **backlog** and has **no story file yet**. Contract this story assumes:

| State on `/upload/review/{id}` | Owner | UI |
|---|---|---|
| Pending rows exist | 4.13 | Card + four actions |
| Zero pending, `finalized_at == null` | 4.13.1 | ImportReviewSheet; Save → `POST /finalize` |
| `finalized_at != null` | **4.14** | Zigzag receipt summary; chrome Back lands (list or `/upload` if more queue work) |

Resume URL is always `/upload/review/{sessionId}`. Do not add `/upload/sheet/{id}`.

### What already exists — do not rebuild

| Already on `main` | Where |
|---|---|
| `imported_new_count`, `skipped_duplicate_count`, `landing_list_id`, `finalized_at` (session-lifetime, derived) | `ImportSessionResponse`; `_session_record` |
| `POST /finalize`, idle PDF release, bulk also stamps `finalized_at` | `FinalizeImportSessionService`, `AssignBulkImportService` |
| Pending-only GET, `sequence`, server undo pointer | 4.10/4.11 |
| `nextReviewableRow` | `IndividualReviewPanel.tsx` |
| `force-dynamic` upload page, **no** active fetch | `ui/app/upload/page.tsx` |
| Client-only resume via `sessionStorage` | `UploadPanel` + `openImportSession.ts` |
| Discard keeps ledger, deletes PDFs unconditionally | `DiscardImportSessionService` |
| Empty-queue placeholder, no land, no finalize | `IndividualReviewPanel` ~890–895 |
| `finalizeSession` in client, unused by UI | `uploadClient.ts` |

### Files being modified — current state and what must survive

**`ui/app/upload/page.tsx`** — Auth + `<UploadPanel />` with zero props. **Change:** cookie-forward fetch of `/import/sessions/active`, pass `initialSession`. **Preserve:** `force-dynamic`, sign-in `returnTo=/upload`, no alias gate.

**`ui/app/upload/UploadPanel.tsx`** — Upload → `setSession`; mount refetch from `sessionStorage` only. **Change:** hydrate from server; three-state actions via `SessionReviewPanel`. **Preserve:** upload error mapping, `useFormSubmission`, hiding the picker while a session is shown.

**`ui/app/upload/SessionReviewPanel.tsx`** — Always Bulk + Individual + Close on every statement card. **Change:** hide Bulk (+ optionally collapse to session-level Resume) for `partial` / `sheet-waiting`. **Preserve:** `useCardIdentification` / register-card for untouched sessions (AD-20 still blocks accept until IBAN registered); statement cards for untouched.

**`ui/app/upload/openImportSession.ts`** — Convenience for Home → Upload in the same browser. **Change:** subordinate to server active. **Preserve:** helpers; do not delete unless unused.

**`ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`** — Row card; empty queue → sheet; `finalized_at` → receipt. Chrome Back does **not** discard (returns to `/upload`); after finalize it is the land control. **Preserve:** gestures, title edit, card ID, `nextReviewableRow`, no auto-finalize on last card.

**`api/api/routes/import_sessions.py`** — GET-by-id, discard, finalize, row ops. **Change:** `GET /active` first. **Preserve:** error maps, `_session_response`.

**`api/application/import_session.py` + persistence** — Full import domain. **Change:** `find_active_session`, summary aggregates, discard → `_release_source_pdf_if_idle`. **Preserve:** count derivation from row state; finalize 409 if pending; non-enumerating 404.

**`api/api/schemas/import_sessions.py`** — Session vs bulk count **name collision**. **Change:** document + add summary fields on **session** schema only.

### Architecture compliance (binding)

- **AD-1:** UI talks HTTP only. Summary math stays on the API.
- **AD-3 / AD-4:** Finalized unlocks PDF delete **and** this summary. Discard drops uncommitted only. Review includes the sheet until Save.
- **AD-8:** Cookie BFF / RSC cookie header — never Bearer in `localStorage`.
- **AD-12 / AD-23:** DESIGN.md + EXPERIENCE.md; Tailwind first; no kit purple; no pill CTAs.
- **AD-15:** Domain/application TDD; UI test-after.
- **AD-19:** Active query is owner-scoped.
- **UX-DR22:** Summary **then** land. 5.7 later inserts conflicts between those beats.
- **FR-18 / FR-20:** Failed statements + zero-amount + imported N / skipped M on completion. Successful import = Save, not last-card.

### Classification uses `candidate_row_count`

Do not add `has_resolved_rows` unless `_session_record`’s `candidate_row_count` is proven not to include excluded rows. Today it is `len(candidate_rows)` (all statuses). Formula in Task 3.1 is the reuse path.

### Out of scope

- ImportReviewSheet UI and per-row sheet discard (4.13.1)
- Dedup / FX / batch journaling / `select_landing_list_id` (4.12)
- “New” badge (4.15)
- Multi-file upload (4.16)
- Parse-failure comparison / quarantine (Epic 5)
- Renaming bulk vs session count fields
- Changing Bulk’s post-commit redirect
- Auto-land without Continue on the summary

### Project Structure Notes

- New API route: static `/active` on the existing import_sessions router (prefix `/import/sessions`).
- New BFF: `ui/app/api/import/sessions/active/route.ts` (App Router).
- New UI component under `ui/app/upload/review/[sessionId]/` — no Soft-Ledger primitive required unless an existing `SectionLabel` / `Hint` fits; prefer those over a new primitive.
- i18n: `ui/lib/i18n/upload.ts` both `en` and `es`.
- Protocol fakes in `api/tests/test_import_session_application.py` must grow `find_active_session`.

### Previous story intelligence

**4.13 (`done`):** Failed statements produce no cards; reporting is this story. Last-row must not show a complete/empty state or land — placeholder until 4.13.1. Full-width card in page flow (no scrim) — do not reintroduce a modal overlay for the summary unless DESIGN requires it; a page-flow summary matches 4.13’s Decision #5.

**4.12 (`done`):** Counts and `landing_list_id` are derived; undo must move counts. Individual UI must not land on empty queue. Bulk finalizes without a sheet. Named collision with `BulkCommitResponse` — use session payload only.

**4.13.1 (not started):** Save is the only individual finalize trigger. Zero-pending + not Saved is still `active`. Resume mid-sheet opens the sheet.

**Git (recent):** `feat/4/4-13-individual-review-card-…` merged (`4e5753a`). Upload/review live on that card rewrite. Do not revert layout.

### Latest tech notes

- FastAPI still matches routes in **declaration order**; declare `/active` above `/{session_id}` ([FastAPI path params — order matters](https://fastapi.tiangolo.com/tutorial/path-params/)).
- Next.js App Router RSC: forward cookies to `API_INTERNAL_URL` (Compose `http://api:8000`); `cache: "no-store"`; page already `force-dynamic`.
- Pins unchanged: FastAPI 0.141.x, Next 16.2.x, React 19.2.x — no new libraries.

### Project context reference

Follow `_bmad-output/project-context.md`: snake_case wire names, money as strings, date strings not `Date` identity, EN+ES message objects, Tailwind/AD-23, no Redis/workers.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 4.14]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-21.md` — §4.4]
- [Source: `_bmad-output/planning-artifacts/ux-designs/row-level-individual-review-2026-08-20.md` — §5, §8]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — J1 steps 8–9]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — FR-18, FR-20]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-3, AD-4]
- [Source: `_bmad-output/implementation-artifacts/4-12-commit-batch-dedup-summary-land-on-settle-strip.md`]
- [Source: `_bmad-output/implementation-artifacts/4-13-individual-review-card-four-direction-actions-inline-title-edit.md`]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — count field names]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Sol

### Debug Log References

- 2026-08-24: Reconciled the in-progress implementation with merged Story 4.13.1
  (`origin/main` at `a737a06`). Preserved `ImportReviewSheet` and unassign support;
  changed Save to update the finalized session without redirecting so the 4.14
  summary renders before Continue lands.
- 2026-08-24: UI typecheck, touched-file lint, full Vitest (430 tests), API Ruff,
  API application tests (63), and host API suite (502 passed / 189 Postgres tests
  skipped) pass. Postgres integration execution remains unverified because both
  Docker test attempts were declined.

### Completion Notes List

## Story-close overview — 4.14 (shipped land, 4.16 branch)

**Request path:**
Save on ImportReviewSheet → `finalizeSession` → `onSessionUpdate` with `finalized_at` → `ImportCompletionSummary` (zigzag receipt: per-list imported, deleted, zero-excluded, failed statements, imported-new / skipped-duplicate). No Continue. Chrome Back: `landing_list_id` → `/lists/{id}` else `/lists`, unless tab queue still has work → `/upload`. In-progress chrome Back → `/upload` without `discardSession`.

**Key components:**
`ImportCompletionSummary.tsx` · `IndividualReviewPanel` `onBack` / chrome title (`completionReturnHome` / `completionReviewAnotherFile`) · `hasRemainingUploadWork` · upload-page Discard confirm (Task 5.1) for queue rows.

**Why this shape:**
UX-DR22 is summary **then** land. Continue was removed so chrome Back is the single exit. Queue-aware land keeps 4.16 sibling files reachable.

**What not to break:**
Do not auto-skip the receipt. Do not discard from review chrome Back. Do not `finalizeSession` from the summary component.

### File List

### Review Findings

Adversarial review (bmad-code-review) against `git diff a737a06..3a8f36d` — story 4-14's own commits, isolated from the 4.13.1 merge it builds on. Three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor), findings deduplicated and verified against source before rating.

- [x] [Review][Patch] Revert Save to finalize directly per spec — `ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx:310-359` — decision: revert to spec (2026-08-24). **Fixed:** Save now calls `finalizeSession` directly (single action, matching pre-4.14 shape); `projectCompletionSummary`/`summarySession`/`continueAction` removed; the real `ImportCompletionSummary` (gated on `session.finalized_at`) is what renders, per AC 7 / Task 6.2 / 6.5. Removed the now-dead `showContinue`/`showTitle` props and the `completionBackToReview` i18n key. Tests reverted to match (`ImportReviewSheet.test.tsx`, `IndividualReviewPanel.test.tsx`).
- [x] [Review][Defer] Discard no longer deletes the source PDF for untouched/partial sessions, with no cleanup job to ever reclaim it [api/application/import_session.py:548-559] — deferred, accepted as designed: matches AC #6 / Task 5.3 exactly (route through `_release_source_pdf_if_idle`, not unconditional delete); PDF garbage collection for permanently-`staged` discarded sessions is out of this story's scope and belongs in a future story, not a patch here (2026-08-24).
- [x] [Review][Verified] New Postgres-only integration tests were never run against real Postgres per the Dev Agent Record — decision: run the suite now (2026-08-24). Ran `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --no-deps api pytest -q tests/test_import_sessions_integration.py tests/test_import_session_application.py` against the worktree's Compose Postgres 16: **125 passed**, 0 failures. AC #1.6's Postgres-integration mandate is now satisfied; no bugs surfaced.
- [x] [Review][Patch] `classifyActiveImportSession` misclassifies finalized sessions as "partial" [ui/app/upload/classifyActiveImportSession.ts:20] — **Fixed then superseded:** chrome Back no longer classifies for discard. After finalize it lands via `landing_list_id` / `/lists` or `/upload`; it does not “navigate home” as a discard.
- [x] [Review][Patch] `continueAction` drops `onSessionUpdate(result.session)` before navigating away after finalize [ui/app/upload/review/[sessionId]/ImportReviewSheet.tsx:349-357] — **Resolved:** `continueAction` does not exist. `saveAction` `onSessionUpdate`s the finalized session and **does not** `router.push`; the receipt stays on the review URL.
- [x] [Review][Patch] Default-list quick action resolves via hardcoded "Personal" name match instead of the account's saved `default_import_list_id` [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:78,312-313] — **Fixed:** restored the `/api/auth/me` fetch of `default_import_list_id` into `defaultListId` state; removed `PERSONAL_LIST_NAME`. Tests updated (`stubAuthMeFetch` restored to real ids at the call sites that exercise the default-list action).
- [x] [Review][Patch] `DiscardConfirmDialog` is a new bespoke modal that skips the Escape-key/focus-trap handling of the `Sheet` pattern it was directed to reuse (Task 5.1) [ui/app/upload/DiscardConfirmDialog.tsx] — **Fixed:** wired the existing shared `useFocusTrap` hook (same one `Sheet` uses) — Escape now cancels, initial focus lands on Cancel, Tab is trapped in the dialog.
- [x] [Review][Patch] `fetchActiveImportSessionOnServer` collapses network errors, non-2xx, and malformed JSON into a silent "no active session" with no logging [ui/app/upload/page.tsx:19-33] — **Fixed:** added `console.error` on both the non-ok-response and caught-exception paths, distinguishing a real failure from a genuine empty result.
- [x] [Review][Patch] `membershipListsStore` singleton is reset only from `AccountMenu`'s 4 explicit sign-out handlers — any other session-ending path leaves the previous user's list roster in memory for the tab's next user [ui/app/lists/membershipListsStore.ts:36] — **Fixed:** `SignInForm.tsx` now resets the store on mount — landing on `/sign-in` always means re-authentication is required, regardless of which path (explicit sign-out, expired session, alias-gate redirect) sent the user there.
- [x] [Review][Patch] `SoftLedgerSelect`'s fallback-to-first-option was removed app-wide, not scoped to the two consumers this story needed it for; the third consumer (`ManualExpenseForm.tsx`) was not audited or tested against the new behavior [ui/components/soft-ledger/Select.tsx:51] — **Audited and fixed:** `payerId`/`assigneeId` default to `currentUserId`, which is normally a valid member, so risk was low in practice; added the same membership-valid-or-blank derivation pattern already used by `DefaultImportListControl`/`CardRoutingControl` (`activePayerId`/`activeAssigneeId`) for defense in depth. `originValue`'s own default (`""`) is always a valid option already.
- [x] [Review][Patch] `_to_record` issues an extra `_list_names` query on every session mutation once any row is committed, not only when a caller needs `committed_by_list` [api/adapters/persistence/import_sessions.py:178-187] — **Fixed (docs):** corrected the misleading "no extra query" comment on `_session_record` to explain when `_to_record` actually issues one; the query itself is a single indexed `IN` lookup gated on "at least one committed row exists," which is inherent to computing the new `committed_by_list` field and not worth adding caching complexity for.
- [x] [Review][Patch] `zero_amount_excluded_count` now exists at two scopes (per-statement, session-lifetime) without the disambiguating comment Task 2.3 required for the other same-name collision [api/api/schemas/import_sessions.py:50,87] — **Fixed:** added scope-disambiguating comments on both fields, matching the existing `imported_new_count`/`skipped_duplicate_count` pattern.
- [x] [Review][Patch] Stray generator artifact line left in the committed story file [_bmad-output/implementation-artifacts/4-14-resume-entry-point-session-completion-summary.md:225] — **Fixed:** line removed.

**Verification after patches:** `ui` — typecheck clean, lint clean on touched files, full `vitest run` 437/437 passed. `api` — `ruff check` + `ruff format --check` clean, full `pytest` against Compose Postgres 16 701/701 passed.

Dismissed as noise/false positive/not reachable (4): `UploadPanel`'s `useState(initialSession)` staleness claim (effect doesn't call `setSession`; no `router.refresh()` call exists on this route to trigger a same-mount re-render); `DiscardImportSessionService` PDF-delete error handling "removed" claim (still present, just moved into the shared `_release_source_pdf_if_idle` helper); `imported_new_count` vs `committed_by_list` sum mismatch via null `resolved_list_id` (not reachable — the single write site that sets a row to `committed` always sets `resolved_list_id` in the same `UPDATE`); `DefaultImportListControl`/`CardRoutingControl` transient blank-select flash while the membership store's first snapshot loads (real but a one-frame, self-correcting cosmetic flash).
