---
baseline_commit: 0bb4774
---

# Story 6.4: Budget detail

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the only member of a list,
I want a budget detail page with related transactions,
so that I can see what counted toward a cap.

## Acceptance Criteria

1. **Given** a budget on a solo list (`member_count === 1`) **When** I open its detail (from the budgets list, or by navigating directly to its URL) **Then** I see the budget's **name**, **cap**, **currency**, **spent**, and **near-cap state** (reusing the same state treatment as the budgets list row — AC #2 of Story 6.3), plus a **history of related transactions** (FR-48).
2. **Given** this story lands **before** Story 6.5 (attribution) **When** the detail page renders **Then** the transaction history is **empty** — no ledger lines are attributed to any budget yet (epics.md: "history may be empty until Story 6.5 attributes lines"). Do not query or aggregate `ledger_entries` in this story; `spent` stays hardcoded to `0` exactly as `ListBudgetsService` already does (Story 6.3), and history is a hardcoded empty list — this is correct, not incomplete.
3. **Given** a budget id that does not exist, or exists on a different list than the one in the URL **When** its detail is requested **Then** the caller gets 404 `budget_not_found` (reuse `BudgetNotFoundError`, already defined in `api/domain/errors.py` since Story 6.3 and unused until now).
4. **Given** a non-member of a list **When** they call the budget detail **read** endpoint for a budget on that list **Then** they get 404 `list_not_found` — same `read_budgets` ACL action and hidden-as-404 behavior `ListBudgetsService`/`GET /lists/{list_id}/budgets` already use (AD-19, `deny_as_not_found_for_action`). This story adds no new ACL action.
5. **Given** `member_count ≥ 2` on a list **When** that list's detail is opened **Then** nothing changes from Story 6.3's behavior — budgets remain non-primary UI, no Budgets entry point, and the detail route is reachable only by direct navigation (no UI gate is added or needed here; the API itself has never gated on `member_count`, per AD-29 — see Story 6.3 Dev Notes).
6. **Given** the budgets list page (`/lists/[listId]/budgets`, Story 6.3) **When** it renders **Then** each budget row links to its detail page (`/lists/[listId]/budgets/[budgetId]`) — this is the only change to the existing list page.
7. **Given** CI **When** the budget detail API and page are tested **Then**: an API integration test covers happy-path 200 (cap/spent/state/currency present, `history: []`), 404 for a budget id on another list, 404 for a nonexistent budget id, and 404 for a non-member; a UI test covers defensive-parsing of the detail response and the empty-history rendering path.

## Tasks / Subtasks

