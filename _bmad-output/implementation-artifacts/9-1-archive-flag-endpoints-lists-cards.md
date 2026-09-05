---
baseline_commit: 6f35883
---

# Story 9.1: `archived` flag + endpoints for lists and cards

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an `archived` boolean on lists and cards with owner-scoped archive/unarchive endpoints and an `archived` list-filter query param,
So that Stories 9.2 and 9.3 have a stable API to build the `--lite` UI against, mirroring the budget-archiving contract from Story 7.6.

## Acceptance Criteria

1. **Given** the lists and cards tables, **when** this story's migration runs, **then** each gains an `archived` boolean defaulting to `false`; existing rows are unaffected (no forced backfill, no data loss). [Source: epics.md#Story 9.1]
2. **Given** a list owner, **when** they call archive/unarchive on a list they own, **then** the flag toggles and the action is rejected for non-owners (membership ACL / NFR-3, same pattern as Story 7.6's budget-owner check).
3. **Given** a card's registering user, **when** they call archive/unarchive on that card, **then** the flag toggles and the action is rejected for any other user.
4. **Given** the Lists homepage and Cards panel list endpoints, **when** an `archived` filter parameter is passed, **then** they return only archived (`true`) or only non-archived (`false`/omitted, default) rows — same filter shape as the existing budgets endpoint from Story 7.6.
5. **Given** a list or card is archived, **when** its historical data is considered, **then** membership, import batches, ledger lines, and balances are unaffected — archiving only changes default-view visibility.
6. **Given** this story, **when** scope is considered, **then** no UI ships here — Stories 9.2/9.3 consume this API; this story is not `--lite`-compatible (schema + API change) and must run in a full `scripts/worktree/worktree-bootstrap.sh` (non-`--lite`) stack.

## Tasks / Subtasks

- [x] Task 1: Persist archive state — lists and cards (AC: #1, #5)
  - [x] Add Alembic migration `0038_lists_cards_archived.py`, chained off `0037_budget_archived` (the current head — confirm no newer head landed since Story 7.6 before setting `down_revision`), adding `lists.is_archived boolean NOT NULL DEFAULT false` and `cards.is_archived boolean NOT NULL DEFAULT false` in the same migration (one file, two `op.add_column` calls — mirrors `0037_budget_archived.py`'s single-column shape, just twice). No index needed on either column: `lists` is membership-scoped per-user (small row counts, same reasoning as `list_budgets_for_owner`'s unindexed lookup) and `cards` is already scoped by `user_id` with an existing unique index on `(user_id, iban)` that any archived-filter query rides alongside.
  - [x] Add `is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sa.false())` to `ListModel` (`api/adapters/persistence/models.py`, after `same_price_window_days`) and to `CardModel` (same file, after `created_at`) — same column definition Story 7.6 used on `BudgetModel` (line 519), so match its exact `mapped_column` call shape.
  - [x] Add `is_archived: bool = False` to `ListRecord` (`application/lists.py`) and to `CardRecord` (`application/cards.py`), each defaulting to `False` (unlike `BudgetRecord`, which has no default — these two records are constructed positionally/partially in several existing call sites, e.g. `ListRecord(id=..., name=..., owner_id=...)` throughout `repositories.py`'s `get_list`/`update_list_name`/`get_list_with_grant`; giving the new field a default avoids having to touch every one of those construction sites just to keep them compiling). Thread the real value through wherever a full row is available: `_card_record()` in `adapters/persistence/cards.py`, and every `ListRecord(...)` construction in `repositories.py` that already has the `ListModel` row in scope (`get_list`, `update_list_name`, `get_list_with_grant`) — add `is_archived=row.is_archived` there. Leave any construction site that does NOT have the row (none currently exist for `ListRecord`, but double-check) on the default.

- [x] Task 2: API — lists archive/unarchive + filtered listing (AC: #2, #4, #5)
  - [x] Add `archive_list(self, list_id: UUID) -> None` and `unarchive_list(self, list_id: UUID) -> None` to `SqlAlchemyListRepository` (`api/adapters/persistence/repositories.py`) — `session.get(ListModel, list_id)` + set `is_archived` + `flush()`, same shape as `update_list_name`/`delete_list` (lines ~314-327). Add matching entries to the `ListRepository` Protocol in `application/lists.py`.
  - [x] Change `list_for_user(self, user_id: UUID) -> list[ListMembershipSummary]` to `list_for_user(self, user_id: UUID, *, archived: bool = False) -> list[ListMembershipSummary]` — add `ListModel.is_archived == archived` to the existing `.where(ListMembershipModel.user_id == user_id)` clause (repositories.py ~line 336). Update the `ListRepository` Protocol signature to match. This is the only call site (`ListMembershipsService.execute`) — update it to accept and forward an `archived` param (see next bullet).
  - [x] Add `ArchiveListCommand`/`ArchiveListService` and `UnarchiveListCommand`/`UnarchiveListService` to `application/lists.py`, mirroring `RenameListService`'s existing ad-hoc-ACL shape exactly (fetch `get_list` + `get_membership`, missing-list-or-non-member → `NotListMemberError`, non-owner → `NotListOwnerError`) — **not** `AuthorizeListAccessService`/`AuthorizeListAccessCommand` (that's the newer shared-port ACL used by expenses/balances/etc.; `RenameListService`/`DeleteListService` are the as-built precedent for owner-only list mutations and this story explicitly should not migrate that grandfathered pattern, matching Story 7.6's own "don't silently migrate deny paths" note repurposed here for lists).
  - [x] Add `ListMembershipsCommand.archived: bool = False`; `ListMembershipsService.execute` passes `command.archived` into `self._repo.list_for_user(command.actor_user_id, archived=command.archived)`.
  - [x] Add `is_archived: bool` to `ListMembershipItem`, `ListResponse`, and `ListDetailResponse` in `api/api/schemas/lists.py`, defaulting to `False` to avoid having to touch every existing construction site; set the real value at `_list_response()` and at the `get_list_detail`/`list_memberships`/`rename_list` route bodies in `api/api/routes/lists.py` where a `ListRecord`/`ListMembershipSummary` with the field is already in hand.
  - [x] Route: `GET /lists` (`list_memberships`) gains an optional query param `archived: bool = False` (FastAPI `Query`, mirrors `GET /budgets`'s shape) forwarded into `ListMembershipsCommand(actor_user_id=user_id, archived=archived)`.
  - [x] Routes: `POST /lists/{list_id}/archive` and `POST /lists/{list_id}/unarchive`, `response_model=ListResponse`, each catching `(ListNotFoundError, NotListMemberError)` → `_access_denied()` and `NotListOwnerError` → 403 `not_list_owner` (same three-way error handling `rename_list` already uses), returning `_list_response(result.id, result.name, result.owner_id)` extended with `is_archived=result.is_archived`. Do **not** overload `PATCH /lists/{list_id}` (`RenameListBody`) — same reasoning as Story 7.6's budgets: archiving is a standalone action triggerable independently of renaming.

- [x] Task 3: API — cards archive/unarchive + filtered listing (AC: #3, #4, #5)
  - [x] Add `archive_card(self, card_id: UUID, user_id: UUID) -> CardRecord` and `unarchive_card(self, card_id: UUID, user_id: UUID) -> CardRecord` to `SqlAlchemyCardRepository` (`api/adapters/persistence/cards.py`) — same `select(...).where(id==, user_id==)` + `CardNotFoundError` on miss + mutate + `flush()` shape as `update_routing` (lines 72-83). Add matching entries to the `CardRepository` Protocol in `application/cards.py`.
  - [x] Change `list_cards_for_user(self, user_id: UUID) -> list[CardRecord]` to `list_cards_for_user(self, user_id: UUID, *, archived: bool = False) -> list[CardRecord]` — add `CardModel.is_archived == archived` to the existing `.where(CardModel.user_id == user_id)` clause. Update the `CardRepository` Protocol signature and `ListCardsService.execute`/`ListCardsCommand` to accept and forward `archived: bool = False`.
  - [x] Add `ArchiveCardCommand`/`ArchiveCardService` and `UnarchiveCardCommand`/`UnarchiveCardService` to `application/cards.py`, mirroring `SetCardRoutingService`'s existing `get_card` + `CardNotFoundError`-on-miss shape (`get_card(card_id, actor_user_id)` already scopes by user, so "any other user" in AC #3 gets the same not-found-not-403 treatment `SetCardRoutingService`/`test_set_card_routing_unowned_card_not_found` already establish for cards — no new 403 path, consistent with this repo's existing card-ownership pattern, distinct from lists' 403-on-non-owner-member pattern above since cards have no membership concept to be "found but denied" through).
  - [x] Route: `GET /cards` (`list_cards`) gains an optional query param `archived: bool = False` forwarded into `ListCardsCommand(actor_user_id=user_id, archived=archived)`.
  - [x] Routes: `POST /cards/{card_id}/archive` and `POST /cards/{card_id}/unarchive`, `response_model=CardResponse`, each catching `CardNotFoundError` → 404 `card_not_found` (same shape `set_card_routing` already uses), returning `_card_response(result)` extended with `is_archived`.
  - [x] Add `is_archived: bool` to `CardResponse` in `api/api/schemas/cards.py`; set the real value at `_card_response()` in `api/api/routes/cards.py`.

- [x] Task 4: Tests
  - [x] `api/tests/test_cards_application.py`: extend `_FakeCardRepo` to carry `is_archived` on stored records and support `archive_card`/`unarchive_card`/`archived`-filtered `list_cards_for_user`; add cases mirroring `test_set_card_routing_unowned_card_not_found` for `ArchiveCardService`/`UnarchiveCardService` (own card succeeds; another user's card → `CardNotFoundError`), and a `ListCardsService` case proving `archived=True` returns only archived cards while `archived=False`/default returns only non-archived ones.
  - [x] `api/tests/test_lists_integration.py` (real Postgres, no fake-repo precedent exists for lists — follow this file's existing end-to-end style, not `test_cards_application.py`'s fake-repo style): add cases — owner archives own list via `ArchiveListService`/route → excluded from default `GET /lists`, present under `?archived=true`, unarchive → back to default; non-owner member attempting archive → `NotListOwnerError`/403; non-member/nonexistent list → `NotListMemberError`/`_access_denied()`; archiving preserves membership/ledger entries/balances (fetch `GET /lists/{id}/balances` or membership list directly after archiving and confirm unchanged, per AC #5) — mirrors Story 7.6's `test_archive_preserves_history_and_rules_detail_unfiltered` intent but adapted to lists having no separate unfiltered detail-vs-list distinction to re-verify (list detail-by-id, i.e. `GET /lists/{id}`, is also not archive-filtered — confirm this stays true, same "detail endpoints don't filter by archive state" rule as budgets).
  - [x] `api/tests/test_cards_integration.py`: add cases — user archives own card → excluded from default `GET /cards`, present under `?archived=true`, unarchive → back to default; archiving preserves import-history linkage (an archived card's `fixed_list_id`/`routing_mode` and any ledger entries with `origin_card_id` pointing at it are unaffected — confirm no cascade/side-effect touches those).

## Dev Notes

- **This is a backend-only story (AC #6)** — no UI files change here. Stories 9.2 (lists) and 9.3 (cards) consume this API. Do not add any `ui/` changes, i18n keys, or icon components — those belong to 9.2/9.3, which explicitly reuse Story 7.6's `BoxIcon`/toggle pattern already built for budgets (do not build a second copy here).
- **Sequencing / worktree:** per the epics header (Epic 9), this story is a schema + API change and is **not** `--lite`-compatible — it must run in a full `scripts/worktree/worktree-bootstrap.sh` stack (not `--lite`), per [[feedback_worktree_bootstrap]]. Stories 9.2/9.3 are independent of each other and both `--lite`-compatible once this story's API is live on the primary stack they point at.
- **Two independent entities, two different ACL shapes — do not unify them.** Lists use the pre-existing ad-hoc owner-vs-member ACL (`get_list` + `get_membership` + manual `NotListMemberError`/`NotListOwnerError` branching, as seen in `RenameListService`/`DeleteListService`) — a list has members who are not the owner, so "not found" and "found but not owner" are genuinely different outcomes (403 for the latter). Cards have no membership concept at all — `get_card(card_id, user_id)` is already scoped to the caller, so any other user's card is indistinguishable from a nonexistent one and stays 404-only, exactly like `SetCardRoutingService` already does. Resist the temptation to route both through `AuthorizeListAccessService` or through a single shared "ownable resource" helper — that would be a bigger refactor than this story's scope and isn't asked for.
- **Migration ordering:** the current Alembic head is `0037_budget_archived` (Story 7.6, already merged to `main` per `git log`). Re-verify this is still the head when you start — if another migration has landed since story creation, chain off that one instead and note the change, same caveat Story 7.6's own migration docstring called out for its predecessor.
- **`GET /lists/{list_id}` and `GET /cards` detail-by-id-equivalent reads stay unfiltered by archive state** — same "list endpoint filters, detail doesn't" rule Story 7.6 established for budgets (`GET /budgets/{id}` stays unfiltered). Cards has no single-card detail route today (`GET /cards/{card_id}` doesn't exist) — nothing to change there, just don't add archive-filtering to anything other than the two list-shaped `GET /lists` and `GET /cards` endpoints.
- **`ListRecord`/`CardRecord` default `is_archived=False`** rather than being a required field (unlike `BudgetRecord.is_archived`, which Story 7.6 made required) — this avoids touching the several existing `ListRecord(id=..., name=..., owner_id=...)` construction sites in `repositories.py` that don't have easy access to the full row today, and avoids risk of silently defaulting a *real* row to the wrong value in a place that was missed. Anywhere the DB row is already in scope, thread through the real value instead of relying on the default — the default exists only to keep unrelated call sites compiling, not as the intended production behavior.
- **Query-param filtering on the existing list endpoints** (not new `GET /lists/archived` or `GET /cards/archived` routes) — same reasoning Story 7.6 documented for budgets: one list endpoint, one response shape, consistent with the rest of each router.
- **Archiving must not touch:** `ListMembershipModel` rows, `ImportBatchModel`/ledger entries, `fixed_list_id` routing pointers on cards, or any balance computation (`compute_viewer_balance_crc`, `compute_viewer_pairwise_edges`) — these all key off membership/ledger data untouched by the new boolean column. AC #5 is the explicit check for this; cover it with an integration test that fetches balances/membership after archiving and asserts no change, not just that the archived flag itself round-trips.
- **Don't build any UI here, including icons or i18n** — box-icon toggle, morph animation, and copy keys were already built for budgets in Story 7.6 (`ui/app/icons/BoxIcon.tsx`, `budgetsShowArchived`/etc. in `ui/lib/i18n/lists.ts`) and will be reused/extended by 9.2/9.3, not duplicated here.

### Project Structure Notes

- New: `api/adapters/persistence/migrations/versions/0038_lists_cards_archived.py`.
- Modified (API): `api/adapters/persistence/models.py` (`ListModel.is_archived`, `CardModel.is_archived`), `api/adapters/persistence/repositories.py` (`archive_list`/`unarchive_list`, `list_for_user` gains `archived` param, `ListRecord` construction sites get `is_archived`), `api/adapters/persistence/cards.py` (`archive_card`/`unarchive_card`, `list_cards_for_user` gains `archived` param, `_card_record` gets `is_archived`), `api/application/lists.py` (`ListRecord.is_archived`, `ArchiveListCommand`/`Service`, `UnarchiveListCommand`/`Service`, `ListMembershipsCommand.archived`, `ListRepository` Protocol additions), `api/application/cards.py` (`CardRecord.is_archived`, `ArchiveCardCommand`/`Service`, `UnarchiveCardCommand`/`Service`, `ListCardsCommand.archived`, `CardRepository` Protocol additions), `api/api/routes/lists.py` (two new routes, `archived` query param on `GET /lists`, `is_archived` in response builders), `api/api/routes/cards.py` (two new routes, `archived` query param on `GET /cards`, `is_archived` in `_card_response`), `api/api/schemas/lists.py` (`is_archived` on `ListMembershipItem`/`ListResponse`/`ListDetailResponse`), `api/api/schemas/cards.py` (`is_archived` on `CardResponse`).
- Test files modified per Task 4 above: `api/tests/test_cards_application.py`, `api/tests/test_lists_integration.py`, `api/tests/test_cards_integration.py`.
- No changes to any `ui/` file, no new domain validation functions (archiving is pure persistence + application-layer, same as Story 7.6), no changes to `application/list_access.py`'s `AuthorizeListAccessService` (deliberately not reused here — see Dev Notes ACL-shape rationale).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.1`, lines 2368-2407] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 9` header, lines 2351-2367] — sequencing note (9.1 full worktree, 9.2/9.3 `--lite`-compatible and independent), demo gate
- [Source: `_bmad-output/implementation-artifacts/7-6-archive-budgets.md`] — the mirrored precedent this story explicitly extends: migration shape, owner-only 404-vs-403 ACL split, query-param list filtering, "detail endpoint stays unfiltered" rule, standalone archive/unarchive routes instead of overloading PATCH
- [Source: `_bmad-output/project-context.md`] — Alembic-only schema changes; API wire snake_case; generic vocabulary in fixtures; `<type>/<epic>/<us-id>` branch naming
- [Source: `api/adapters/persistence/migrations/versions/0037_budget_archived.py`] — most recent migration and current Alembic head as of this story's creation; model the new one's structure/docstring after it, re-verify head before setting `down_revision`
- [Source: `api/adapters/persistence/models.py` `BudgetModel.is_archived`, line 519] — exact column definition to replicate on `ListModel`/`CardModel`
- [Source: `api/application/lists.py` `RenameListService`/`DeleteListService`, lines 333-373] — the as-built ad-hoc owner-vs-member ACL pattern to mirror for `ArchiveListService`/`UnarchiveListService` (not `AuthorizeListAccessService`)
- [Source: `api/application/cards.py` `SetCardRoutingService`, lines 119-151] — `get_card` + `CardNotFoundError`-on-miss pattern to mirror for `ArchiveCardService`/`UnarchiveCardService`
- [Source: `api/adapters/persistence/repositories.py` `list_for_user`, lines 329-368] — existing list-for-user query to add the `archived` filter to
- [Source: `api/adapters/persistence/cards.py` `list_cards_for_user`/`update_routing`] — existing card query/mutation patterns to extend
- [Source: `api/api/routes/lists.py` `rename_list`, lines 893-922] — three-way error handling (`InvalidListNameError` / `(ListNotFoundError, NotListMemberError)` / `NotListOwnerError`) to replicate on the new archive/unarchive routes
- [Source: `api/api/routes/cards.py` `set_card_routing`, lines 100-138] — `CardNotFoundError` → 404 pattern to replicate on the new card archive/unarchive routes
- [Source: `api/tests/test_cards_application.py` `_FakeCardRepo`] — existing fake repo test double to extend for archive/unarchive coverage
- [Source: `api/tests/test_lists_integration.py`, `api/tests/test_cards_integration.py`] — existing Postgres-integration test files/fixtures to extend
- [[feedback_worktree_bootstrap]] — use `scripts/worktree/worktree-bootstrap.sh` (non-`--lite`) for this story's dev/test stack, not ad-hoc docker run

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Verified `0037_budget_archived` was still the Alembic head before creating `0038_lists_cards_archived.py` (`git log`/`ls migrations/versions`).
- Applied migration via `docker compose exec api alembic upgrade head` against the worktree's full (non-`--lite`) Compose stack — succeeded.
- Full `uv run pytest -q` inside the api container: 1032 passed. `uv run ruff check .` / `uv run ruff format --check .`: clean.

### Completion Notes List

- Added `is_archived` boolean (default `false`) to `lists` and `cards` via migration `0038_lists_cards_archived.py`, chained off `0037_budget_archived`.
- Lists: owner-only `archive_list`/`unarchive_list` mirroring `RenameListService`'s ad-hoc ACL (missing-list-or-non-member → `NotListMemberError`/403 `not_list_member`; non-owner member → `NotListOwnerError`/403 `not_list_owner`). `GET /lists` gained an `archived` query filter (default `false`); `GET /lists/{id}` detail stays unfiltered per the budgets precedent.
- Cards: `archive_card`/`unarchive_card` mirror `SetCardRoutingService`'s `get_card`-scoped-by-user + `CardNotFoundError` shape — any other user's card is a 404, no 403 path (cards have no membership concept). `GET /cards` gained an `archived` query filter (default `false`).
- Archiving is pure persistence + application layer — no changes to membership rows, ledger entries, `fixed_list_id` routing, or balance computation; covered by an integration test that diffs `GET /lists/{id}/members` and `GET /lists/{id}/balances` before/after archiving, and a cards test confirming `fixed_list_id`/`routing_mode` survive archiving.
- Also updated `FakeListRepo` in `tests/test_lists_domain.py` (pre-existing fake, not listed in the story's own File List) to accept the new `archived` kwarg on `list_for_user` — required to keep that file's existing tests compiling/passing; no test behavior in that file was changed.
- No `ui/` files touched (AC #6); ran the full non-`--lite` worktree stack per Dev Notes sequencing.

### File List

- New: `api/adapters/persistence/migrations/versions/0038_lists_cards_archived.py`
- Modified: `api/adapters/persistence/models.py`
- Modified: `api/adapters/persistence/repositories.py`
- Modified: `api/adapters/persistence/cards.py`
- Modified: `api/application/lists.py`
- Modified: `api/application/cards.py`
- Modified: `api/api/routes/lists.py`
- Modified: `api/api/routes/cards.py`
- Modified: `api/api/schemas/lists.py`
- Modified: `api/api/schemas/cards.py`
- Modified: `api/tests/test_cards_application.py`
- Modified: `api/tests/test_cards_integration.py`
- Modified: `api/tests/test_lists_integration.py`
- Modified: `api/tests/test_lists_domain.py` (pre-existing `FakeListRepo` updated for the new `list_for_user(archived=...)` signature — not in the original Task 4 plan but required to keep existing tests passing)

## Change Log

| Date | Change |
| --- | --- |
| 2026-09-04 | Story drafted via create-story workflow, mirroring Story 7.6's archive-budgets contract for lists and cards. |
| 2026-09-05 | Implemented `is_archived` flag + archive/unarchive endpoints for lists and cards, mirroring Story 7.6's budget-archiving contract. All tasks complete; full api suite (1032 tests) + ruff lint/format green. |
