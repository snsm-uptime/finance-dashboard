---
baseline_commit: 1c9185a
---

# Story 5.9: Statement-cycle period selector

Status: ready-for-dev

## Story

As a list member,
I want the shared-expenses period to align to statement/billing cycles, and to pick which cycle when cards differ,
So that settle-up matches the statement window I care about.

## Acceptance Criteria

1. **Given** shared-expenses for a list
   **When** the view loads
   **Then** the default period aligns to statement/billing cycles (FR-39)
   **And** when available, prefer the statement/cycle of the most recently imported card on that list; otherwise use the product default

2. **Given** cards on the list have different cycles
   **When** I open the period control
   **Then** I can select which statement/cycle to view (FR-39)
   **And** Soft-Ledger strip + receipts + incomplete disclosure recalculate for that period

3. **Given** a single-cycle list
   **When** I view shared-expenses
   **Then** no multi-cycle picker friction is required — default cycle is enough (no picker chrome renders)

4. **Given** a list with no cards or no cycle metadata
   **When** shared-expenses loads
   **Then** the view falls back to a sensible calendar period (e.g. current month, `America/Costa_Rica`) without blocking settle-up

5. **Given** EN/ES locale
   **When** cycle labels are shown
   **Then** chrome is localized; card labels remain free text (UX-DR18)

**Deferral (2026-08-26):** Cycle selection is **shared-expenses** in v1. Epic 6.2 reuses the same period for solo spend-by-origin.

**Out of scope for this story (explicitly deferred):**
- Any new `Card` billing-cycle metadata (cycle day, cycle length, due date) — none exists today and this story does not add it (see Dev Notes — "Zero cycle infrastructure exists today").
- Any new persisted statement date/period column on `import_statements` — this story derives cycles from already-committed `ledger_entries` (grouped by `statement_id`), not from new schema.
- Touching `compute_canonical_identity` / dedup identity in any way — AD-18 was explicitly amended (2026-08-23) to *remove* a period concept from identity because it caused duplicate commits across overlapping statements (FR-20). This story's period is presentation/read-filtering only and must never feed dedup.
- Epic 6 individual-list spend-by-origin (Story 6.2) — reuses this story's period primitive later; do not build solo-mode UI here.
- Reassign/rollback interactions with cycles — out of scope; Stories 5.3/5.4 own those flows unchanged.

## Tasks / Subtasks

