---
baseline_commit: b4a9aaf
---

# Story 5.7: Wire incomplete-balance disclosure on strip

Status: done

## Story

As a list member,
I want the Soft-Ledger settle strip to disclose when unresolved same-price conflicts affect the period,
So that I never trust a confident total that silently omits unresolved purchases (J7).

## Acceptance Criteria

1. **Given** unresolved same-price conflicts (Story 5.5) affect the current period on a list
   **When** I view shared-expenses
   **Then** balances disclose that they are incomplete — the UI does not present a confident settle-up total that silently omits unresolved purchases (FR-43, NFR-6)
   **And** incomplete lights iff domain reports unresolved same-price conflicts intersecting the viewed period — UI reads that signal only; no decorative incomplete
   **And** disclosure uses the Epic 3 pattern slot: calm/muted below the island strip (same inset), not over the hero amount (UX-DR8, Story 3.6)
   **And** disclosure includes a calm path to resolve (link/action to conflict review) — not a dead hint and not color-only (UX-DR19)

2. **Given** incomplete disclosure is shown
   **When** assistive tech reads the surface
   **Then** incompleteness is announced — not color-only (UX-DR19)
   **And** EN/ES copy is localized (UX-DR18)

3. **Given** no unresolved same-price conflicts affect the period
   **When** I view the strip
   **Then** no incomplete disclosure appears (honest empty — same as Story 3.6) — a dismissed statement (Story 5.2) is not "incomplete," it was simply never imported

4. **Given** an unresolved conflict exists on a statement outside the currently selected cycle/period
   **When** I view Soft-Ledger for the selected period
   **Then** incomplete disclosure does not light solely because of other cycles — only unresolved conflicts that affect the viewed period flag incompleteness

5. **Given** I resolve remaining same-price conflicts (Story 5.5)
   **When** the period is complete again
   **Then** the incomplete disclosure clears and the strip returns to a confident settle figure

**Deferral (2026-08-26):** This disclosure is for the **shared** settle strip. Solo lists do not use this strip after Epic 6.

