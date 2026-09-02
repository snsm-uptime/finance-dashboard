---
baseline_commit: 1791c4c
---

# Story 7.1: Standalone budget list + create

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a Budgets area independent of any single list, where I create a budget and pick its source lists,
so that I can track spend across whichever lists I choose.

## Acceptance Criteria

1. **Given** I am signed in **When** I open `/budgets` **Then** I can create/list budgets with name, cap, currency, and one or more source lists selected from lists I belong to (FR-48) **And** near-cap state is visible per budget.
2. **Given** a budget I did not create **When** another user who shares one of its source lists views that list (or calls a budget endpoint directly) **Then** they cannot see or discover the budget at all — same 404 shape as a nonexistent budget id, no distinct "forbidden" signal (owner-only, FR-48).
3. **Given** an existing budget from Epic 6 (has a single `list_id`) **When** this story's migration runs **Then** it is preserved with that one list as its sole source list, no data loss — the budget's `owner_user_id` backfills from that list's `owner_id`.
4. **Given** a create-budget submission with zero source lists selected **When** it is submitted **Then** it is rejected 422 (`invalid_budget_source_lists`) — a budget must always have at least one source list.
5. **Given** a create-budget submission naming a list the caller is not a member of **When** it is submitted **Then** it is rejected the same way an unreachable list is elsewhere in this codebase (403 `not_list_member`) — no leak of whether that list id exists.
6. **Given** CI **When** this story is tested **Then**: domain unit tests cover source-list-id validation (empty rejected, duplicates deduped) and the (unchanged) name/cap/currency/near-cap functions still hold; API integration tests cover create with 1 and with N source lists, create with 0 source lists (422), create naming a non-member list (403), list returns only the caller's own budgets with correct near-cap state aggregated across each budget's source lists, a non-owner gets 404 on every budget-scoped route, and the migration's backfill (existing single-`list_id` budget survives with that list as sole source list) is verified against a fixture; a UI test covers the create form's multi-select source-list picker and defensive parsing of the new `source_lists` response shape.

## Tasks / Subtasks