- [ ] **Task 1 — Domain: derive statement cycles from already-fetched ledger entries** (AC: 1, 2, 3, 4)
  - [ ] New `api/domain/statement_cycles.py`: pure function `derive_statement_cycles(entries: list[LedgerEntryRecord]) -> list[StatementCycle]`.
    - Group entries by `statement_id` (skip entries where `statement_id is None` — hand-entered rows do not define a cycle boundary, though they still fall inside whichever date range is ultimately selected).
    - Per group: `StatementCycle(statement_id=..., period_start=min(posted_date), period_end=max(posted_date), entry_count=len(group))`.
    - Sort groups by `period_end` descending (most recent statement first) — this ordering is what Task 2 uses to pick "most recently imported card" for the default.
    - This mirrors the existing client-side `statementPeriodBounds` pattern in `ui/app/upload/SessionReviewPanel.tsx:344-357` (min/max `posted_date` over a group of rows) — same idea, now computed server-side over **committed** `ledger_entries` instead of staging candidate rows. Do not import from or depend on the UI staging code; it's a different data source (staging vs. committed).
    - No new SQL/repository method — `ListExpensesService`/`GetListBalancesStubService` already fetch the full ledger via `list_ledger_entries(list_id)`; reuse that already-fetched list (same "operate on already-fetched records" pattern Story 5.7 used for `conflicts_touching_list`, at this data scale — a list's full ledger — reads win over adding a second query path).
  - [ ] `derive_default_period(entries) -> PeriodWindow`: if `derive_statement_cycles(entries)` is non-empty, default = the first (most-recent) cycle's `[period_start, period_end]`. Otherwise (no statement-sourced entries at all — AC #4), default = the current calendar month bounds in `America/Costa_Rica` (reuse the existing CR-timezone calendar-date helper already used for display — see `calendarDateInCostaRica` on the UI side and its API-side equivalent; do not hand-roll a second timezone calculation).
  - [ ] Unit tests (`api/tests/test_statement_cycles.py` or alongside `test_settle.py`'s pattern): single statement → one cycle; multiple statements same card → multiple cycles, most-recent first; entries with `statement_id=None` only → falls back to calendar-month default; mixed hand-entered + imported entries → hand-entered rows excluded from cycle grouping but still fall within a selected cycle's date range when filtering (Task 2 covers the filter itself).

- [ ] **Task 2 — Application: period-filtered reads + available-cycles listing** (AC: 1, 2, 3, 4)
  - [ ] Extend `GetListExpensesStubCommand`/`GetListBalancesStubCommand` (`api/application/lists.py`) with optional `period_start: date | None = None`, `period_end: date | None = None`. When both are `None`, the service computes the default period via Task 1's `derive_default_period` (backward-compatible: existing callers with no params get today's already-correct default behavior, just now period-bounded instead of whole-list).
  - [ ] `ListExpensesService.execute` / `GetListBalancesStubService.execute`: after fetching `list_ledger_entries(list_id)`, resolve the effective `[period_start, period_end]` (explicit params, else the derived default), then filter entries to `period_start <= posted_date <= period_end` (inclusive) before building the response. Money/balance math is unchanged — it just now sums a filtered entry set, reusing the existing `compute_settle_balance_for_list_members` / pairwise helpers unchanged (do not duplicate settle math per project-context "settle math server-owned, one code path").
  - [ ] Extend the incomplete-disclosure signal (Story 5.7's `conflicts_touching_list` call site in `GetListBalancesStubService`): a conflict also affects the *viewed period* when `period_start <= conflict.manual.posted_date <= period_end OR period_start <= conflict.parsed.posted_date <= period_end` (AD-10 related-lists check from 5.7 stays unchanged and composes with this — a conflict must satisfy both list-touching AND period-overlap to flag). This is the story that finally gives real meaning to Story 5.7 AC #4 ("outside the selected cycle" no longer vacuous).
  - [ ] New service `GetListCyclesService` (or a thin addition returning cycle options alongside balances — prefer a separate small service/endpoint to keep balances/expenses response shapes additive and unchanged in the *shape* of what they return per-row): `execute(command) -> ListCyclesResult` returning `{ cycles: [{ statement_id, card_id, card_label, period_start, period_end }], default_statement_id: UUID | None, fallback_period: {start, end} | None }`.
    - Card label resolution: join `statement_id -> import_batches.statement_id -> import_statements.card_id -> cards.label`. **Verify at implementation time** whether `LedgerEntryRecord.origin_card_id` already equals the statement's `card_id` for imported rows (it should, per the card-routing flow from Story 4.x) — if confirmed, `origin_card_id` on any entry in the group can stand in for the join and avoid a new query; if not confirmed by a quick grep of the Story 4.x commit/routing code, add the join instead. Do not guess silently either way.
  - [ ] Do not add a `Card.cycle_day`/`cycle_length` field, a `statement_date` column on `import_statements`, or any new migration — Task 1/2 derive everything from data that already exists and is already persisted (`ledger_entries.posted_date`, `ledger_entries.statement_id`, `import_statements.card_id`, `cards.label`).

- [ ] **Task 3 — API: query params + cycles endpoint** (AC: 1, 2, 3, 4, 5)
  - [ ] `api/api/routes/lists.py`: add optional `period_start: date | None = Query(default=None)`, `period_end: date | None = Query(default=None)` to `GET /{list_id}/expenses` and `GET /{list_id}/balances`; pass through to the application commands from Task 2. Validate `period_start <= period_end` when both given (400 on violation — reuse the existing validation-error response shape used elsewhere in this router).
  - [ ] New `GET /{list_id}/cycles` route → `GetListCyclesService`. Response schema `ListCyclesResponse` in `api/api/schemas/lists.py`: `{ cycles: [{ statement_id: str, card_id: str | None, card_label: str | None, period_start: str, period_end: str }], default_statement_id: str | None, fallback_period: { start: str, end: str } | None }`. Gate with the same `read_balances`/`read_expenses`-equivalent ACL check already used by the sibling routes (AD-19 — no new ACL surface, reuse the existing membership check, not a second scheme).
  - [ ] `ListBalancesStubResponse`/`ListExpensesStubResponse`: **no shape change** — the period these responses reflect is implicit in the request's query params, not echoed back in the body (keeps both responses additive-only, consistent with Story 5.7/5.8's "additive fields, no breaking shape changes" precedent). If the dev agent judges an explicit `period: {start, end}` echo in the response meaningfully improves client correctness (e.g., to avoid the UI needing to separately track what it requested), that's a reasonable additive field — use judgment, but do not remove/rename any existing field.

- [ ] **Task 4 — UI: cycle selector wired into shared-expenses** (AC: 1, 2, 3, 4, 5)
  - [ ] `ui/app/lists/[listId]/page.tsx` is an async Server Component (`params: Promise<{ listId: string }>`, already `await`ed at line ~389). Add `searchParams: Promise<{ period?: string }>` to the page's props (Next.js 16 App Router async-searchParams convention, same pattern already used for `params`) and `await` it. `period` query value = a `statement_id` (or a sentinel like `"current"` for the calendar-month fallback) selected from the cycles list; absent → server-computed default (Task 2).
  - [ ] Fetch `GET /lists/{listId}/cycles` alongside the existing balances/expenses fetches (same-origin BFF pattern already used for those — mirror, don't invent a new fetch style). Resolve the effective `period_start`/`period_end` from the selected/default cycle and pass them as query params to the balances/expenses fetches.
  - [ ] New client component `ui/app/lists/CyclePeriodSelector.tsx` (`"use client"`, mirrors `SettleControls.tsx`'s client-island pattern from Story 5.8 — a small focused island, not a wholesale client conversion of `page.tsx`): renders `SoftLedgerSelect` (`ui/components/soft-ledger/Select.tsx`, existing kit-bound listbox — do not build a second select primitive) when `cycles.length > 1` (AC #3 — **do not render the control at all** for a single-cycle or no-cycle list, not just disable it); `onChange` navigates via `router.push`/`router.replace` on `next/navigation`'s `useRouter` with the updated `?period=` query param (same RSC-boundary-safe navigation approach Story 5.7 used for its resolve link — a URL-driven data reload, not client-side refetch-and-mutate-state).
  - [ ] Card label + date-range as the option label (e.g. `"BAC •••• 2026-06-15 – 2026-07-14"` — exact copy/format is a Dev decision; keep it scannable and free-text-safe since card labels are user-entered, per UX-DR18 "card labels remain free text").
  - [ ] Wire the selector into the existing settle-up strip area (above `BalanceStrip`, following the strip → receipts focus order from EXPERIENCE.md's spine table) — do not reuse or extend `TemporalNavigation.tsx` (`ui/app/lists/TemporalNavigation.tsx`, confirmed via research to be an unrelated desktop nav-state toggle for invite/split forms — a naming collision with "temporal" meaning UI chrome state, not calendar time; do not touch it for this story).
  - [ ] `asBalances`/`asExpenses` parsing in `page.tsx` needs no change unless Task 3 adds an echoed `period` field to those payloads — if it does, extend the existing defensive-parse pattern (never fabricate values on a parse miss, matching the `balance_status` precedent from Story 5.7).
  - [ ] `ui/lib/i18n/lists.ts`: add cycle-selector copy keys (label for the control, per-option format helper text if needed, and the calendar-fallback label e.g. "This month") to both `en` and `es` in `listsMessages`, following the existing key style next to `incompleteDisclosureResolve`.

- [ ] **Task 5 — Tests** (AC: all)
  - [ ] API integration (Postgres 16, per every prior Epic 4/5 story — not SQLite): extend `test_lists_integration.py` or add a new module:
    - List with entries from two different statements (different `statement_id`, non-overlapping date ranges) → `GET /{id}/cycles` returns both, most-recent first, `default_statement_id` set to the most recent.
    - List with entries from one statement only → `cycles` has exactly one entry; UI-facing default-period behavior still correct (AC #3's server-side half — no picker is a UI concern, but the API must not force picker-worthy output for a single cycle).
    - List with zero statement-sourced entries (hand-entered only, or empty list) → `cycles` is empty, `fallback_period` is the current CR calendar month, `default_statement_id` is `None` (AC #4).
    - `GET /{id}/balances?period_start=&period_end=` and `GET /{id}/expenses?period_start=&period_end=` correctly restrict results to the window (boundary-inclusive: an entry posted exactly on `period_start` or `period_end` is included).
    - Incomplete disclosure: an unresolved same-price conflict whose `posted_date` falls **outside** the selected period does not flag `is_incomplete`; one **inside** the period does (this is the AC #4 test Story 5.7 explicitly deferred to this story — see Story 5.7's dev notes "Out of scope" section).
    - `period_start > period_end` → 400.
    - Non-member access to `/{id}/cycles` → 404/403 consistent with the sibling balances/expenses routes.
  - [ ] Domain unit tests for `derive_statement_cycles`/`derive_default_period` (Task 1) — pure function, no DB needed, `Decimal`/date assertions only.
  - [ ] UI: `CyclePeriodSelector` — renders nothing for 0 or 1 cycles (AC #3); renders `SoftLedgerSelect` with correct options for 2+; `onChange` produces the correct `?period=` URL. Follow `SettleControls.test.tsx`'s pattern (Story 5.8) for a client-island test, not a full-page RSC render.
  - [ ] UI: extend `page.balanceStrip.test.ts`-style pure-helper tests if `asBalances`/`asExpenses` gain any period-echo parsing (only if Task 3's optional response echo is implemented).
  - [ ] EN/ES: assert both locale keys exist and render (mirrors the existing i18n test pattern in this codebase — grep for how `incompleteDisclosureResolve` coverage was tested in Story 5.7 and follow it, do not invent a new i18n test style).

## Dev Notes

### Zero cycle infrastructure exists today — read this before designing anything

Verified directly in this codebase (2026-08-30), not from planning docs:

- **`Card`** (`api/adapters/persistence/models.py:438-466`, `CardModel`) has **no** billing-cycle field — only `id, user_id, label, iban, routing_mode, fixed_list_id, created_at`. No `cycle_day`, `cycle_length`, or `statement_date`. Migrations `0013_cards.py`, `0015_card_routing.py` are the only ones touching `cards`.
- **`import_statements`** (`ImportStatementModel`, `api/adapters/persistence/models.py:522-563`) has **no** date/period column — only `id, session_id, product_id, pdf_path, iban, card_id, original_filename, status, parse_evidence (JSONB), created_at`. `import_statements` rows are **not** deleted after commit (only the PDF file on the operator volume is removed per AD-3 — the DB row persists as an audit trail), so `statement_id` on ledger entries is a stable, permanent join key.
- **`CanonicalLine`** (`api/domain/canonical_line.py:34-46`) — per-row `posted_date` only, no statement/cycle field. **AD-18 was explicitly amended (2026-08-23)** to *remove* a `statement_period_id` from the dedup identity tuple after it was found to be "actively wrong" — a transaction can legitimately appear on two overlapping statements (FR-20), and tying identity to a period caused duplicate commits. **This story's period concept must never touch `compute_canonical_identity` or dedup.** Read `api/domain/canonical_line.py:88-115` (`compute_canonical_identity`) and its surrounding comment before writing anything that even looks like a period-aware identity change.
- The only existing "period" concept anywhere is `statementPeriodBounds()` in `ui/app/upload/SessionReviewPanel.tsx:344-357` (duplicated in `IndividualReviewPanel.tsx:122-130`) — a **client-side, staging-only** min/max of candidate rows' `posted_date` for one not-yet-committed statement during import review. It never reaches the backend and is discarded once the session finalizes. It's useful prior art for the *shape* of a cycle (min/max posted_date over a group of rows), not reusable data or code.
- `GET /lists/{id}/expenses` and `GET /lists/{id}/balances` (`api/api/routes/lists.py:408-422`, `:592-609`) remain **whole-list, unfiltered** as of 2026-08-30 — confirmed unchanged since Story 5.7's dev notes (2026-08-28). This story is what finally adds a period boundary.

**Design decision this story makes** (stated explicitly since the epics/PRD text describes desired behavior, not a mechanism): derive cycles from already-**committed** `ledger_entries`, grouped by the existing non-null `statement_id` foreign key (populated for every import-sourced row since Story 4.10+), using `min(posted_date)`/`max(posted_date)` per group as that statement's window. This needs **zero new persisted columns** — no `Card.cycle_day`, no `import_statements.statement_date`. See Tasks 1–2 for the exact mechanism. If a future story needs true bank-printed cycle boundaries (e.g. a due date independent of which transactions happened to post), that requires new adapter extraction + new persisted columns — explicitly out of scope here; don't build toward it speculatively.

### Story 5.8 overlap — coordinate before writing code

**Story 5.8 (PR #93, `feat/5/5-8-settle-up-simplify-suggested-transfers`) is done in its own worktree but not yet merged to `main`** as of 2026-08-30. It heavily modifies the exact files this story touches:
- `api/application/lists.py` — `GetListBalancesStubService`, `ListBalancesStub` (adds `you_are_owed`/`you_owe` pairwise fields)
- `api/api/routes/lists.py`, `api/api/schemas/lists.py` — extends `/lists/{id}/balances`
- `ui/app/lists/[listId]/page.tsx` — `asBalances`, balances/expenses fetch wiring, adds `SettleControls`
- `ui/components/soft-ledger/BalanceStrip.tsx` — adds `variant="grid"`

This worktree (`feat/5/5-9-statement-cycle-period-selector`) currently branches from `main @ 1c9185a`, **before** 5.8 merges. Before implementing Task 2–4, check whether `main` has absorbed PR #93 yet; if not, rebase this branch onto `main` after that merge lands (do not implement Story 5.9 against the pre-5.8 `GetListBalancesStubService`/`page.tsx` shape shown in this repo today — it will be superseded). If 5.8 is still unmerged when this story starts, coordinate with whoever owns that PR rather than guessing at a merge order. The pairwise-balances math (`compute_viewer_pairwise_edges`, `net_pairwise_edges`) that 5.8 introduces is exactly what Task 2's period filter needs to operate on (filtered entries in, same pairwise math out — do not duplicate it).

### Architecture compliance

| Rule | Apply |
|------|-------|
| AD-1 | `domain/statement_cycles.py` and `application/lists.py`/`application/expenses.py` stay free of FastAPI/SQLAlchemy imports. |
| AD-10 | Reuse `conflicts_touching_list` (Story 5.7) unchanged; period-overlap is an *additional* filter composed with it, not a replacement. |
| AD-18 | **Do not** reintroduce a period concept into `compute_canonical_identity` or any dedup path — see "Zero cycle infrastructure" above. This is the single most important guardrail for this story. |
| AD-19 | No new ACL surface for `/{list_id}/cycles` — reuse the existing membership check pattern from the sibling balances/expenses routes. |
| AD-21 | Settle math unchanged — period filtering narrows the *input* entry set; `compute_settle_balance_for_list_members`/pairwise helpers are reused verbatim on the filtered set. |
| AD-15 | Postgres 16 integration tests for the period-filtered reads and `/cycles` endpoint — not SQLite. |

### UX

- No dedicated mock exists for the cycle selector — `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` lists "Multi-cycle statement selector" only in the **spine-only backlog** table (line ~274: "When a list holds cards with different billing cycles") with no named journey or mockup. J2 (line 213) explicitly notes "Single cycle already in view — no cycle picker tonight" — confirming AC #3's no-picker-for-single-cycle behavior is the intended default UX, not an edge case to minimize.
- Follow Warm Balance / Soft-Ledger tokens and the existing `SoftLedgerSelect` component (`ui/components/soft-ledger/Select.tsx`) for the picker chrome — do not invent a new select primitive (project-context "kits unstyled only" + AD-23 Tailwind-first).
- Focus order per EXPERIENCE.md's spine table: cycle selector (when present) → settle-up strip → receipts.
- EN/ES localized chrome; card labels are user free text and are never translated (UX-DR18, consistent with Story 3.x/4.x card-label handling).
- Incomplete disclosure (Story 5.7/3.6) placement/a11y mechanics are unchanged — this story only narrows *which* conflicts feed `is_incomplete`, per period.

### Testing requirements

- Postgres 16 integration tests for anything touching `ledger_entries`/`import_statements`/`same_price_conflicts` (Task 5) — every prior Epic 4/5 story rule, restated in `project-context.md`.
- `Decimal`/money assertions unaffected by this story (no new money computation — filtering only); do not introduce `float` anywhere in the new domain code.
- Domain-layer TDD (red→green) for `derive_statement_cycles`/`derive_default_period` per project-context testing discipline (AD-15) — these are pure functions, easiest to get right test-first.

### Previous story intelligence (5.7)

- `GetListBalancesStubService.__init__`'s optional-collaborator-with-Null-default pattern (`conflict_repo: SamePriceConflictRepository | None = None`) is the established way to add a new dependency without breaking existing test call sites — apply the same shape if Task 2 needs a new collaborator (e.g., a cards-lookup for card labels in `GetListCyclesService`).
- Story 5.7's dev notes explicitly named this story as the one that would give real meaning to its AC #4 ("outside the selected cycle") — that's Task 2's period-overlap addition to `conflicts_touching_list`'s result, described above.
- 5.5/5.6/5.7 all used `docker compose -f docker-compose.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm --build api sh -c "alembic upgrade head && pytest -q ..."` in-worktree for Postgres-backed runs — reuse the same invocation. This story adds **no migration**, so `alembic upgrade head` should be a no-op beyond confirming the stack is current.

### Anti-patterns (do not)

- Do not add `Card.cycle_day`/`cycle_length` or an `import_statements.statement_date` column/migration — not needed for this story's scope (see "Zero cycle infrastructure exists today").
- Do not let period filtering anywhere near `compute_canonical_identity` / dedup — AD-18's amendment exists specifically to prevent this class of bug (duplicate commits across overlapping statements).
- Do not reuse or extend `ui/app/lists/TemporalNavigation.tsx` for the cycle picker — confirmed unrelated (desktop invite/split form-toggle chrome), a naming collision only.
- Do not build a second select/listbox component — `SoftLedgerSelect` already exists and is kit-unstyled per AD-23/project-context.
- Do not duplicate settle/pairwise math for the filtered period — reuse the existing balance-computation functions on the filtered entry set.
- Do not implement this story's UI/API layer against the pre-Story-5.8 shape of `page.tsx`/`GetListBalancesStubService` without first checking whether PR #93 has merged to `main` (see "Story 5.8 overlap" above).
- Do not build Epic 6 solo spend-by-origin here — this story ships the period *primitive* only; Story 6.2 is the consumer.

### Project context reference

Follow `_bmad-output/project-context.md`: dates stay ISO-8601 calendar date strings end-to-end, posted/cycle boundaries computed in `America/Costa_Rica` (never JS `Date` for identity/cycle math on the UI side — pass date strings through, let the API do all date-window computation); API wire stays snake_case (`period_start`, `period_end`, `statement_id`, `card_label`), mapped at the UI edge; i18n via per-domain TS message objects (`listsMessages` in `ui/lib/i18n/lists.ts`), not JSON files; Alembic-only schema changes (none needed this story — see anti-patterns); settle math server-owned, UI never recomputes; Warm Balance/Soft-Ledger tokens via existing components only.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.9` lines 1835-1866]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` FR-39 lines 727-734]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-18 (amended 2026-08-23) lines 203-220, AD-10, AD-19, AD-21]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` J2 line 213, spine-only backlog table line 274]
- [Source: `_bmad-output/implementation-artifacts/5-7-wire-incomplete-balance-disclosure-on-strip.md` — "Out of scope" section naming this story, `conflicts_touching_list`, defaulted-collaborator pattern]
- [Source: `_bmad-output/implementation-artifacts/5-8-settle-up-simplify-suggested-transfers.md` (PR #93, unmerged) — pairwise balances shape, `page.tsx`/`BalanceStrip` changes this story must coordinate with]
- [Source: `api/adapters/persistence/models.py:438-466` (`CardModel`), `:522-563` (`ImportStatementModel`)]
- [Source: `api/domain/canonical_line.py:34-46` (`CanonicalLine`), `:88-115` (`compute_canonical_identity`, AD-18 amendment comment)]
- [Source: `api/application/expenses.py:38-60` (`LedgerEntryRecord` — `statement_id`, `origin_card_id`, `posted_date` fields)]
- [Source: `api/application/lists.py:162-171` (`GetListExpensesStubCommand`/`GetListBalancesStubCommand`), `:396-426` (`GetListBalancesStubService`)]
- [Source: `api/api/routes/lists.py:408-422`, `:592-609`]
- [Source: `ui/app/upload/SessionReviewPanel.tsx:344-357` (`statementPeriodBounds` — prior-art pattern, staging-only)]
- [Source: `ui/app/lists/[listId]/page.tsx:384-389` (async `params` pattern to mirror for `searchParams`)]
- [Source: `ui/components/soft-ledger/Select.tsx` (`SoftLedgerSelect`)]
- [Source: `ui/app/lists/TemporalNavigation.tsx` (confirmed unrelated — do not reuse)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-08-30 | Story created via create-story workflow. Ultimate context engine analysis completed - comprehensive developer guide created. Two parallel research passes confirmed zero persisted cycle/period infrastructure exists today; story designs a derivation from already-committed `ledger_entries.statement_id` instead of adding new schema. Flagged unmerged Story 5.8 (PR #93) file overlap as a pre-implementation coordination item. |
