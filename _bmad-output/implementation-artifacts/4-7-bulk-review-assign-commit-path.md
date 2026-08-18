---
baseline_commit: 0557bcba977df04e09263a7d0c4a86899d5ed8a2
---

# Story 4.7: Bulk review assign & commit path

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

**Correct-course pointer (2026-08-17):** Story 4.4 is now `done`, but Story 4.6 (this story's direct prerequisite for the Import Session schema) has been flagged for a structural redraft — its guessed `ImportPipeline` port doesn't match 4.4's real `BankAdapter`/`detect_bank_adapter()` shape. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-17.md`. This story's own Task 0 gate (below) already requires 4.4–4.6 all `done` before re-verification — that condition is not yet met (4.6 needs its redraft first). No change to this story's own text otherwise; revisit once 4.6 actually lands.

## ⚠️ Prerequisites gap — read before starting

**Stories 4.4, 4.5, and 4.6 are `backlog` (not implemented) as of this story's creation.** This story was created out of epic order at explicit user request (sprint order in `epics.md` and `project-context.md`'s "Order & independence: follow epics.md" rule would normally block this). Confirmed via repo search: **zero** import/upload/statement/session code exists anywhere in `api/` or `ui/` (only unrelated matches like `uvicorn/importer.py`).

4.7's own ACs assume infrastructure that Stories 4.4–4.6 are responsible for building:

| What 4.7 assumes exists | Which story owns it |
|---|---|
| PDF upload endpoint + operator-volume staging | 4.6 |
| Detect → split → parse → normalize adapter pipeline | 4.4, 4.5 |
| `CanonicalLine` contract (AD-16) | 4.4 |
| **Import Session** entity (staged statements + candidate rows) | 4.6 |
| Product/bank identity per statement (for card→list default) | 4.4 |
| Domain dedup identity computation at commit (AD-18) | 4.4 |

**Do not invent this infrastructure ad hoc inside this story.** The Import Session / Statement / CanonicalLine schema is architecturally significant (AD-4, AD-16, AD-18) and is Stories 4.4–4.6's design responsibility — building a parallel or simplified version here risks a schema that conflicts with (or is discarded by) those stories when they land, wasting this story's work.