- [x] **Task 1 — Migration: standalone owner-scoped model** (AC #3)
  - [x] New `api/adapters/persistence/migrations/versions/0035_budgets_standalone_entity.py` (renumbered from `0034` — `main` landed `0034_user_photo` first, so this revision's `down_revision` chains onto that instead of `0033_budget_attribution`). In order: (1) add `budgets.owner_user_id` (UUID, FK `users.id` ON DELETE CASCADE, **nullable** at first); (2) backfill via `UPDATE budgets SET owner_user_id = (SELECT owner_id FROM lists WHERE lists.id = budgets.list_id)`; (3) alter `owner_user_id` to `NOT NULL`; (4) create `budget_source_lists` (`budget_id` UUID FK `budgets.id` ON DELETE CASCADE, `list_id` UUID FK `lists.id` ON DELETE CASCADE, composite PK `(budget_id, list_id)`, index on `list_id`); (5) backfill: `INSERT INTO budget_source_lists (budget_id, list_id) SELECT id, list_id FROM budgets`; (6) drop `ix_budgets_list_id`, drop `budgets.list_id`; (7) drop `ix_budget_rules_list_id`, drop `budget_rules.list_id`. `downgrade()` reverses in opposite order — re-adds `budgets.list_id`/`budget_rules.list_id` nullable, backfills each from the *first* row of `budget_source_lists` per budget (document in a comment: lossy for a budget with >1 source list, matches AD-30's "documented lossy-downgrade limitation"), drops `budget_source_lists`, drops `owner_user_id`.
  - [x] `api/adapters/persistence/models.py`: `BudgetModel` gains `owner_user_id` (FK `users.id`, CASCADE, indexed, not nullable), loses `list_id`. New `BudgetSourceListModel` (`__tablename__ = "budget_source_lists"`, composite PK). `BudgetRuleModel` loses `list_id`.
  - [x] Migration verification: apply against a fixture with an existing Story-6.3-shaped budget (single `list_id`, with rules referencing that same `list_id`) inside the running Compose Postgres; confirm `budget_source_lists` has exactly one row per pre-existing budget matching its old `list_id`, `owner_user_id` matches that list's `owner_id`, and `alembic downgrade 0033_budget_attribution` / `upgrade head` round-trips cleanly.

- [x] **Task 2 — Domain: source-list validation** (AC #4)
  - [x] `api/domain/budgets.py`: add `validate_budget_source_list_ids(raw: list[UUID]) -> tuple[UUID, ...]` — dedupes (preserve first-seen order) then raises a new `InvalidBudgetSourceListsError` if the deduped result is empty. Pure, no repo access — membership checking is an application-layer concern (Task 3), this function only enforces cardinality/shape.
  - [x] `api/domain/errors.py`: add `InvalidBudgetSourceListsError(DomainError)` near the other `InvalidBudget*` errors — `MESSAGE = "Select at least one source list."`, `CODE = "invalid_budget_source_lists"`.
  - [x] Unit tests in `api/tests/test_budgets_domain.py`: empty list rejected, single id accepted, duplicate ids deduped to one, order-preserving dedupe on 3+ ids with a repeat in the middle. Existing name/cap/currency/near-cap tests in this file are unaffected — do not touch them.

- [x] **Task 3 — Application: owner-scoped services + multi-list spend** (AC #1, #2, #4, #5)
  - [x] `api/application/budgets.py`: `BudgetRecord` drops `list_id`, gains `owner_user_id: UUID` and `source_list_ids: tuple[UUID, ...]`. `BudgetRuleRecord` drops `list_id`. `CreateBudgetCommand` drops `list_id`, gains `source_list_ids: list[UUID]`. Every other command (`ListBudgetsCommand`, `GetBudgetDetailCommand`, `AssignEntryToBudgetCommand`, `UnassignEntryFromBudgetCommand`, `ListBudgetCandidatesCommand`, `CreateBudgetRuleCommand`, `DeleteBudgetRuleCommand`) drops its `list_id` field — a budget is now identified by `budget_id` alone, scoped by `owner_user_id`.
  - [x] New `BudgetRepository` Protocol methods: `create_budget(*, budget_id, owner_user_id, name, cap_amount, currency, source_list_ids) -> BudgetRecord`; `list_budgets_for_owner(owner_user_id) -> list[BudgetRecord]`; `get_budget(budget_id, owner_user_id) -> BudgetRecord | None` (owner-scoped, mirrors the old `(budget_id, list_id)` scoping shape — same reasoning: a budget belonging to a different owner must 404 exactly like a nonexistent one). Drop `list_budgets_for_list`. `list_ledger_entries(list_id)` keeps its existing single-list signature (reused as a building block); add `list_ledger_entries_for_lists(list_ids: list[UUID]) -> list[LedgerEntryRecord]` — no new repo query needed if implemented as a loop calling `list_ledger_entries` per id and concatenating (this is a read-time convenience helper, not a hot path). `create_rule(rule_id, budget_id, match_text)` drops `list_id`.
  - [x] Replace every `AuthorizeListAccessService(...).execute(...)` call in this module with a plain owner check: `budget = repo.get_budget(command.budget_id, command.actor_user_id); if budget is None: raise BudgetNotFoundError()`. There is **no** 403 path for budget-scoped operations — AC #2 says a non-owner "cannot see or discover," so every denial (read or write) is `BudgetNotFoundError` (404), never `NotListMemberError`. This is a deliberate divergence from the list-ACL module's hidden-as-404-for-reads/deny-as-403-for-writes split (AD-19) — budgets are not list-membership objects, there is nothing to "deny," only to hide. Do not import `AuthorizeListAccessService`/`ListAccessLookup` into this module's create/list/get/assign/unassign/candidates/rule services any more (they stay only for the one membership check in Task below).
  - [x] `CreateBudgetService.execute`: validate name/cap/currency unchanged; validate `source_list_ids = validate_budget_source_list_ids(command.source_list_ids)` (Task 2); for each id in that tuple, check the caller's membership via `ListAccessLookup.get_membership(list_id, actor_user_id)` (inject `ListAccessLookup` into this one service's constructor, same as before) — `None` membership → raise `NotListMemberError()` (AC #5, one bad id fails the whole create, no partial creation). Then `repo.create_budget(...)`.
  - [x] `ListBudgetsService.execute(command: ListBudgetsCommand)`: no ACL call at all (there is no `list_id` to check — every signed-in user can list *their own* budgets by construction, since the repo query is `WHERE owner_user_id = :actor_user_id`). `records = repo.list_budgets_for_owner(command.actor_user_id)`. For near-cap state per AC #1, replace the old `entries = repo.list_ledger_entries(list_id)` pre-fetch with per-budget `entries = repo.list_ledger_entries_for_lists(record.source_list_ids)` (a shared pre-fetch across all budgets isn't possible any more since each budget can have a different source-list set — accept the N-query cost here, same "read-time computation, not a hot path" reasoning Story 6.5 already established for this module).
  - [x] `_compute_spent_and_history` (shared helper): change its `list_id: UUID` parameter to `source_list_ids: tuple[UUID, ...]`; its `entries` fetch becomes `repo.list_ledger_entries_for_lists(source_list_ids)` when not pre-supplied. `compute_attributed_entries`/`compute_budget_spent` in `domain/budget_attribution.py` need **no changes** — they already operate on a flat `list[HasAttributionFields]` regardless of which list(s) it came from.
  - [x] `GetBudgetDetailService`, `AssignEntryToBudgetService`, `UnassignEntryFromBudgetService`, `ListBudgetCandidatesService`, `CreateBudgetRuleService`, `DeleteBudgetRuleService`: update to the owner-scoped `get_budget(budget_id, actor_user_id)` lookup and drop their now-nonexistent `list_id` plumbing so the module compiles against the Task 1 schema (these services back Story 7.2/7.3's UI, not this story's — no new UI wires to them here, but they must not reference the dropped `budget_rules.list_id`/`budgets.list_id` columns). `AssignEntryToBudgetService`/`ListBudgetCandidatesService` need entries from across all of the budget's `source_list_ids`, not one list — same `list_ledger_entries_for_lists` helper. `entry.line_id`/ledger-entry lookups (`get_ledger_entry(entry_id, list_id)`) become "does this entry belong to any of the budget's source lists" — loop the id set or add a repo method that checks membership across a list-id set; either is acceptable, note the choice in Completion Notes.

- [x] **Task 4 — Persistence: `SqlAlchemyBudgetRepository`** (AC #1, #3)
  - [x] `api/adapters/persistence/budgets.py`: `create_budget` inserts one `BudgetModel` row plus one `BudgetSourceListModel` row per `source_list_ids` entry, all in the same flush. `list_budgets_for_owner(owner_user_id)`: `SELECT * FROM budgets WHERE owner_user_id = :id ORDER BY created_at ASC, id ASC` (same ordering convention as the old `list_budgets_for_list`); eager-load or separately query each budget's `budget_source_lists` rows to populate `BudgetRecord.source_list_ids` (avoid N+1 by fetching all matching `budget_source_lists` rows for the owner's budget-id set in one query, then grouping in Python). `get_budget(budget_id, owner_user_id)`: `WHERE id = :budget_id AND owner_user_id = :owner_user_id` (mirrors the old scoped-fetch shape exactly — same reasoning as the removed `(budget_id, list_id)` version). `list_ledger_entries_for_lists`: loop `list_ledger_entries` per id (Task 3 already scoped this as acceptable) — do not write a new cross-list SQL query for this story; that optimization is explicitly out of scope (flag as a Story 7.2 candidate in Completion Notes, don't build it now).
  - [x] `create_rule` drops its `list_id` argument and column write.

- [x] **Task 5 — API: `/budgets` routes replace `/lists/{list_id}/budgets/...`** (AC #1, #2, #4, #5)
  - [x] New `api/api/routes/budgets.py` router: `router = APIRouter(prefix="/budgets", tags=["budgets"])`. Routes: `GET /budgets` (list caller's own), `POST /budgets` (create), `GET /budgets/{budget_id}`, `POST /budgets/{budget_id}/assignments`, `DELETE /budgets/{budget_id}/assignments/{entry_id}`, `GET /budgets/{budget_id}/candidates`, `POST /budgets/{budget_id}/rules`, `DELETE /budgets/{budget_id}/rules/{rule_id}` — same route *shapes* as before, minus the `/lists/{list_id}` prefix. Every handler drops its `list_id` path param. `_budget_response`/`_budget_detail_response` drop `list_id` from the payload, add `source_lists: list[UUID]` (Task 6 schema). Every `except ListNotFoundError` / `except NotListMemberError` branch tied to the *budget-scoping* check is removed — replaced by a single `except BudgetNotFoundError: return _budget_not_found()` per handler (AC #2: no distinct forbidden path). `create_budget`'s `except NotListMemberError` **stays** (Task 3's per-source-list membership check still raises it — that's the one place `not_list_member` 403 still applies in this module) and add `except InvalidBudgetSourceListsError` → 422 `invalid_budget_source_lists`.
  - [x] Register the new router in place of the old one in `api/api/app.py` (mount point confirmed via `grep -rn budgets.router api`); remove the old `/lists/{list_id}/budgets` router entirely (it is fully superseded — the underlying `list_id` column is gone, it cannot keep functioning).

- [x] **Task 6 — Schemas** (AC #1, #4)
  - [x] `api/api/schemas/budgets.py`: `CreateBudgetBody` drops nothing, gains `source_list_ids: list[UUID]` (`Field(min_length=1)` is fine as a shape hint, but the domain error is still the source of truth per AC #4/#6 — same "schema constraint is a hint, domain validation is authoritative" tension already accepted for `CreateBudgetRuleBody.match_text` in Story 6.5, don't over-fix it here). `BudgetResponse`/`BudgetDetailResponse` drop `list_id`, add `source_lists: list[UUID]`.

- [x] **Task 7 — UI: standalone `/budgets` list + create page** (AC #1)
  - [x] Move `ui/app/lists/[listId]/budgets/BudgetsPanel.tsx`, `BudgetsCreateForm.tsx`, `budgetsClient.ts` to a new `ui/app/budgets/` route directory (top-level, not nested under `[listId]`). `budgetsClient.ts`: `fetchBudgets()`/`createBudget()` drop the `listId` param, call `/api/budgets` (new BFF route, Task 8). `BudgetItem` type drops `list_id`, gains `source_list_ids: string[]`. `BudgetsCreateForm` gains a source-list multi-select — fetch the caller's lists via the **existing** `fetchLists` (`ui/app/lists/listsClient.ts`, hits `/api/lists` → `GET /lists`, already returns every list the caller belongs to) and render one checkbox per list (no reusable multi-select primitive exists in this codebase — `components/soft-ledger/Select.tsx` is single-value; build a plain checkbox list scoped to this form, do not generalize it into a new shared primitive this story doesn't need). Submit disabled until ≥1 list is checked (mirrors the existing name/cap non-empty gate).
  - [x] Budget tiles in the list view are **not** links in this story — Story 6.3's tile linked to `/lists/{listId}/budgets/{budgetId}`, but that detail route doesn't exist yet at the new `/budgets/{budgetId}` path until Story 7.2 builds it. Render the tile as a static `<div>` (same layout/near-cap dot), not a `<Link>`, to avoid a dead link. Revisit in 7.2.
  - [x] `ui/app/budgets/page.tsx`: server component, same auth/redirect shape as `ui/app/home/page.tsx` (`fetchSession` → redirect to `/sign-in?returnTo=/budgets` if absent; `requireAlias("/budgets")`), renders `<BudgetsPanel />` with no `listId` prop.
  - [x] Primary-nav entry: **resolved by user direction after the initial judgment call was flagged at story close** (originally: TabBar's fixed 3-slot bottom bar had no spare slot, so the entry point went on the home page instead; the user then asked for a `Budgets` icon in TabBar itself, with TabBar made dynamic to fit future tabs). `components/soft-ledger/TabBar.tsx` reworked from fixed `homeHref`/`uploadHref`/`accountHref`/`*Label` props to a generic `items: TabBarItem[]` prop (`{ key, href, label, Icon }`) rendered via `.map` — a new tab is one array entry, not a new prop pair + hardcoded `<Link>`. `components/AppShell.tsx` builds the 4-item array (home/upload/budgets/account) using the existing `budgetsEntryLabel` i18n key (`lib/i18n/lists.ts:128,290`, unused since Story 6.3) and the existing `WalletIcon` (`app/icons/WalletIcon.tsx`). `lib/appChrome.ts` gains `/budgets` in `APP_CHROME_PREFIXES` and a `"budgets"` case in `tabKeyFromPath`.
  - [x] `ui/lib/i18n/lists.ts`: add `budgetsSourceListsLabel` (en: "Source lists", es: "Listas de origen") and `errorInvalidBudgetSourceLists` (en: "Select at least one source list.", es: "Selecciona al menos una lista de origen.") to both locale blocks, alongside the existing `budgets*` keys (`lists.ts:128-156` en / `:290-...` es).

- [x] **Task 8 — UI BFF routes**
  - [x] New `ui/app/api/budgets/route.ts` (`GET`/`POST`, mirrors `ui/app/api/lists/[listId]/budgets/route.ts`'s cookie-forwarding shape exactly, minus the `listId` param, proxying to `${getApiInternalUrl()}/budgets`). Delete `ui/app/api/lists/[listId]/budgets/route.ts` and its `[budgetId]/...` siblings (`assignments`, `candidates`, `rules` subroutes) — they proxy to routes that no longer exist after Task 5. If Story 7.2/7.3's detail-page BFF routes are wanted ahead of time, that's their call, not this story's — do not build `ui/app/api/budgets/[budgetId]/...` here beyond what's needed to compile (none is needed; the create/list page never calls a detail route).

- [x] **Task 9 — Retire the old list-nested UI**
  - [x] Delete `ui/app/lists/[listId]/budgets/[budgetId]/` (detail page, `BudgetAssignPanel.tsx`, `BudgetRulesPanel.tsx`, `UnassignButton.tsx`, `budgetDetailClient.ts`, tests) — its backend contract (`/lists/{listId}/budgets/{budgetId}/...`) no longer exists after Task 5, and Epic 6's budget UI is explicitly superseded by Epic 7 (epics.md Stories 6.3-6.5 superseded-notes). Do not leave it in place broken. Story 7.2 rebuilds the detail page fresh under `/budgets/{budgetId}`.
  - [x] Remove any list-detail-page reference to the old embedded `BudgetsPanel` (check `ui/app/lists/[listId]/page.tsx` / `ListDetailChrome.tsx` for an import — Story 6.3/6.1 wired it in as a solo-list tab; that embed is what's moving out).

- [x] **Task 10 — Clean up the now-dead `read_budgets`/`write_budgets` ACL actions**
  - [x] `api/domain/list_access.py`: remove `"read_budgets"`/`"write_budgets"` from `ListAccessAction`, `_MEMBER_READ_ACTIONS`, `_MEMBER_MUTATION_ACTIONS`. These existed solely for the list-scoped budgets ACL this story removes; nothing else in the codebase uses them (grep to confirm before removing — if anything else references them, leave them and note why in Completion Notes instead of guessing).

## Dev Notes

**Central architectural challenge — one migration, whole-module rewrite.** AD-30's migration (0034) drops `budget_rules.list_id` in the same revision that drops `budgets.list_id` and adds `owner_user_id`/`budget_source_lists`, even though this story's *acceptance criteria* only cover list+create. That single migration makes the entire `application/budgets.py` module (which includes 6.5's assign/candidates/rules services) uncompilable in its current shape the moment 0034 lands — every method in the module still takes a `list_id` parameter. This story therefore updates the **whole module's plumbing** (domain, application, persistence, routes, schemas — Tasks 3-6) to the new owner+source-lists shape, not just the create/list surface, so the codebase stays internally consistent and 7.2/7.3 can build UI on top of already-correct services rather than inheriting broken ones. Only the **UI** stays scoped to list+create (Task 7) — the detail page's UI is explicitly Story 7.2's job, not rebuilt here.

**ACL model is new to this codebase.** Every prior ACL surface (`AuthorizeListAccessService`) scopes by list membership with a read=404/write=403 split (AD-19). Budgets under AD-30 are owner-only with **no split at all** — AC #2 says a non-owner "cannot see or discover," so both reads and writes 404 identically (`BudgetNotFoundError`). The only remaining 403 in this module is `NotListMemberError` on *create*, when a caller names a source list they don't belong to (AC #5) — that's list-membership ACL on the source-list references, not on the budget itself, and reuses the existing `ListAccessLookup`/`NotListMemberError` machinery unchanged.

**Reuse `GET /lists` for the source-list picker — do not build a new endpoint.** `GET /lists` (`api/api/routes/lists.py:313` `list_memberships`) already returns every list the caller belongs to, solo or shared; the UI already has a client helper (`ui/app/lists/listsClient.ts` `fetchLists`) and BFF route (`ui/app/api/lists/route.ts`) for it. The create form's multi-select just calls this.

**6.5's deferred cross-budget double-counting bug is relevant context, not this story's problem to fix.** Story 6.5's review found that an unassigned line matching rules on two different budgets double-counts into both budgets' `spent`, and that unassigning a line still matching its own budget's rule is immediately re-captured — both were explicitly deferred *because* "a planned budgets-per-user redesign... a line may legitimately count toward multiple budgets" (i.e., this epic) changes the invariant they were judged against. This story's AC #1 near-cap computation inherits that same `compute_attributed_entries` behavior unchanged (Task 3 above) — it is not asked to fix cross-budget double-counting, and doing so here would be scope creep into 7.3's territory (which explicitly owns "cross-list attribution... rule-matched lines"). Leave a note in Completion Notes that this is still open, for 7.3's author.

**Primary-nav placement — resolved.** The story's initial judgment call (home-page entry point, TabBar left untouched) was flagged to the user at story close per Dev Notes below. The user asked for a `Budgets` icon inside TabBar itself, with TabBar reworked to be dynamic so future tabs don't require another hardcoded prop/`<Link>` pair. Implemented as a 4th TabBar item (home/upload/budgets/account) — see Task 7 above.

### Project Structure Notes

- New API module surface: `api/api/routes/budgets.py` moves from `/lists/{list_id}/budgets` prefix to `/budgets` — a routing-layer relocation, not a new module.
- New UI route: `ui/app/budgets/` (top-level, sibling to `ui/app/home/`, `ui/app/cards/`, `ui/app/account/`) — first top-level feature route added since `ui/app/cards/`.
- No FX/currency behavior changes — `SUPPORTED_BUDGET_CURRENCIES`, `validate_budget_cap`, `classify_budget_state`, `NEAR_CAP_RATIO` are all untouched by this story.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 7.1` lines 1994-2016] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-01.md`] — full rationale, AD-30 design decisions, migration plan, PRD/UX wording changes
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-30, line 247] — owner-only ACL, `budget_source_lists` shape, `budget_rules.list_id` drop, "v1 does not implement this AD"
- [Source: same file, AD-29 line 245] — "Budget ownership/scope model: see AD-30" (AD-29 keeps only the membership-count chrome rule now)
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` FR-48/FR-49/FR-50, amended 2026-09-01]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` lines 29, 41, 78] — standalone `/budgets` surface, owner-only, IA placement
- [Source: `_bmad-output/implementation-artifacts/6-5-budget-attribution-manual-and-rules.md` Review Findings] — the deferred double-counting/re-capture bugs this story's Dev Notes flag as 7.3's problem
- [Source: `_bmad-output/implementation-artifacts/6-3-budget-list.md`, `6-4-budget-detail.md`] — the module this story supersedes in place; `budgetsEntryLabel` key origin
- [Source: `api/domain/budgets.py`, `api/domain/budget_attribution.py`, `api/application/budgets.py`, `api/adapters/persistence/budgets.py`, `api/adapters/persistence/models.py:498-545`, `api/api/schemas/budgets.py`, `api/api/routes/budgets.py`] — exact current shape this story rewrites; `BUDGET_ASSIGNABLE_LINE_TYPES`, `compute_attributed_entries`/`compute_budget_spent` are reused unchanged
- [Source: `api/adapters/persistence/migrations/versions/0032_budgets.py`, `0033_budget_attribution.py`] — the two migrations 0034 builds on and partially reverses
- [Source: `api/application/list_access.py`, `api/domain/list_access.py`] — the list-membership ACL pattern this story's owner-only model deliberately diverges from; `read_budgets`/`write_budgets` actions this story retires
- [Source: `api/api/routes/lists.py:313` `list_memberships`, `ui/app/lists/listsClient.ts` `fetchLists`, `ui/app/api/lists/route.ts`] — reused as-is for the source-list picker, no new endpoint
- [Source: `ui/app/home/page.tsx`] — auth/redirect/alias-gate pattern `ui/app/budgets/page.tsx` follows
- [Source: `ui/app/lists/[listId]/budgets/BudgetsPanel.tsx`, `BudgetsCreateForm.tsx`, `budgetsClient.ts`] — the exact files this story relocates and adapts
- [Source: `ui/lib/i18n/lists.ts:128-156` (en), `:290-` (es)] — existing `budgets*` keys this story extends; `budgetsEntryLabel` (unused since 6.3) repurposed for the home-page nav entry
- [Source: `_bmad-output/project-context.md`] — money-as-Decimal/string-at-wire-boundary; i18n per-domain TS message object convention; hidden-as-404/mutation-as-403 ACL split (this story documents its deliberate divergence from that split)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Migration 0034 verified against a hand-seeded Story-6.3-shaped fixture (single user/list/budget/rule) inside the running worktree Compose Postgres: `upgrade head` produced one `budget_source_lists` row matching the old `list_id`, `owner_user_id` matched the list's `owner_id`; `downgrade 0033_budget_attribution` → `upgrade head` round-tripped cleanly. Fixture rows deleted after verification.
- Full `api` pytest suite (937 tests) and `ui` vitest suite (598 tests, 77 files) green; `ruff check .` and `npm run typecheck`/`npm run lint` clean — re-verified after the TabBar rework.
- Manual smoke via the running worktree UI container (hot-reload bind mount): `GET /home` and `GET /budgets` both 307-redirect cleanly to sign-in when unauthenticated, no server errors in `docker compose logs ui`. Did not sign in as one of the dev-seeded personal accounts to avoid touching real-looking seeded data; component-level TabBar/AppShell behavior (4 items, aria-current, active-tab highlighting) is covered by the updated vitest suite instead.
- Root-caused a stuck `db` health status mid-story: base `docker-compose.yml` uses a 1h healthcheck interval (operator-friendly for prod); a worktree stack needs the `docker-compose.worktree.yml` overlay's 5s interval. An earlier `docker compose run` (test overlay only, no worktree overlay) recreated `db` without that overlay, leaving it in "starting" for up to an hour and blocking anything with `depends_on: service_healthy`. Fixed by re-running `up -d` with the full `-f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml` stack (no data loss — Postgres data is bind-mounted outside the repo).

### Completion Notes List

- Full-module rewrite per Dev Notes: domain/application/persistence/routes/schemas all moved to the owner+source-lists shape (not just create/list), so 6.5's assign/candidates/rules services stay compilable against the Task 1 schema. Only the UI stayed scoped to list+create, per the story.
- `AssignEntryToBudgetService`/`UnassignEntryFromBudgetService`/`ListBudgetCandidatesService` resolve "does this entry belong to any of the budget's source lists" by looping `get_ledger_entry(entry_id, list_id)` per source list id until found (`_find_entry_in_source_lists` in `application/budgets.py`) — the simpler of the two acceptable options the story named; no new repo method added.
- `list_ledger_entries_for_lists` is a Python-side loop over the existing single-list query, concatenated — explicitly not a new cross-list SQL query this story. Flagging as a Story 7.2 candidate if the N-query cost on `ListBudgetsService`/detail/candidates ever becomes a measured problem.
- 6.5's deferred cross-budget double-counting / re-capture-on-unassign bug is untouched by this story, as directed — still open, still 7.3's problem.
- Found and fixed a schema/domain conflict during integration testing: `CreateBudgetBody.source_list_ids` initially carried `Field(min_length=1)` per the task's literal wording, but that let Pydantic intercept an empty list before domain validation ran, so the response never carried the `invalid_budget_source_lists` code AC #4 requires. Removed the length constraint — the field is now a bare `list[UUID]`, and `validate_budget_source_list_ids` is the sole source of truth for the empty case, consistent with `CreateBudgetRuleBody.match_text` having no schema-level constraint either.
- Found and fixed a stale pre-existing test fixture: `test_assign_returns_404_ledger_entry_not_found_for_non_included_line_type` seeded a `line_type="payment"` entry to represent a "non-assignable" line, but baseline commit `f704a3a` (immediately before this story) had already widened `BUDGET_ASSIGNABLE_LINE_TYPES` to include `payment`. Changed the fixture to `line_type="fee"` (genuinely outside the assignable set) — not a regression introduced by this story, but the full-suite run surfaced it and it lives in the file this story rewrote anyway.
- TabBar nav placement: initially left `TabBar` untouched (3 fixed icons, no spare slot) and added a home-page entry point instead, flagging the tradeoff at story close per Dev Notes. The user then asked for the Budgets icon inside TabBar, with TabBar made dynamic to fit more tabs later. Reworked `TabBar` from fixed `homeHref`/`uploadHref`/`accountHref` + `*Label` props to a generic `items: TabBarItem[]` prop (`{ key, href, label, Icon }`); `AppShell` now builds a 4-item array (home/upload/budgets/account) using the existing `budgetsEntryLabel` i18n key and `WalletIcon`. `lib/appChrome.ts` recognizes `/budgets` for chrome visibility and active-tab highlighting. The home-page header-link approach was reverted (`ui/app/home/page.tsx` is back to its pre-story state).
- Budget tiles on `/budgets` render as static `<div>`s, not links — the detail route doesn't exist until Story 7.2.

### File List

**Added:**
- `api/adapters/persistence/migrations/versions/0035_budgets_standalone_entity.py`
- `ui/app/budgets/BudgetsCreateForm.tsx`
- `ui/app/budgets/BudgetsCreateForm.test.tsx`
- `ui/app/budgets/BudgetsPanel.tsx`
- `ui/app/budgets/budgetsClient.ts`
- `ui/app/budgets/budgetsClient.test.ts`
- `ui/app/budgets/page.tsx`
- `ui/app/api/budgets/route.ts`

**Modified:**
- `api/adapters/persistence/models.py`
- `api/adapters/persistence/budgets.py`
- `api/application/budgets.py`
- `api/domain/budgets.py`
- `api/domain/errors.py`
- `api/domain/list_access.py`
- `api/api/routes/budgets.py`
- `api/api/schemas/budgets.py`
- `api/tests/test_budgets_domain.py`
- `api/tests/test_budgets_integration.py`
- `ui/app/lists/[listId]/page.tsx`
- `ui/app/lists/listsClient.test.ts`
- `ui/lib/i18n/lists.ts`
- `ui/components/soft-ledger/TabBar.tsx`
- `ui/components/soft-ledger/soft-ledger.test.tsx`
- `ui/components/AppShell.tsx`
- `ui/lib/appChrome.ts`
- `ui/lib/appChrome.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

`ui/app/home/page.tsx` was touched then reverted to its pre-story state (no net diff) once the nav entry moved into `TabBar`.

**Deleted:**
- `ui/app/lists/[listId]/budgets/` (whole directory — `BudgetsPanel.tsx`, `BudgetsCreateForm.tsx`, `budgetsClient.ts`, `budgetsClient.test.ts`, and `[budgetId]/` detail page + `BudgetAssignPanel.tsx`, `BudgetRulesPanel.tsx`, `UnassignButton.tsx`, `budgetDetailClient.ts`, `page.tsx`, `page.budgetDetail.test.ts`)
- `ui/app/api/lists/[listId]/budgets/` (whole directory — list-nested BFF routes and their tests, all subroutes)