- [x] **Task 1 — Persistence: `get_budget` lookup** (AC #1, #3)
  - [x] `api/adapters/persistence/budgets.py`: add `get_budget(self, budget_id: UUID, list_id: UUID) -> BudgetRecord | None` to `SqlAlchemyBudgetRepository` — `select(BudgetModel).where(BudgetModel.id == budget_id, BudgetModel.list_id == list_id)`, `scalar_one_or_none()`, map via the existing `_budget_record` helper. Scoping the query by **both** `id` and `list_id` (not `id` alone, then a separate ownership check) is what makes AC #3's "belongs to a different list" case return not-found automatically — mirror this two-column-`where` shape, don't add a second query.
  - [x] `api/application/budgets.py`: add `get_budget(self, budget_id: UUID, list_id: UUID) -> BudgetRecord | None: ...` to the `BudgetRepository` `Protocol`.

- [x] **Task 2 — Application: `GetBudgetDetailService`** (AC #1, #2, #3, #4)
  - [x] `api/application/budgets.py`: add `GetBudgetDetailCommand(actor_user_id, list_id, budget_id)`.
  - [x] Add `BudgetDetailView` dataclass: same fields as `BudgetView` (`id, name, cap_amount, currency, spent, state, created_at`) plus `history: list[...]` — **hardcode `history` to `[]`** (empty list of whatever placeholder type you choose; see Task 4 for the wire shape). Do not define a rich transaction-line dataclass here if nothing populates it — an empty `list` field with a docstring noting Story 6.5 is the owner is sufficient; don't build attribution/query logic to fill it.
  - [x] `GetBudgetDetailService(repo: BudgetRepository, list_lookup: ListAccessLookup)`:
    1. `AuthorizeListAccessService(self._list_lookup).execute(AuthorizeListAccessCommand(acting_user_id=..., list_id=..., action="read_budgets"))` — **same action Story 6.3 already registered**; do not add a new ACL action for detail (AC #4).
    2. `record = self._repo.get_budget(budget_id=command.budget_id, list_id=command.list_id)`; if `record is None`, raise `BudgetNotFoundError()` (imported from `domain.errors` — already exists, unused since 6.3).
    3. `spent = Decimal("0")`; `state = classify_budget_state(spent, record.cap_amount)` — exact same hardcode-and-classify pattern `ListBudgetsService.execute` already uses; reuse it, don't diverge.
    4. Return `BudgetDetailView(..., history=[])`.

- [x] **Task 3 — API: budget detail route** (AC #1, #3, #4, #7)
  - [x] `api/api/routes/budgets.py`: add `GET /{list_id}/budgets/{budget_id}` → `BudgetDetailResponse`. Import `BudgetNotFoundError` from `domain.errors` (already imported name exists in the module's error set — add it to the existing `from domain.errors import (...)` block).
  - [x] Error mapping: `ListNotFoundError` → 404 `list_not_found` (reuse the existing `_list_not_found()` helper — non-member read, same as `GET /{list_id}/budgets`). `BudgetNotFoundError` → 404 with `content={"detail": str(exc), "code": "budget_not_found"}` (new helper `_budget_not_found()`, mirroring `_list_not_found()`'s shape). Both are 404s but with **different `code` values** — do not collapse them into one message; a UI or API consumer needs to distinguish "list you can't see" from "budget that doesn't exist on a list you can see."
  - [x] Route ordering: FastAPI matches `/{list_id}/budgets/{budget_id}` against a concrete path segment after `/budgets` — no collision with the existing `GET /{list_id}/budgets` (different path shape), so no explicit route-order concern here, but place the new route **after** the existing list/create routes in the file for readability, matching this file's existing top-to-bottom ordering (list → create → detail).
  - [x] API integration tests in `api/tests/test_budgets_integration.py` (append, don't create a new file — same Postgres-16 convention as Story 6.3's tests in this file): detail 200 happy path (`cap`/`spent` as strings, `state: "ok"`, `history: []`); detail 404 for a budget created on a **different** list (create two lists + a budget on list A, request `GET /lists/{B}/budgets/{budget_on_A_id}` → 404 `budget_not_found`); detail 404 for a random/nonexistent `budget_id` UUID; detail 404 for a non-member of the list (`read_budgets` deny).

- [x] **Task 4 — API schema: `BudgetDetailResponse`** (AC #1, #2)
  - [x] `api/api/schemas/budgets.py`: add `BudgetDetailResponse(BaseModel)` — same fields as `BudgetResponse` (`id, list_id, name, cap: str, currency, spent: str, state, created_at`) plus `history: list[dict] = Field(default_factory=list)` — do **not** invent a typed transaction-line schema for a field that is always empty this story; a loosely-typed empty list is honest about what this story actually delivers and avoids guessing at 6.5's eventual shape (which will be informed by however `ledger_entries` attribution actually lands, e.g. new `budget_id` column vs. a join table — neither is decided yet). Add a one-line comment on the field noting Story 6.5 fills this in and may need to change its element type then.
  - [x] Format `cap`/`spent` via `format(value, "f")` — same convention as `_budget_response()` already uses; add a `_budget_detail_response(list_id, view)` helper in `routes/budgets.py` next to the existing `_budget_response()`, don't inline the construction in the route function.

- [x] **Task 5 — UI: budget detail page + list-page links** (AC #1, #2, #6, #7)
  - [x] New page `ui/app/lists/[listId]/budgets/[budgetId]/page.tsx` — async Server Component, same shape/conventions as `ui/app/lists/[listId]/budgets/page.tsx` (Story 6.3): `cookies()`/`fetchSession()`/`requireAlias()`, fetch via `getApiInternalUrl()` + forwarded `Cookie` header, `notFound`/`loadError` branches (reuse `t.detailNotFound`/`t.loadError` — both already exist in `ui/lib/i18n/lists.ts` from prior stories, do not add new duplicate keys for the same meaning). Render name, cap/spent via `formatMoneyAmount` (already added to `ui/lib/currency.ts` in Story 6.3 — reuse, don't re-add), near-cap state label via the existing `budgetStateLabel()` helper (exported from `ui/app/lists/[listId]/budgets/page.tsx` — import and reuse it rather than duplicating the state→label mapping), and an empty-history section (`t.budgetsHistoryEmpty` — new i18n key, en+es) since `history` is always `[]` this story.
  - [x] New BFF route `ui/app/api/lists/[listId]/budgets/[budgetId]/route.ts` — `GET` only (no `POST`/mutation on detail in this story), mirrors `ui/app/api/lists/[listId]/budgets/route.ts`'s `GET` handler shape exactly (cookie-forward, pass through status/body, 502 on fetch failure).
  - [x] `ui/app/lists/[listId]/budgets/page.tsx`: wrap each budget row in a `Link` to `` `/lists/${listId}/budgets/${budget.id}` `` (AC #6) — the row's existing content/classes stay the same, just make it a link (mirror how the "Back to list" link above it already uses `next/link`'s `Link`). This is the **only** change to this existing file.
  - [x] New pure-helper test file `ui/app/lists/[listId]/budgets/[budgetId]/page.budgetDetail.test.ts` (mirror `page.budgets.test.ts`'s defensive-parse pattern from 6.3) — test the response parser (`asBudgetDetail` or equivalent) against: well-formed response, missing/malformed fields (dropped/defaulted, never fabricated), and an empty `history` array (the only shape this story ever actually receives).
  - [x] i18n: add `budgetsHistoryTitle` / `budgetsHistoryEmpty` keys to **both** `en`/`es` in `ui/lib/i18n/lists.ts`, following the existing `budgets*` key-naming convention already established in that file (Story 6.3) — do not hardcode English/Spanish inline in the new page.

- [x] **Task 6 — Docs / traceability**
  - [x] No `_bmad-output/project-context.md` update expected — this story introduces no new durable convention beyond what Story 6.3 already documented (list-scoped-entity CRUD triad, `read_budgets`/`write_budgets` ACL actions, money/i18n rules). Confirmed at implementation time: no new pattern emerged; `project-context.md` left unchanged.

### Review Findings

- [x] [Review][Patch] Detail-page error copy re-collapses the two intentionally-distinct 404 codes — FIXED: added `budgetNotFound` i18n key (en+es) and branched on the response body's `code` field so a `budget_not_found` response now shows budget-specific copy instead of reusing `t.detailNotFound`'s list-unavailable message. [ui/app/lists/[listId]/budgets/[budgetId]/page.tsx:97-131, ui/lib/i18n/lists.ts]
- [x] [Review][Defer] New BFF route `ui/app/api/lists/[listId]/budgets/[budgetId]/route.ts` has no caller in this diff — deferred, kept as speced groundwork per Task 5, likely for a future client-driven flow (e.g. Story 6.5). Resolved by user: keep as-is, no action needed now. [ui/app/api/lists/[listId]/budgets/[budgetId]/route.ts]
- [x] [Review][Defer] 401 mid-fetch `redirect()` call is swallowed by a bare `try/catch` — deferred, pre-existing (byte-for-byte the same pattern already shipped in `ui/app/lists/[listId]/budgets/page.tsx:114-126` from Story 6.3, itself already logged as deferred in that story's review; this diff copies the same pattern into the new detail page rather than introducing a new bug — see `deferred-work.md`) [ui/app/lists/[listId]/budgets/[budgetId]/page.tsx:97-112]
- [x] [Review][Defer] `resolvePageLocale`/`cookieHeader` duplicated verbatim across the list and detail pages — deferred, pre-existing (matches the same per-page duplication convention already established across this module by Story 6.3; not unique to this diff) [ui/app/lists/[listId]/budgets/[budgetId]/page.tsx:18-29]

## Dev Notes

- **This story is additive to Story 6.3's already-shipped budgets module — no new table, no new ACL action, no new error class.** `BudgetNotFoundError` was deliberately added to `api/domain/errors.py` in Story 6.3 specifically for this story to consume (see 6.3's Completion Notes: "explicitly required by Task 1 for Story 6.4, not scope creep"). Everything else this story needs (the `budgets` table, `read_budgets` ACL action, `classify_budget_state`, `formatMoneyAmount`, `budgetStateLabel`, `t.detailNotFound`/`t.loadError`) already exists — this story is a thin read-path extension, not a new subsystem. Resist the temptation to add anything structurally new (no migration, no new ACL action, no new i18n message-object domain).
- **`spent` and `history` are both hardcoded/empty — this is correct, not incomplete, exactly like 6.3's `spent`.** Story 6.5 ("Budget attribution — manual and rules") is what adds the actual attribution mechanism (likely `ledger_entries.budget_id` or a join table — not decided) and makes both real. Do not write any `ledger_entries` query in this story. The epics text is explicit: "history may be empty until Story 6.5 attributes lines."
- **Why the detail response's `history` field is loosely typed (`list[dict]`) instead of a proper schema:** 6.5 hasn't shipped, so the exact shape of an attributed transaction line (which ledger fields, whether it's a full `ExpenseItemResponse`-like shape or a slimmer projection) is unknown. Guessing and typing it now risks a wrong contract that 6.5 has to break. An always-empty, loosely-typed placeholder is the honest choice — don't invent a `BudgetTransactionResponse` with fields nothing populates yet. Flag this explicitly in the Change Log so 6.5's author knows it's an open contract decision, not a locked one.
- **Reuse the `get_budget` two-column `WHERE (id, list_id)` scoping trick for the not-found-vs-wrong-list distinction (AC #3).** A budget that exists but belongs to a different list must 404 exactly like one that doesn't exist at all — don't fetch by `id` alone and then compare `list_id` in Python (that would leak existence information across a timing/branch difference and duplicates a query for no reason). Scope the query itself.
- **Two distinct 404 codes on the same route, and that's intentional (AC #3 vs #4):** `list_not_found` (via `ListNotFoundError`, non-member) and `budget_not_found` (via `BudgetNotFoundError`, wrong/missing budget id on a list you *can* read) are different failure modes with different `code` values in the response body, both mapped to HTTP 404. Don't collapse them into one generic "not found" — the distinct `code` is what a future UI or API consumer would key off of.
- **No UI gate is added for `member_count >= 2` on the detail route (AC #5).** Story 6.3 already established that the API and its pages don't gate on membership count (AD-29) — only the list-detail page's **entry point** (the Budgets link) is solo-only. This story doesn't touch that entry point's gating logic at all; it only adds a link *from* the already-gated budgets list page to a new detail page. A multi-member list's budgets remain reachable only by a direct URL, same posture as the list page itself in 6.3.
- **Money discipline is identical to every other story:** `cap`/`spent` are `Decimal` server-side, wire-serialized via `format(value, "f")` (never `str(Decimal)`, never a JSON number) — same non-negotiable rule as 6.3.
- **Previous story's incident note:** 6.3's Dev Agent Record flags a self-caused container-removal incident from using `docker compose kill/rm` on service names shared with a one-off test-image run; prefer `docker compose run --rm --no-deps` for one-off test containers in this worktree if you need one.

### Project Structure Notes

- **New files:** `ui/app/lists/[listId]/budgets/[budgetId]/page.tsx`, `ui/app/lists/[listId]/budgets/[budgetId]/page.budgetDetail.test.ts`, `ui/app/api/lists/[listId]/budgets/[budgetId]/route.ts`.
- **Modified files:** `api/adapters/persistence/budgets.py` (`get_budget`), `api/application/budgets.py` (`BudgetRepository.get_budget` protocol method, `GetBudgetDetailCommand`, `BudgetDetailView`, `GetBudgetDetailService`), `api/api/routes/budgets.py` (new `GET .../{budget_id}` route + `_budget_not_found()`/`_budget_detail_response()` helpers), `api/api/schemas/budgets.py` (`BudgetDetailResponse`), `api/tests/test_budgets_integration.py` (append detail tests), `ui/app/lists/[listId]/budgets/page.tsx` (wrap rows in `Link` to detail), `ui/lib/i18n/lists.ts` (`budgetsHistoryTitle`/`budgetsHistoryEmpty`, en+es).
- **No changes to:** `api/domain/budgets.py` (no new validation needed — detail is read-only), `api/domain/list_access.py` (no new ACL action — reuses `read_budgets`), `api/adapters/persistence/models.py` (no schema change), any Alembic migration (none needed), `ui/app/lists/[listId]/budgets/BudgetsCreateForm.tsx`, `ui/app/lists/[listId]/page.tsx`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 6.4` lines 1930-1941] — this story's ACs verbatim ("history may be empty until Story 6.5 attributes lines")
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` FR-48] — "Budget detail shows cap and related transaction history"
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-29 line 245] — solo-only UI, API not gated on member_count
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` line 78] — "detail = cap + related transaction history. Attribution later in epic."
- [Source: `_bmad-output/implementation-artifacts/6-3-budget-list.md`] — full precedent for the budgets module this story extends: `BudgetNotFoundError` reserved for this story; `read_budgets`/`write_budgets` ACL actions; `spent`-hardcoded-to-0 pattern this story's `history`-hardcoded-to-`[]` mirrors; `formatMoneyAmount`, `budgetStateLabel`, route-based (not in-page-tab) design precedent
- [Source: `api/domain/errors.py:653-658`] — `BudgetNotFoundError` (`CODE = "budget_not_found"`), already defined, unused until this story
- [Source: `api/adapters/persistence/budgets.py`, `api/application/budgets.py`, `api/api/routes/budgets.py`, `api/api/schemas/budgets.py`] — the exact module set this story extends in place (no new files at these layers)
- [Source: `api/api/routes/cards.py:100-133` `set_card_routing`] — precedent for a route mapping a not-found domain error to 404 with its own `code`, alongside a separate membership-deny mapping in the same handler
- [Source: `api/application/list_access.py`] — confirms `AuthorizeListAccessService` raises `ListNotFoundError` (not `NotListMemberError`) for a `read_budgets` deny, which is what makes AC #4's 404 automatic with zero new code
- [Source: `ui/app/lists/[listId]/budgets/page.tsx`] — `asBudgets`/`budgetStateLabel`/`detailNotFound`/`loadError` precedents this story imports and reuses rather than duplicating
- [Source: `ui/app/api/lists/[listId]/budgets/route.ts`] — `GET` handler shape the new detail BFF route mirrors
- [Source: `ui/lib/currency.ts` `formatMoneyAmount`, added Story 6.3] — reused as-is, no changes needed
- [Source: `ui/lib/i18n/lists.ts:128-140,270-282`] — existing `budgets*` en/es key block this story's two new keys append to
- [Source: `_bmad-output/project-context.md#TypeScript / React (ui/)`, `#Python (api/)`] — money-as-Decimal/string-at-wire-boundary; i18n per-domain TS message object convention; hidden-as-404/mutation-as-403 ACL split

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (BMad dev-story workflow)

### Debug Log References

- API integration tests run via `docker compose run --rm --no-deps -v "$(pwd)/api:/app" -e DATABASE_URL=... --entrypoint sh api -c "uv run pytest ..."` against the worktree's existing Compose Postgres 16 (`db` service has no host port; ran the api image with the repo bind-mounted and a network-reachable `DATABASE_URL` instead of `docker compose exec`, since the running `api` image is built `--no-dev` and has no `tests/` directory copied in).
- Full API suite: `893 passed` (incl. 4 new budget-detail integration tests). Ruff check + format: clean.
- Full UI suite (vitest): `605 passed` across 78 files (incl. 3 new `asBudgetDetail` tests). `tsc --noEmit`: clean. `eslint .`: clean.
- Manual smoke test against the running worktree stack (`localhost:8310` api, `localhost:3310` ui): registered a user, claimed alias, created a budget, confirmed `GET /lists/{id}/budgets/{budgetId}` returns 200 with `history: []`, confirmed a nonexistent budget id 404s `budget_not_found`, confirmed the detail page renders name/state/amounts/empty-history copy, and confirmed the budgets list page now links each row to its detail page.

### Completion Notes List

- Persistence: added `SqlAlchemyBudgetRepository.get_budget(budget_id, list_id)` scoped by both columns in one `WHERE`, so a budget on another list 404s identically to a nonexistent one (AC #3) — no second query, no Python-side ownership comparison.
- Application: added `GetBudgetDetailCommand`/`BudgetDetailView`/`GetBudgetDetailService`, reusing the existing `read_budgets` ACL action (AC #4) and the same hardcode-`spent`-to-0-then-`classify_budget_state` pattern `ListBudgetsService` already uses. `history` is hardcoded to `[]` — no `ledger_entries` query written (AC #2).
- API: added `GET /{list_id}/budgets/{budget_id}` mapping `ListNotFoundError` → 404 `list_not_found` and `BudgetNotFoundError` → 404 `budget_not_found` (distinct codes, same status, per Dev Notes). `BudgetDetailResponse.history` is `list[dict]` (loosely typed on purpose — Story 6.5's attribution shape isn't decided yet).
- UI: new `page.tsx` at `.../budgets/[budgetId]` (Server Component, same conventions as the 6.3 list page), new `GET`-only BFF route mirroring the list route's shape, and the list page's rows are now wrapped in `Link`s to the new detail route (the only change to that file). Reused `formatMoneyAmount`, `budgetStateLabel` (imported from the list page rather than duplicated), and `t.detailNotFound`/`t.loadError`. Added two new i18n keys (`budgetsHistoryTitle`, `budgetsHistoryEmpty`) in en+es.
- Tests: 4 new API integration tests (happy path, wrong-list 404, nonexistent-id 404, non-member 404) appended to `test_budgets_integration.py`; 3 new UI unit tests for `asBudgetDetail`'s defensive parsing (well-formed, malformed/missing fields, missing/malformed `history` defaulted to `[]`).
- No new migration, no new ACL action, no `project-context.md` change — this story stayed a thin read-path extension of Story 6.3's module, as scoped.

### File List

- `api/adapters/persistence/budgets.py` — added `get_budget`
- `api/application/budgets.py` — added `get_budget` to `BudgetRepository` protocol, `GetBudgetDetailCommand`, `BudgetDetailView`, `GetBudgetDetailService`
- `api/api/routes/budgets.py` — added `GET /{list_id}/budgets/{budget_id}` route, `_budget_not_found()`, `_budget_detail_response()`
- `api/api/schemas/budgets.py` — added `BudgetDetailResponse`
- `api/tests/test_budgets_integration.py` — appended 4 budget-detail integration tests
- `ui/app/lists/[listId]/budgets/[budgetId]/page.tsx` — new detail page + `asBudgetDetail` parser
- `ui/app/lists/[listId]/budgets/[budgetId]/page.budgetDetail.test.ts` — new parser unit tests
- `ui/app/api/lists/[listId]/budgets/[budgetId]/route.ts` — new `GET`-only BFF route
- `ui/app/lists/[listId]/budgets/page.tsx` — wrapped each budget row in a `Link` to its detail page
- `ui/lib/i18n/lists.ts` — added `budgetsHistoryTitle`/`budgetsHistoryEmpty` (en+es)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-4-budget-detail` → `review`

## Change Log

- 2026-08-31: Story created via create-story workflow. Confirmed this story is a thin read-path extension of Story 6.3's already-shipped budgets module — no new table, no new ACL action, no new error class (`BudgetNotFoundError` was pre-added in 6.3 specifically for this story). Left the detail response's `history` field loosely typed (`list[dict]`, always `[]`) rather than guessing at Story 6.5's eventual attribution shape — documented as an open contract decision for 6.5's author to finalize, not a locked schema.
- 2026-09-01: Implemented Tasks 1-6. Added `get_budget` persistence lookup + `GetBudgetDetailService` (application) + `GET /{list_id}/budgets/{budget_id}` (API) + `BudgetDetailResponse` (schema); appended 4 API integration tests. Added the UI detail page, its BFF route, 3 parser unit tests, and wrapped the budgets list rows in links to the new detail page; added 2 new i18n keys (en+es). Full regression: 893 API tests + 605 UI tests pass, ruff/tsc/eslint clean. `history` field's open-contract note for Story 6.5 stands as originally flagged — nothing decided here.