**Out of scope for this story (explicitly deferred):**
- Statement-cycle/period selector (Story 5.9) — there is **no period filter anywhere in this codebase yet** (`/lists/{id}/balances` and `/lists/{id}/expenses` are whole-list, unfiltered). "The viewed period" (AC #4) is therefore the *entire list* today — every unresolved conflict touching the list counts, because there is no narrower period to exclude. AC #4's "outside the selected cycle" exclusion is satisfied vacuously until Story 5.9 adds a real period boundary; do not build a period selector or date-range param to manufacture a test for this AC.
- Any change to `same_price_conflicts` detection, resolution, or the `/upload/conflicts` review UI (Story 5.5/5.6 own that; reuse unchanged).
- Quarantine — retired (AD-17); FR-43 sources solely from unresolved same-price conflicts.

## Tasks / Subtasks

- [x] **Task 1 — Application: list-scoped incomplete signal** (AC: 1, 3, 4)
  - [x] `api/application/same_price_conflicts.py`: add `ListSamePriceConflictQueueService.execute` is *actor*-scoped (`list_unresolved_conflicts(actor_user_id)`), not list-scoped — do not repurpose it. Instead add a small pure helper (or inline filter) that narrows an already-fetched `list[SamePriceConflictRecord]` down to ones touching a given `list_id`: `record.manual.list_id == list_id or record.parsed.list_id == list_id`. Prefer a plain function over a new repo method — `SamePriceConflictRecord.manual.list_id`/`.parsed.list_id` are already present on every record returned by `list_unresolved_conflicts`, so no new persistence query or migration is needed.
  - [x] Extend `api/application/lists.py`'s `GetListBalancesStubService.execute` (or a thin new service composed alongside it — either is fine, keep the balances read path as one call from the route) to also report `is_incomplete: bool` for the list: fetch `actor`'s unresolved conflicts via the existing `SamePriceConflictRepository.list_unresolved_conflicts(actor_user_id)` (inject as a new constructor param, `NullSamePriceConflictRepository()` default — same defaulting pattern Story 5.6 used for `ResolveSamePriceConflictService.__init__`, so the ~pre-existing `GetListBalancesStubService` test call sites keep compiling), filter to this list per the helper above, `is_incomplete = len(filtered) > 0`.
  - [x] `ListBalancesStub` (dataclass, `api/application/lists.py`) gains `is_incomplete: bool`.
  - [x] Honest-empty (AC #3): a list with zero unresolved conflicts touching it → `is_incomplete=False`. Do not special-case "no expenses yet" — an empty list is also honestly complete.
  - [x] Do not touch `same_price_conflicts` detection/resolution, the `/import-conflicts` routes, or Story 5.5/5.6 domain code — this task only *reads* the existing signal.

- [x] **Task 2 — API: expose `balance_status` on `/lists/{list_id}/balances`** (AC: 1, 3)
  - [x] `api/api/schemas/lists.py`: add `BalanceStatusResponse { is_incomplete: bool }` and add `balance_status: BalanceStatusResponse` to `ListBalancesStubResponse` (alongside existing `list_id`/`balance_crc` — do not create a second endpoint; Story 3.6's own dev notes already anticipated this exact shape under a `balanceStatus` key).
  - [x] `api/api/routes/lists.py`, `get_list_balances_stub`: construct `SqlAlchemySamePriceConflictRepository(db)` and pass it into the balances service; map `result.is_incomplete` → `BalanceStatusResponse(is_incomplete=...)`.
  - [x] No change to `AuthorizeListAccessService`/the `read_balances` action — incomplete-ness is derived data on the balances read, not a new ACL surface (AD-19 unaffected, same as Story 5.6's alias-write reasoning for "no new ACL surface").
  - [x] Keep the response backward-compatible in shape: `balance_crc` stays a top-level string field (existing UI parsing, `asBalances` in `page.tsx`, must not break) — `balance_status` is additive.

- [x] **Task 3 — UI: wire real data + resolve link into `IncompleteDisclosure`** (AC: 1, 2, 3, 4, 5)
  - [x] `ui/app/lists/[listId]/page.tsx`:
    - Extend `BalancesPayload`/`asBalances` to parse `balance_status: { is_incomplete: boolean }` (default `is_incomplete: false` if the field is absent/malformed — never fabricate `true` on a parse miss, mirroring the existing `balanceCrc` defensive parsing right above it).
    - Replace the hardcoded `isIncomplete={false}` (currently at the `<IncompleteDisclosure>` call site, directly below `<BalanceStrip>`) with `isIncomplete={balances?.balance_status.is_incomplete === true}`.
    - Remove the now-stale `{/* Slot only (Story 3.6): no balanceStatus in the API yet; Epic 5.4 wires isIncomplete. */}` comment — this story is that wiring.
  - [x] **Resolve action — RSC boundary constraint:** `page.tsx` is an async Server Component (`cookies()`/`fetch`); `IncompleteDisclosure` currently has no `"use client"` directive and its `onResolve` prop is a plain callback (`() => void`), which **cannot** be passed as a prop from a Server Component — Next.js will reject a non-serializable function crossing that boundary. `IncompleteDisclosure` is otherwise unstyled/presentational (matches `BalanceStrip`'s RSC-safe pattern) and should stay that way rather than becoming a client component for one link. Change `IncompleteDisclosureProps`' `ResolveAction` union from `{ onResolve: () => void; resolveLabel: string }` to `{ resolveHref: string; resolveLabel: string }`, and render the resolve affordance as a real `<a href={resolveHref}>` (via `next/link`'s `<Link>`, already imported in `page.tsx` and used elsewhere in this file for `backToLists`) instead of a `<button onClick>`. This is strictly better for AC #1's "calm path to resolve" (works without JS, no client-boundary shim needed) and keeps the component server-renderable.
    - Update the co-located test file (`ui/components/soft-ledger/soft-ledger.test.tsx`) for the renamed prop and the `<a>`/`<Link>`-based render instead of asserting a `<button>`/click handler.
  - [x] Wire `resolveHref="/upload/conflicts"` (the existing Story 5.5/5.6 conflict-review page — it renders the actor's full unresolved queue across all their lists, not list-scoped by URL param; there is no `/upload/conflicts?listId=` filter today and adding one is out of scope) and `resolveLabel` from a new i18n key.
  - [x] `ui/lib/i18n/lists.ts`: add `incompleteDisclosureResolve` to both `en` and `es` in `listsMessages`, following the existing key style next to `incompleteDisclosureLabel` (line ~29/~132). Suggested EN: "Resolve incomplete". Suggested ES: a natural equivalent (e.g. "Resolver pendientes") — pick copy consistent with existing ES tone in this file rather than a literal translation.
  - [x] No changes to `BalanceStrip.tsx`, `Hint.tsx`, or the strip's own layout — this story only wires the already-slotted disclosure component (Story 3.6) and its immediate props/link.

- [x] **Task 4 — Tests** (AC: all)
  - [x] API integration (Postgres 16, not SQLite — same rule as every prior Epic 5 story): extend `api/tests/test_lists_integration.py`'s balances coverage (or add a new test module alongside `test_same_price_conflicts_application.py`) with:
    - No unresolved conflicts on the list → `balance_status.is_incomplete == false` (AC #3).
    - An unresolved conflict where the list is the **parsed** side → `is_incomplete == true`.
    - An unresolved conflict where the list is the **manual** side (AD-10 "related lists" — the manual entry can live on a different list than the parsed line) → `is_incomplete == true`.
    - Resolving the conflict (`POST /import-conflicts/{id}/resolve`, any of the three resolutions) → a subsequent `GET /lists/{id}/balances` shows `is_incomplete == false` again (AC #5).
    - A conflict unresolved on a **different, unrelated list** (no shared membership) does not flag `is_incomplete` on this list (AC #4's only enforceable form today, given no period selector exists — see Task 1).
    - Non-member read of `/lists/{id}/balances` still 404s (existing ACL test in `test_lists_integration.py`) — confirm this story doesn't regress it.
  - [x] UI unit: extend `page.balanceStrip.test.ts` or add a sibling pure-helper test (following that file's exact pattern — `describe`/`it` against an exported pure function, no RSC render) for the `asBalances`/`balance_status` parsing edge cases: field present `true`/`false`, field absent (defaults `false`, never fabricates `true`).
  - [x] UI component: `ui/components/soft-ledger/soft-ledger.test.tsx` — update the existing `IncompleteDisclosure` cases for the `resolveHref`/`<a>` API change (visibility true/false/undefined still applies unchanged); assert the anchor's `href` equals the passed `resolveHref` and no anchor renders when `resolveHref` is omitted.
  - [x] No fabricated conflict data outside integration tests — UI tests take `isIncomplete`/`resolveHref` as literal props only (mirrors Story 3.6 AC #3's own constraint, now satisfied by real wiring one layer down in the API tests).

### Review Findings

- [x] [Review][Patch] Test gap: AC #4's list-scoping guarantee is unverified for the same-actor, multi-list case [api/tests/test_lists_integration.py:348] — fixed: added `test_balances_conflict_on_one_of_actors_own_lists_does_not_flag_a_sibling_list` — `test_balances_conflict_on_unrelated_list_does_not_flag_this_list` only proves actor isolation (a different actor's conflict doesn't leak), which `list_unresolved_conflicts(actor_user_id)`'s own `EXISTS ListMembershipModel` scoping already guarantees. It would pass identically even if `conflicts_touching_list`'s per-`list_id` filtering were deleted entirely (i.e. `is_incomplete = len(unresolved) > 0` with no list-scoping at all). No test covers the scenario the diff's own filter code exists to guard: one actor who is a member of two lists, a conflict touching only one of them, and viewing the *other* (untouched) list of that same actor — the actual mechanism behind AC #4's "only unresolved conflicts that affect the viewed period flag incompleteness."

## Dev Notes

### Architecture compliance

| Rule | Apply |
|------|-------|
| AD-1 | `application/lists.py`/`application/same_price_conflicts.py` stay free of FastAPI/SQLAlchemy imports; the new filter helper is pure. |
| AD-10 | Reuse unchanged — this story only *reads* `list_unresolved_conflicts`, it does not touch match-window or resolution logic. "Related lists" already means manual and parsed entries can sit on different lists that share a member — both sides must be checked when deciding if a conflict "affects" a given list (Task 1). |
| AD-17 | Retired — do not resurrect a quarantine code path. FR-43's sole trigger is AD-10 unresolved same-price conflicts. |
| AD-19 | No new ACL surface — `balance_status` rides the existing `read_balances`-gated `/lists/{id}/balances` response. |
| AD-15 | Postgres 16 integration tests for the list-scoped incomplete signal (not SQLite) — same rule as every prior Epic 4/5 story. |

### UX

- Placement, styling, tokens, and a11y mechanics (`role="status"`, no color-only signal, calm/muted, Manrope meta typography, `--strip-inset`) are **already shipped** by Story 3.6 and Epic 3.5's Tailwind migration — do not re-derive them. This story changes only: (a) what boolean feeds `isIncomplete`, and (b) how the resolve affordance navigates (button→link, see Task 3).
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` `components.hint` and `EXPERIENCE.md` line ~290-292 are the same sources Story 3.6 already implemented against; nothing new to re-read there for this story.
- Copy for `incompleteDisclosureLabel` already exists (EN/ES) from Story 3.6 — only `incompleteDisclosureResolve` is new.

### Current component/API state (verified in this codebase, not from planning docs)

- `IncompleteDisclosure` (`ui/components/soft-ledger/IncompleteDisclosure.tsx`) already accepts `isIncomplete`/`label`/`onResolve`/`resolveLabel` and is wired into `page.tsx` directly below `<BalanceStrip>` with `isIncomplete={false}` **hardcoded** — that hardcoded line and its explanatory comment are exactly what this story replaces.
- No `IncompleteDisclosure.module.css`/`.module.scss` exists — Epic 3.5 migrated it to Tailwind utility classes + inline `style` for the CSS-var typography tokens. Do not add a new stylesheet.
- `/lists/{list_id}/balances` (`api/api/routes/lists.py:590-601`, `GetListBalancesStubService` in `api/application/lists.py:390-413`) currently returns only `{ list_id, balance_crc }` — `ListBalancesStubResponse` in `api/api/schemas/lists.py:130-133`. This is the exact endpoint/response Story 3.6's dev notes anticipated extending with a `balanceStatus` field; that anticipation is now due.
- `same_price_conflicts` repository already exposes everything needed: `SamePriceConflictRecord.manual.list_id` / `.parsed.list_id` (`api/application/same_price_conflicts.py:50-67`), and `list_unresolved_conflicts(actor_user_id)` already scopes to lists the actor is a member of via `EXISTS ListMembershipModel` (`api/adapters/persistence/same_price_conflicts.py:199-217`) — reuse verbatim, do not add a new list-scoped repo method.
- The conflict-resolution UI is `ui/app/upload/conflicts/page.tsx` + `ConflictReviewPanel.tsx`, backed by `GET/POST /import-conflicts` (`api/api/routes/import_conflicts.py`, prefix `/import-conflicts`) — this is the existing, unchanged link target for AC #1's "calm path to resolve."
- No period/statement-cycle selector exists anywhere in the codebase yet (`TemporalNavigation.tsx` is an unrelated desktop form-toggle component, not a date/cycle picker — do not confuse the two). `/lists/{id}/expenses` and `/lists/{id}/balances` are both whole-list, unfiltered reads. Story 5.9 is still `backlog`. See "Out of scope" above for how this resolves AC #4.

### Testing requirements

- Postgres 16 for all `same_price_conflicts`-adjacent integration coverage (Task 4) — not SQLite, per every prior Epic 4/5 story and `project-context.md`.
- Reuse Story 5.5/5.6's integration test setup patterns (synthetic ledger rows via repositories directly, no PDF fixtures needed) — this story needs no new PDF fixtures.
- Money/`Decimal` assertions unaffected — `is_incomplete` is a plain boolean, no new `Decimal` surface.

### Previous story intelligence (5.6)

- `ResolveSamePriceConflictService.__init__` already established the "new optional collaborator defaults to a Null object" pattern for adding a dependency to an existing service without breaking prior test call sites (`alias_repo: DescriptionAliasRepository | None = None`, defaults to `NullDescriptionAliasRepository()`). Apply the identical pattern to `GetListBalancesStubService.__init__` for its new `conflict_repo` param (default `NullSamePriceConflictRepository()`).
- Story 5.6 confirmed `SamePriceConflictRecord`'s `manual`/`parsed` snapshots remain valid to read *before* any resolve/delete happens — this story only reads unresolved (never-deleted) conflicts, so the cascade-delete-on-resolve gotcha from 5.6 (which affected `source_conflict_id`) does not apply here at all; nothing is deleted by this story's read path.
- 5.5/5.6 both used `docker compose -f docker-compose.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm --build api sh -c "alembic upgrade head && pytest -q ..."` in this worktree for Postgres-backed test runs — reuse the same invocation; no new migration is added by this story so `alembic upgrade head` should be a no-op beyond confirming the stack is current.

### Git intelligence

- `main` at `b4a9aaf` (merge of PR #91, Story 5.6) is the branch base. Recent history (`1b3ac16`, `15b3f3d`, `b3f4203`) is Story 5.6 landing cleanly — `description_aliases`/`same_price_conflicts` are exactly as documented above, no drift to account for.
- Current branch: `feat/5/5-7-wire-incomplete-balance-disclosure-on-strip`, already checked out from `main` @ `b4a9aaf`.

### Anti-patterns (do not)

- Do not add a new persistence query/table/migration for the incomplete signal — `list_unresolved_conflicts` + an in-memory filter on already-fetched records is sufficient at this data scale (a user's unresolved-conflict queue), and avoids duplicating AD-10's membership-scoping logic in a second place.
- Do not make `IncompleteDisclosure` a `"use client"` component just to keep a function-prop `onResolve` — switch to `resolveHref` (a plain string) instead; it is both simpler and keeps the component server-renderable like its `BalanceStrip` sibling.
- Do not build a period/date-range param on `/lists/{id}/balances` or `/upload/conflicts` to "properly" satisfy AC #4 — Story 5.9 owns period infrastructure; satisfy AC #4 today by scoping to *this list*, not by inventing period plumbing early.
- Do not resurrect quarantine (AD-17 retired) or reference `unresolvedQuarantineCount` from Story 3.6's speculative TODO comment — that comment predates the 2026-08-25 scope change; same-price conflicts are the sole source now.
- Do not add a `listId` filter query param to `/upload/conflicts` — out of scope; the resolve link goes to the actor's existing full queue view unchanged.

### Project context reference

Follow `_bmad-output/project-context.md`: money stays `Decimal`/string end-to-end (unaffected here — `is_incomplete` is boolean only); API wire stays snake_case (`balance_status`, `is_incomplete`), mapped at the UI edge in `page.tsx`; i18n via per-domain TS message objects (`listsMessages` in `ui/lib/i18n/lists.ts`), not JSON files; Alembic-only schema changes (none needed this story); disclosure calm/muted below strip, never over hero amount (UX-DR8, already shipped by 3.6); incomplete disclosure durable-signal rule — "incomplete lights iff domain reports unresolved same-price conflicts" (never decorative/UI-only heuristics).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.7` lines 1754-1786]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` FR-43 lines 767-776]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-10 line 150, AD-17 (retired) line 196, AD-19 line 222]
- [Source: `_bmad-output/implementation-artifacts/3-6-incomplete-disclosure-pattern-slot-only.md` — component API, Epic 5 wiring anticipation, `balanceStatus` shape]
- [Source: `_bmad-output/implementation-artifacts/5-6-alias-on-confirm-manual-entry-re-upload-conflict.md` — defaulted-collaborator pattern precedent]
- [Source: `api/application/same_price_conflicts.py` — `SamePriceConflictRecord`, `list_unresolved_conflicts`]
- [Source: `api/application/lists.py` — `GetListBalancesStubService`, `ListBalancesStub`]
- [Source: `api/api/routes/lists.py:590-601`, `api/api/schemas/lists.py:130-133`]
- [Source: `ui/app/lists/[listId]/page.tsx` — `asBalances`, `<IncompleteDisclosure>` call site]
- [Source: `ui/components/soft-ledger/IncompleteDisclosure.tsx`]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose -f docker-compose.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm api sh -c "alembic upgrade head && pytest -q"` → 809 passed
- `docker compose -f docker-compose.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm api sh -c "ruff check . && ruff format --check ."` → all clean
- `docker compose exec ui sh -c "npm run typecheck"` → clean
- `docker compose exec ui sh -c "npm run lint"` → clean (3 pre-existing warnings unrelated to this story)
- `docker compose exec ui sh -c "npx vitest run"` → 538 passed (69 files)

### Completion Notes List

- Added `conflicts_touching_list` pure helper in `application/same_price_conflicts.py` filtering an already-fetched unresolved-conflict list to ones touching a given `list_id` on either the manual or parsed side (AD-10 related-lists aware).
- `GetListBalancesStubService` gained an optional `conflict_repo: SamePriceConflictRepository | None = None` constructor param (defaults to `NullSamePriceConflictRepository()`, same pattern as `ResolveSamePriceConflictService`), and now derives `ListBalancesStub.is_incomplete` from the actor's unresolved conflicts filtered to the requested list.
- `/lists/{list_id}/balances` now returns an additive `balance_status: { is_incomplete }` field; `balance_crc` shape unchanged for backward compatibility.
- `IncompleteDisclosure` swapped its `onResolve: () => void` callback prop for a `resolveHref: string` prop, rendering a real `next/link` `<Link>` anchor instead of a `<button onClick>` — required because `page.tsx` is an async Server Component and cannot pass a non-serializable function prop across the RSC boundary; this also gives a working-without-JS resolve path per AC #1.
- `page.tsx` wires `isIncomplete` from the real `balance_status.is_incomplete` field (defensive parse: absent/malformed `balance_status` defaults to `false`, never fabricates `true`) and `resolveHref="/upload/conflicts"` with a new `incompleteDisclosureResolve` i18n key (EN/ES).
- Removed the Story 3.6 placeholder comment and hardcoded `isIncomplete={false}` at the call site — this story is the wiring that comment anticipated.
- Added 5 new Postgres integration tests in `test_lists_integration.py` covering: no-conflict honest-empty, parsed-side incomplete, manual-side incomplete on a related list, resolve-clears-incomplete (via `POST /import-conflicts/{id}/resolve`), and unrelated-list non-flagging; extended the existing member-stub test to assert the new field shape.
- Added `asBalances` parsing edge-case tests (exported the previously-private function) and updated `soft-ledger.test.tsx`'s `IncompleteDisclosure` cases for the `resolveHref`/anchor API.
- Full regression: 809 API tests, 538 UI tests, ruff, and `tsc --noEmit` all pass; no changes to `same_price_conflicts` detection/resolution, `/import-conflicts` routes, `BalanceStrip.tsx`, or `Hint.tsx`.

### File List

- `api/application/same_price_conflicts.py`
- `api/application/lists.py`
- `api/api/schemas/lists.py`
- `api/api/routes/lists.py`
- `api/tests/test_lists_integration.py`
- `ui/components/soft-ledger/IncompleteDisclosure.tsx`
- `ui/components/soft-ledger/soft-ledger.test.tsx`
- `ui/app/lists/[listId]/page.tsx`
- `ui/app/lists/[listId]/page.balanceStrip.test.ts`
- `ui/lib/i18n/lists.ts`

## Change Log

| Date | Change |
|------|--------|
| 2026-08-28 | Story created via create-story workflow. Ultimate context engine analysis completed - comprehensive developer guide created. |
| 2026-08-28 | Implemented Story 5.7: list-scoped incomplete signal (Task 1), `balance_status` on `/lists/{id}/balances` (Task 2), real data + resolve link wired into `IncompleteDisclosure` (Task 3), full test coverage (Task 4). 809 API + 538 UI tests pass. |