**Required sequencing when this story is picked up for `dev-story`:**
1. Confirm Stories 4.4, 4.5, 4.6 are `done` in `sprint-status.yaml`. If not, **stop** and run `create-story` / `dev-story` for 4.4 → 4.5 → 4.6 first, in that order (4.6 depends on 4.4; 4.5 is CI-fixture work that can run alongside 4.4 but must land before 4.6's "clean parse" happy path is testable).
2. Once 4.4–4.6 are `done`, **re-run `create-story` for 4.7** (or at minimum re-read this file against the by-then-real Import Session schema) before writing code — the task breakdown below describes the *behavior* this story owns (Bulk mode assignment + per-statement batch commit) at the level knowable today, but concrete file/table/field names for the Import Session it consumes could not be verified against real code and are marked `[VERIFY AGAINST 4.6 SCHEMA]` throughout.
3. This story's own scope, once unblocked, is strictly: the Bulk-mode review screen, list selection/pre-selection, and the commit-as-batch-per-statement flow. It does **not** include building Individual review (Story 4.8) or the dedup/summary/PDF-cleanup finale (Story 4.9) — those stories consume the same Import Session concept but own their own UI/commit paths.

If you are the dev agent and 4.4–4.6 are still backlog, halt and report back rather than guessing the staging schema.

## Story

As a user importing under review routing,
I want Bulk mode to send the whole upload to one list I choose,
So that I can finish a multi-statement file in one assignment when I'm not reviewing card-by-card.

## Acceptance Criteria

1. **Given** review routing and I choose Bulk, **when** I pick a destination list I belong to, **then** the whole upload is assigned to that list before commit. (FR-17)
2. **Given** I started Upload from inside a list, **when** Bulk mode is selected, **then** that list may be pre-selected as destination — Individual default destination is unchanged. (UX-DR23)
3. **Given** statements parse cleanly, **when** I confirm Bulk commit, **then** each statement commits as its own Import Batch under the session (AD-4), **and** payer on imported expenses defaults to me and remains editable. (FR-19)
4. **Given** parse failure on a statement, **when** Bulk is in progress, **then** failure handling for that statement is deferred to Epic 5 — this story's happy path is clean parses only.

## Scope Note (read before starting)

This story builds the **Bulk review assignment and commit UI/flow only** — pick-one-list-for-the-whole-upload, confirm, and per-statement batch commit. It assumes:
- An Import Session already exists with N staged statements, each carrying candidate `CanonicalLine` rows and a `routing_mode`/card association from Story 4.3 (`fixed`/`review` per card) — Bulk applies only when the relevant card(s) are in `review` mode (Story 4.3's fixed-list mode bypasses review entirely per its own AC #1).
- Statements in the session have already parsed cleanly (4.4/4.5's adapter output) — this story does not parse anything itself.
- The mode choice (Bulk vs Individual) itself is presented by the Upload flow (Story 4.6's UI) before reaching this story's screen; **this story owns what happens after Bulk is chosen**, not the Upload/mode-picker screen itself. If 4.6 has not built that picker yet, this story's dev-story pass may need a minimal entry point (e.g. a directly-linked Bulk review route) — flag this as a deviation in Completion Notes rather than silently building a full mode-picker UI (that's 4.6/4.8 territory).
- Individual review (swipe/buttons, Story 4.8) and the dedup-summary/settle-strip landing + PDF cleanup (Story 4.9) are explicitly **not** part of this story. Bulk commit in this story should land the user somewhere sensible (the assigned list's shared-expenses view is the natural choice, matching 4.9's eventual behavior for Individual) but the dedup-count summary UI itself belongs to 4.9 — implement the simplest correct landing without duplicating 4.9's summary chrome.

## Tasks / Subtasks

- [ ] Task 0: Prerequisite gate (read "Prerequisites gap" above)
  - [ ] 0.1 Verify `sprint-status.yaml` shows `4-4-...`, `4-5-...`, `4-6-...` all `done`. If any are not, stop and escalate — do not proceed with Tasks 1+.
  - [ ] 0.2 Once verified, read the merged 4.4/4.5/4.6 story files' Dev Agent Record / Completion Notes / File List sections to learn the actual Import Session, Statement, and CanonicalLine persistence shapes (table names, application-layer service/repository names, route paths). Replace every `[VERIFY AGAINST 4.6 SCHEMA]` marker below with the real names before writing code.

- [ ] Task 1: Domain — Bulk assignment validation (AC: #1, #3) `[VERIFY AGAINST 4.6 SCHEMA]`
  - [ ] 1.1 `api/domain/` (file TBD by 4.6's session module, e.g. `imports.py`): add a pure validation function for Bulk assignment — given a session's statement IDs and a chosen `list_id`, confirm the session is unassigned/not yet committed and the statements belong to that session. No DB/HTTP imports (AD-1).
  - [ ] 1.2 Reuse Story 2.2's membership ACL (`AuthorizeListAccessService` / `ListAccessLookup`) to confirm the actor is a member of the chosen list — do not invent a second ACL scheme (AD-19). Add a new `ListAccessAction` (e.g. `"import_bulk_to_list"`) alongside the existing member-mutation actions in `api/domain/list_access.py`, mirroring how Story 4.3 added `"route_card_to_list"`/`"set_default_import_list"`.
  - [ ] 1.3 Unit tests for the new validation function: valid session + membership → passes; session already committed → rejects; list not a membership of actor → surfaces the ACL denial path (test at the ACL layer, per Task 1.2's precedent in `test_list_access_domain.py`).

- [ ] Task 2: Application — `AssignBulkImportService` (AC: #1, #2, #3) `[VERIFY AGAINST 4.6 SCHEMA]`
  - [ ] 2.1 `api/application/` (co-locate with 4.6's Import Session application service, or a new `imports.py` if 4.6 didn't create one): `AssignBulkImportCommand(actor_user_id, session_id, list_id)` + `AssignBulkImportService` — (a) run Task 1.1/1.2 validation; (b) for each statement in the session with clean-parse candidate rows, commit it as its own Import Batch (AD-4: **one Statement = one `batch_id`**) into the chosen list; (c) payer defaults to `actor_user_id` per FR-19, stored editable (reuse the same payer field/shape Story 3.2's `ManualExpenseForm`/manual-expense domain already established — do not invent a second payer representation).
  - [ ] 2.2 Domain dedup identity (AD-18) is computed by the domain/commit path 4.4 builds — this service calls into that, it does not recompute identity itself.
  - [ ] 2.3 FX materialization (AD-7, Epic 3's `materialize_fx_to_crc` path) applies to any non-CRC committed lines exactly as it already does for manual/other ledger writes — reuse, don't duplicate.
  - [ ] 2.4 Unit tests with fakes (no DB): N clean statements → N Import Batches created, each under the chosen list, payer = actor; a statement in the session that failed to parse is excluded from Bulk's happy path per AC #4 (assert it is *not* silently committed — exact deferred-handling shape depends on what 4.4/4.5's parse-failure signal looks like on a staged statement; assert on whatever that flag/status is once known).

- [ ] Task 3: API — routes (AC: #1, #2, #3) `[VERIFY AGAINST 4.6 SCHEMA]`
  - [ ] 3.1 New route (exact path depends on 4.6's Import Session resource naming, e.g. `POST /import-sessions/{session_id}/bulk-commit`): body `{list_id: UUID}`, `Depends(require_authenticated_user)`. Compose `AssignBulkImportService` with the session repository (4.6) + `SqlAlchemyListRepository` (existing `ListAccessLookup`, no new adapter needed — same reuse Story 4.3 already established at `api/api/routes/cards.py`).
  - [ ] 3.2 Error mapping follows the established convention (see `api/api/routes/cards.py`'s `set_card_routing` route from Story 4.3): ACL denial → 403 `not_list_member`; session/statement not found → 404; already-committed session → 409 or 422 (developer's call, document which).
  - [ ] 3.3 Integration tests (Postgres-gated `TestClient`, per project-context "Layers"): happy path with a fixture session of clean-parse statements → each lands as its own batch, ledger rows present, payer = actor; non-member list → 403; already-committed session → error response, no double-commit.

- [ ] Task 4: UI — Bulk review screen (AC: #1, #2, #3)
  - [ ] 4.1 New component under `ui/app/` (route location depends on 4.6's Upload flow structure — likely a step within the same upload route tree, not a standalone top-level page). List picker uses `SoftLedgerSelect` populated from `fetchLists()` (already exists — `ui/app/lists/listsClient.ts`, added in Story 4.3 Task 7.3). If the upload was launched from inside a list (`UX-DR23`), pre-select that list's id as the initial value — do not change Individual's separate default-destination behavior (that reads `default_import_list_id`, a different setting, untouched here).
  - [ ] 4.2 Confirm action calls the new bulk-commit client wrapper (co-locate in whatever `importsClient.ts`/equivalent 4.6 created, following the `cardsClient.ts`/`listsClient.ts` fetch-wrapper + `mapError` convention already established).
  - [ ] 4.3 i18n: add EN+ES keys to the relevant domain file under `ui/lib/i18n/` (new `imports.ts` if 4.6 didn't already create one — do not add import-flow copy to `lists.ts`/`cards.ts`).
  - [ ] 4.4 On successful commit, navigate to the assigned list's shared-expenses view (`ui/app/lists/[listId]/page.tsx`) — same landing surface Story 4.9 will later reach via its own summary step; do not build 4.9's dedup-count summary chrome here, just land cleanly.
  - [ ] 4.5 Styling: Tailwind utilities co-located per Epic 3.5 convention (project-context "Styling") — no new `.module.css`, `.module.scss` only if genuinely custom.

- [ ] Task 5: UI tests (AC: #1, #2, #3)
  - [ ] 5.1 Component test: list picker defaults to nothing when launched globally; defaults to the originating list when launched from inside a list (AC #2); confirm button disabled until a list is chosen; successful confirm calls the client wrapper with the right `{list_id}` and navigates on success; a 403 surfaces an inline error.

- [ ] Task 6: Story-close overview (required before `done` — see Dev Notes)

## Dev Notes

### Why this story is unusually thin on concrete file/table names

Unlike Stories 4.1–4.3 (which extended already-live `cards`/`lists`/`users` tables and existing services with verified line numbers), 4.7 sits on top of an Import Session data model that Stories 4.4–4.6 have not yet built. Every `[VERIFY AGAINST 4.6 SCHEMA]` marker above is a placeholder for a design decision that belongs to those stories, not this one. **Do not treat this story's task list as a green light to design the Import Session schema** — that would duplicate (and likely conflict with) 4.4/4.6's own architecture work. See the "Prerequisites gap" section at the top of this file.

### What is certain regardless of 4.4–4.6's exact schema

These project-wide invariants apply no matter how the Import Session ends up shaped:
- **AD-4**: Import Batch boundary is one Statement's accept/commit — Bulk must create one `batch_id` per statement, not one batch for the whole upload.
- **AD-18**: domain alone computes dedup identity at commit — this story's service calls into that, never recomputes or bypasses it.
- **AD-19 / FR-11/FR-12 membership-not-ownership**: "a list I belong to" (AC #1) means membership, reuse `AuthorizeListAccessService` exactly as Story 4.3 did for `route_card_to_list`/`set_default_import_list`.
- **FR-19**: payer defaults to the current user (the person performing the Bulk commit, i.e. `actor_user_id`), remains editable after commit — same payer semantics as Story 3.2's manual expenses, do not invent a separate payer model for imported rows.
- **AD-7**: FX materialization at commit for non-CRC lines is the existing Epic 3 path — reuse it.
- **AC #4 boundary**: this story's happy path is clean parses only; a statement that failed to parse must not be silently included in a Bulk commit — Epic 5 owns what happens to it, this story just must not swallow or crash on it.

### Hexagonal placement (AD-1)

Same boundaries every prior Epic 4 story has followed: `domain/` gets pure validation only (no DB/HTTP), `application/` composes ports (session repo + `ListAccessLookup`, mirroring Story 4.3's two-port `SetCardRoutingService` pattern), `adapters/persistence/` implements the repository methods, `api/routes/` is a thin HTTP→service translation layer, `ui` talks to `api` only via same-origin BFF routes (`ui/app/api/...`) — never directly, never DB/parsers in `ui`.

### Testing Requirements (project-context "Discipline" + "Layers")

- Domain: pure unit tests, no DB.
- Application: unit tests with fakes, no DB — follow `test_cards_application.py`'s `_FakeCardRepo`/local ACL-fake convention (Story 4.3 precedent).
- Integration: Postgres 16 via `DATABASE_URL`-gated `TestClient` tests — will need a way to seed a fixture Import Session with clean-parse statements; check what fixture helper 4.6 built for this before writing a new one.
- UI: co-located component test file, Tailwind/Testing Library convention already established across Epic 3/4 UI stories.
- Money assertions (payer/commit amounts) use `Decimal`, never `float` (AD-5) — this story's rows flow through the same commit path as manual expenses, which already enforces this.

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `4-3-card-routing-mode-review-default-list.md`'s Completion Notes for the expected format.

### Project Structure Notes

- This story extends whatever Import Session bounded concern Story 4.6 establishes — do not create a competing "imports" module if 4.6 already named one.
- Next Alembic migration number (if this story needs its own, e.g. a `bulk_assigned_list_id` marker on the session): confirm the highest existing revision after 4.4–4.6 land (currently `0015_card_routing.py` is head; 4.4/4.6 will very likely add their own Import Session migration(s) before this story's number is knowable).
- Reuses `fetchLists()` (`ui/app/lists/listsClient.ts`, Story 4.3), `SoftLedgerSelect` (`ui/components/soft-ledger/Select.tsx`), `AuthorizeListAccessService`/`ListAccessLookup` (`api/application/list_access.py`, Story 2.2), and the manual-expense payer model (Story 3.2) — no new cross-cutting primitives expected.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.7: Bulk review assign & commit path] — ACs, story statement.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4/4.5/4.6] — prerequisite stories' scope, used to identify the "assumes exists" gap table above.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-17: Bulk or individual review] — Bulk = whole upload to one list from lists the user belongs to.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-19: Explicit payer (default: current user)] — payer default/editable semantics reused verbatim.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-4 — Import Session and Batch] — one `batch_id` per Statement; session vs batch distinction.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-16 — CanonicalLine contract, AD-18 — Dedup identity authority, AD-19 — List authorization, AD-7 — FX conversion] — invariants this story's commit path must honor regardless of 4.6's exact schema.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md] lines 30, 32, 43, 79 — "Bulk review: Upload (mode = Bulk) → Assign/commit statements; list-context upload may pre-select destination for Bulk only"; "List-scoped upload pre-selects destination only for Bulk — does not change Individual default destination" (UX-DR23, AC #2).
- [Source: _bmad-output/implementation-artifacts/4-3-card-routing-mode-review-default-list.md] — `SetCardRoutingService`/ACL-action pattern this story's `AssignBulkImportService` mirrors; `fetchLists()`/`SoftLedgerSelect` reuse precedent; error-mapping convention on a new route.
- [Source: _bmad-output/project-context.md] — hexagonal boundaries, membership-over-ownership ACL, Decimal money, i18n per-domain TS files, no new CSS Modules, testing layers/discipline, "a story must leave the system working end-to-end, not just satisfy stated ACs — the dev agent owns this" (the basis for this file's Prerequisites-gap escalation instruction rather than silently inventing missing infrastructure).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-16: Story context created via `bmad-create-story`, out of epic sequence at explicit user request (4.4–4.6 still backlog) — see "Prerequisites gap" section; status → ready-for-dev.
