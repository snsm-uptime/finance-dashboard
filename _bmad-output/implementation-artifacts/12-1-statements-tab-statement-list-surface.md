---
baseline_commit: 9e1b0fc
---

# Story 12.1: Statements tab + statement list surface

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a "Statements" tab in the app's bottom navigation,
so that I can find and revisit any bank statement I've previously imported.

## Acceptance Criteria

1. **Given** the app's `TabBar`, **when** it renders for an authenticated user, **then** a new "Statements" entry is visible alongside Home/Budgets/Cards, backed by a new icon in the `FileImportIcon` visual family (DESIGN.md). [Source: epics.md#Story 12.1]
2. **Given** the Statements tab, **when** it loads, **then** statements the user has visibility into are grouped by card/IBAN (one heading-group per registered card the user has imported through), most-recent period first within each group; statements with no card get their own "No card"/"Manual entries" trailing group — each group rendered as a real heading (`<h2>`), not just a visual section break, so a screen-reader user can jump between groups. [Source: epics.md#Story 12.1]
3. **Given** a period row within a group, **when** I select it, **then** a period-summary screen opens (period dates, item count, destination list(s), a "View items" action) — not a direct jump into the retouch list. [Source: epics.md#Story 12.1]
4. **Given** the period summary screen, **when** I activate "View items", **then** navigation to the statement's retouch route occurs and focus moves to the retouch view's heading (or first row); backing out of the retouch view returns focus to the "View items" trigger on the period summary card. [Source: epics.md#Story 12.1] (Note: the retouch view's own content — the per-row list with edit/delete/move — is Story 12.2's scope; this story owns navigation + focus management only, see Dev Notes "12.1/12.2 boundary".)
5. **Given** no statements exist yet for the user, **when** the Statements tab loads, **then** an empty state is shown with a short hint + link to `/upload`, matching the tone of other first-run empty states in the app — never a bare blank screen. [Source: epics.md#Story 12.1]

## Tasks / Subtasks

- [ ] Task 1: Domain — reuse `derive_statement_cycles` across all of a user's visible entries (AC: #2, #3)
  - [ ] No new domain logic needed. `api/domain/statement_cycles.py#derive_statement_cycles` already groups `HasStatementAndPostedDate`-shaped rows by `statement_id` into `StatementCycle(statement_id, period_start, period_end, entry_count)`, sorted `(period_end, statement_id)` descending (Story 5.9). It is **list-agnostic** — it only reads `statement_id`/`posted_date` — so it works unchanged when fed entries spanning multiple lists. Do not duplicate or rewrite this function.

- [ ] Task 2: Repository — ledger entries visible to a user across all their lists (AC: #2)
  - [ ] Add `list_ledger_entries_for_user(self, user_id: UUID) -> list[LedgerEntryRecord]` to `SqlAlchemyListRepository` (`api/adapters/persistence/repositories.py`), modeled directly on the existing `list_ledger_entries(self, list_id)` (lines ~584-605): same `select(LedgerEntryModel, ImportBatchModel.statement_id).outerjoin(ImportBatchModel, ...)`, but add `.join(ListMembershipModel, ListMembershipModel.list_id == LedgerEntryModel.list_id)` and filter `ListMembershipModel.user_id == user_id` instead of `LedgerEntryModel.list_id == list_id`. Reuse `_ledger_entry_record(row, statement_id)` for the row mapping — do not hand-roll a second record constructor. Apply the same incomplete-stub-row skip (`normalized_description`/`payer_id`/`provenance`/`line_type`/`posted_date` all non-null) as the existing method.
  - [ ] Add `get_list_name(self, list_id: UUID) -> str | None` only if no existing repo method already returns a bare list name by id — check `GetListDetailService`/`ListRecord` first (likely already exposes `.name` on a fetched `ListRecord`); prefer calling an existing `get_list(list_id)` and reading `.name` over adding a new single-purpose method.
  - [ ] This method is additive — do not change `list_ledger_entries(list_id)`'s existing signature or behavior (Story 5.9/6.x callers depend on it unchanged).

- [ ] Task 3: Application — `ListUserStatementsService` (AC: #2, #3, #5)
  - [ ] New file `api/application/statements.py`. Define:
    - `StatementSummary`: `statement_id: UUID`, `card_id: UUID | None`, `card_label: str | None`, `period_start: date`, `period_end: date`, `item_count: int`, `destination_list_ids: tuple[UUID, ...]`, `destination_list_names: tuple[str, ...]`.
    - `StatementCardGroup`: `card_id: UUID | None`, `card_label: str | None` (`None` card_id ⇒ the trailing "No card" group — resolve its label client-side via i18n, not server-side English text), `statements: tuple[StatementSummary, ...]`.
    - `ListUserStatementsCommand(actor_user_id: UUID)` / `ListUserStatementsResult(groups: tuple[StatementCardGroup, ...])`.
    - `ListUserStatementsService(repo)`: calls `repo.list_ledger_entries_for_user(actor_user_id)`, then `derive_statement_cycles(entries)` (Task 1), then resolves `card_id`/`card_label` per statement using **the exact same first-non-null-origin_card_id-per-statement pattern already implemented in `GetListCyclesService.execute`** (`api/application/lists.py` lines ~902-926: `card_id_by_statement` dict built by iterating entries, `resolve_label` via `repo.get_card_label` with a local cache) — copy this pattern into the new service rather than importing it (it's a private loop inside a different service's `execute`, not an extracted helper; do not refactor `GetListCyclesService` to share it unless you also update its existing tests — out of scope here). For `destination_list_ids`/`destination_list_names`, build a parallel `dict[UUID, set[UUID]]` of list_ids seen per statement_id while iterating the same entries, then resolve names via `repo.get_list_name` (or `.get_list(...).name`) with its own cache.
    - Group statements by `card_id` (preserving each group's internal order from `derive_statement_cycles`'s sort — do not re-sort within a group). Order groups deterministically: cards with at least one statement, by `card_label` ascending (case-insensitive), **then** the `card_id=None` group last regardless of label (AC #2's "trailing" requirement is non-negotiable — do not let alphabetical sort place "No card" earlier just because of its label text).
  - [ ] No ACL ceremony beyond the membership join itself — the user only ever sees entries from lists `list_ledger_entries_for_user` already scoped to their own `ListMembershipModel` rows (AD-19, membership ACL only). Do not add a separate `AuthorizeListAccessService` call per list here; there's no single `list_id` to authorize against for the whole surface.

- [ ] Task 4: Application — single statement's period summary (AC: #3, #4)
  - [ ] Add `GetUserStatementSummaryCommand(actor_user_id: UUID, statement_id: UUID)` / `GetUserStatementSummaryService(repo)` to the same `api/application/statements.py`. Implementation: call `list_ledger_entries_for_user(actor_user_id)` (same membership-scoped query — do not add a separate unscoped-by-membership statement lookup, that would leak visibility into statements the user has no entries in), filter to `entry.statement_id == command.statement_id`, derive via `derive_statement_cycles` on just that filtered set (or reuse Task 3's full computation and index into it — either is fine; prefer whichever reads simpler). If no entries match → raise `ImportStatementNotFoundError` (`domain/errors.py`, already used by `ReassignStatementService` for the same "nothing visible under this id" case) — this doubles as the ACL boundary: a statement that exists but has zero entries in lists this user belongs to must 404, not leak period dates.
  - [ ] Zero-items statement after a future move/delete (12.2 scope) must still resolve here — AC in 12.2 depends on this read staying stable at `item_count: 0`; `derive_statement_cycles` already handles an empty entry list for one statement_id as "no cycle" though, so if **all** entries for a statement have since moved out of every list this user belongs to, the summary legitimately 404s for this user (correct — the statement's history remains inspectable only to someone with a remaining or historical membership tie; do not try to special-case this, it's out of this story's scope and not contradicted by any AC here).

- [ ] Task 5: API routes (AC: #2, #3, #4)
  - [ ] New `api/api/schemas/statements.py`: `StatementSummaryResponse` (mirror `StatementSummary` fields, dates as ISO strings per project-context date-string convention, UUIDs as `str`), `StatementCardGroupResponse` (`card_id: str | None`, `card_label: str | None`, `statements: list[StatementSummaryResponse]`), `StatementGroupsResponse` (`groups: list[StatementCardGroupResponse]`).
  - [ ] New `api/api/routes/statements.py`: `router = APIRouter(prefix="/statements", tags=["statements"])`.
    - `GET /statements` → `ListUserStatementsService`, returns `StatementGroupsResponse`.
    - `GET /statements/{statement_id}` → `GetUserStatementSummaryService`, returns `StatementSummaryResponse`; catch `ImportStatementNotFoundError` → 404 `{"detail": ..., "code": "import_statement_not_found"}` (reuse the existing error-to-code mapping already used wherever `ImportStatementNotFoundError` is caught today, e.g. `api/api/routes/lists.py`'s reassign-statement handler — match its exact `code` string for consistency).
    - Both routes `Depends(require_authenticated_user)` for `user_id`, `Depends(get_db)` for `db`.
  - [ ] Register in `api/api/app.py`: `from api.routes.statements import router as statements_router` + `application.include_router(statements_router, dependencies=[Depends(require_user_alias)])` — grouped with `lists_router`/`splits_router`/`budgets_router` (line ~63-66), since this is a cross-list membership-scoped browse surface like budgets, not a personal pre-alias resource like cards.

- [ ] Task 6: UI — Statements tab icon (AC: #1)
  - [ ] New `ui/app/icons/StatementsIcon.tsx` (or similarly named — pick the name that reads clearly next to `HomeIcon`/`FolderIcon`/`WalletIcon`/`FileImportIcon` in `ui/app/icons/index.ts`). Build in the same 1.5px linear-stroke family as `FileImportIcon.tsx` (reuse `ICON_STROKE` from `./stroke`) per DESIGN.md: "visually related to the existing FileImportIcon... same linear-stroke language... must not read as a heavier or more detailed glyph than HomeIcon/FolderIcon/WalletIcon." A static (non-animated) icon is sufficient — DESIGN.md does not ask for a morph here (unlike `BoxIcon`/`FileImportMorphIcon` in Story 7.6). Export from `ui/app/icons/index.ts`.

- [ ] Task 7: UI — TabBar entry + routing (AC: #1)
  - [ ] `ui/components/AppShell.tsx`: add `{ key: "statements", href: "/statements", label: t.statementsTabLabel, Icon: StatementsIcon }` to the `tabs` array (between `cards` and wherever reads best — order isn't ACL-specified, match the epics.md listing order "Home/Budgets/Cards" + Statements, i.e. append last, consistent with how Budgets/Cards were themselves appended when added).
  - [ ] `ui/lib/appChrome.ts`: add `"/statements"` to `APP_CHROME_PREFIXES`; add the `/statements` branch to `tabKeyFromPath` returning `"statements"`.
  - [ ] New i18n: `statementsTabLabel` goes in `ui/lib/i18n/lists.ts` alongside `tabList`/`budgetsEntryLabel` (the file that already owns all TabBar entry labels — do not create a separate file just for this one key, even though the rest of the Statements copy goes in its own domain file per the next task).

- [ ] Task 8: UI — new i18n domain file (AC: #2, #3, #5)
  - [ ] New `ui/lib/i18n/statements.ts`, structured exactly like `ui/lib/i18n/cards.ts` (`statementsMessages = { en: {...}, es: {...} } as const` + `statementsCopy(locale)` export). Keys needed (EN+ES both): page title, `noCardGroupLabel` ("No card" / "Manual entries" heading text — AC #2 names both; pick one, e.g. "No card" / "Sin tarjeta" — this is the group whose entries carry no `card_id`), `emptyState` + `emptyStateCta` (AC #5's "short hint + link to /upload" — match tone/structure of an existing empty state, e.g. `cardsMessages.emptyState` or a Budgets equivalent — check `ui/app/budgets/BudgetsPanel.tsx`'s empty-state copy for the established voice before writing new strings), `periodSummaryItemCount`, `periodSummaryDestination`, `viewItemsAction`, `loading`, `errorGeneric`, `errorUnauthorized`.

- [ ] Task 9: UI — client fetch helpers (AC: #2, #3)
  - [ ] New `ui/app/statements/statementsClient.ts`, modeled on `ui/app/cards/cardsClient.ts`'s shape (`parseJson`, `mapError`, `OkX | ErrorResult` return types, `credentials: "same-origin"`). Export `fetchStatementGroups(messages)` (`GET /api/statements`) and `fetchStatementSummary(statementId, messages)` (`GET /api/statements/{id}`), with matching `StatementGroup`/`StatementSummary` client-side types and defensive `asX` parsers (don't trust the wire shape blindly, matching `asCard`'s pattern).

- [ ] Task 10: UI — BFF proxy routes (AC: #2, #3)
  - [ ] New `ui/app/api/statements/route.ts` (`GET` only, proxy to `${getApiInternalUrl()}/statements`) and `ui/app/api/statements/[statementId]/route.ts` (`GET` only, proxy to `.../statements/{statementId}`), both copying `ui/app/api/cards/route.ts`'s `forwardCookie` + passthrough-status/body + 502-on-fetch-failure shape exactly.

- [ ] Task 11: UI — `/statements` route (tab home) (AC: #2, #5)
  - [ ] New `ui/app/statements/page.tsx` + `ui/app/statements/StatementsPanel.tsx` (client component), following `CardsPanel.tsx`'s structural shape (`useChromeHeader` for the page title, a `useEffect` load-on-mount calling `fetchStatementGroups`, loading/error/empty states).
  - [ ] Render one `<section>` per `StatementCardGroup` with a real `<h2>` heading (`card_label` or the "No card" i18n string) — do **not** reuse `StackedListPanel`'s single-flat-list shape directly for the whole page (it has no heading-group concept); instead render one `<h2>` + one `StackedListPanel` (or a simpler `<ul>`, since there's no ghost-input row here) per group, each listing that group's `statements` as rows. Rows are plain links/buttons to `/statements/[statementId]` (period summary), not yet the retouch list.
  - [ ] Empty state (AC #5): when the groups response is empty altogether (zero statements, not just zero groups-with-content), render the existing-pattern empty state (hint text + `<Link href="/upload">`), reusing whatever component/markup pattern Budgets or Cards already uses for their own first-run empty state — do not invent a new empty-state component.

- [ ] Task 12: UI — `/statements/[statementId]` route (period summary) (AC: #3, #4)
  - [ ] New `ui/app/statements/[statementId]/page.tsx` + a client component rendering the period-summary card per DESIGN.md ("statement-period-summary-card": `background: surface`, `border: 1px solid border`, `rounded.card` — same bordered-card treatment as other Soft-Ledger cards, not `CreditCardFace`'s credit-card skin). Shows period dates, item count, destination list name(s), and a "View items" button.
  - [ ] "View items" navigates to `/statements/[statementId]/items` (the retouch route — see Dev Notes "12.1/12.2 boundary" below for what this story does vs. defers). Before navigating, capture a ref/handle to the "View items" trigger element so focus can be restored to it on return (AC #4's "backing out... returns focus to the 'View items' trigger"). The simplest correct mechanism given this is a route change, not a modal: store the trigger's DOM id or use the Next.js router's back-navigation plus a focus-restoration effect keyed on `document.activeElement` capture before `router.push` — follow whatever focus-restoration pattern (if any) this codebase already uses for sheet/drawer open→close flows (check `ui/components/Sheet` or `useFocusTrap`/`useModalAnimation` hooks referenced in `spec-refactor-usefocustrap-hook.md`/`spec-refactor-useModalAnimation-hook.md`) before inventing a new one; a route-level back-nav focus restore is a different mechanism than a Sheet's internal trap, so some original wiring is expected here, but reuse any existing "focus the thing that opened this" utility if one already exists.

## Dev Notes

- **12.1/12.2 boundary — do not build the retouch list's content here.** AC #4 (this story) requires the *navigation and focus-management plumbing* down to the retouch view ("focus moves to the retouch list's heading (or first row)"), but the retouch view's actual content — the `ReceiptRow`-shelled per-row list with edit/delete/move actions, the `IndividualReviewPanel` card-identification/title-edit reuse, the live-region announcements on row removal — is explicitly Story 12.2's scope (epics.md#Story 12.2, not this story's ACs). **Resolve this by having this story create `ui/app/statements/[statementId]/items/page.tsx` as a minimal shell**: it fetches nothing beyond what's needed to render a heading (e.g. "Items" or the period range) that focus can land on, and a back control, with a placeholder body (e.g. a loading spinner or "coming soon" is **not** acceptable product copy, but an empty `<ul>`/TODO comment is fine since no AC here requires real row content) — Story 12.2 will fill in the real list in-place. Do not skip creating this file; AC #4's focus-management behavior needs a real heading to move focus to, and that heading plus the back-navigation wiring is this story's deliverable, not 12.2's.
- **Statement grouping is per-card, not per-IBAN-string.** A card's IBAN can theoretically change label/registration state, but grouping is keyed on `card_id` (the FK), with `card_label` resolved live via `get_card_label` — exactly as Story 5.9's `GetListCyclesService` already does for the per-list cycle picker. Don't key groups on the raw IBAN string.
- **This is a read-only story.** No new ledger mutation, no new migration, no schema change — `import_statements`/`ledger_entries`/`import_batches` already carry everything needed (confirmed via `ReassignStatementService`/`list_statement_ledger_moves`, which already joins `ledger_entries.import_batch_id → import_batches.statement_id` to resolve a statement's current ledger rows — this story's query is the same join shape, scoped by user membership instead of by a single `statement_id`).
- **`derive_statement_cycles` excludes hand-entered rows with no `statement_id`** (Story 5.9's domain contract — see its docstring) — this is correct and desired here too: a statement-browsing surface has nothing to show for ledger entries that were never part of an import. Manual/hand-entered expenses do **not** appear anywhere on this tab, even in the "No card" group — "No card" means "statement-sourced, card unidentified," not "manually entered." Do not conflate the two; this reading is also consistent with the Sprint Change Proposal's own wording ("statements with no IBAN... get their own trailing group") — it's about *statements*, which by definition came from an import, not hand entries.
- **Destination list(s), plural, per statement.** A single statement's ledger rows can already span more than one destination list today — via Story 5.3's whole-statement reassign (which moves *all* its rows together, so normally stays 1 list) but more importantly via the still-separate Story 5.10 (single-item move, same batch of work as this epic) once it ships, which can peel one row off to a different list while the rest stay put. `destination_list_ids`/`destination_list_names` on `StatementSummary` must therefore be a collection, not a single id — the period-summary screen's "destination list(s)" wording in both the epics AC and DESIGN.md already anticipates this.
- **Membership-scoped visibility is the entire ACL model here** — there is no separate per-statement grant/role check beyond "does this user have at least one ledger entry, in a list they belong to, carrying this statement's batch." This mirrors AD-19 (membership ACL only) and is the same shape `GetListCyclesService` uses per-list, just widened to "all lists this user is in" instead of one `list_id`.
- **No test fixtures/PII concerns beyond the existing ones** — this story adds no new PDF/parsing/fixture surface; its tests exercise already-committed `ledger_entries`/`import_batches`/`import_statements` rows via the integration-test Postgres fixtures already used by `test_lists_integration.py`/`test_cards_integration.py`-style tests.
- **Icon naming:** check `ui/app/icons/index.ts` and `README.md`/`QUICK_REFERENCE.md` in that folder for this codebase's icon-naming convention before finalizing `StatementsIcon`'s file name — follow whatever naming scheme those docs establish (they exist specifically to keep icon additions consistent) rather than guessing from this story alone.

### Project Structure Notes

- New (API): `api/application/statements.py`, `api/api/routes/statements.py`, `api/api/schemas/statements.py`.
- Modified (API): `api/adapters/persistence/repositories.py` (`list_ledger_entries_for_user`, maybe `get_list_name`), `api/api/app.py` (router registration).
- New (UI): `ui/app/icons/StatementsIcon.tsx` (name TBD per Dev Notes), `ui/app/statements/page.tsx`, `ui/app/statements/StatementsPanel.tsx`, `ui/app/statements/statementsClient.ts`, `ui/app/statements/[statementId]/page.tsx` + its summary-card component, `ui/app/statements/[statementId]/items/page.tsx` (minimal shell, see Dev Notes), `ui/app/api/statements/route.ts`, `ui/app/api/statements/[statementId]/route.ts`, `ui/lib/i18n/statements.ts`.
- Modified (UI): `ui/components/AppShell.tsx` (new tab entry), `ui/lib/appChrome.ts` (new prefix + tab key), `ui/lib/i18n/lists.ts` (`statementsTabLabel` key only — rest of Statements copy lives in its own domain file per Dev Notes), `ui/app/icons/index.ts` (export new icon).
- No changes anticipated to `api/application/reassign_statement.py`, `api/domain/statement_cycles.py`, `ui/app/cards/*`, `ui/app/lists/*`, or any Story 5.10/4.17 file — those are separate stories in the same batch (see epics.md Epic 12 header cross-reference) and are not touched here.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 12.1`, lines 2799-2825] — this story's ACs verbatim
- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 12` header, lines 2789-2797] — demo gate, sequencing/cross-reference note to Stories 5.10/4.17
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-30/DESIGN.md`] — Statements tab icon family, period-summary-card visual spec, retouch-row inheritance (12.2)
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-30/EXPERIENCE.md`] — IA (tab → group → period summary → retouch), focus-management requirements, "No card"/"Manual entries" group semantics, empty-state tone
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-30.md`] — FR-57, full rationale/evidence trail for this epic
- [Source: `api/domain/statement_cycles.py`] — `derive_statement_cycles`, `HasStatementAndPostedDate`, sort order; reused as-is
- [Source: `api/application/lists.py` `GetListCyclesService.execute`, lines ~878-951] — the card-resolution-per-statement pattern this story's new service copies; existing precedent for statement↔card linkage via `origin_card_id`
- [Source: `api/adapters/persistence/repositories.py` `list_ledger_entries`, lines 584-605, and `_ledger_entry_record`, lines 65-90] — exact query/record-mapping shape `list_ledger_entries_for_user` extends
- [Source: `api/adapters/persistence/repositories.py` `list_statement_ledger_moves`/`apply_statement_reassign`, lines 844-920ish] — confirms `ledger_entries.import_batch_id → import_batches.statement_id` is the live join for "this statement's current rows," and that `import_statements` rows persist after commit (not deleted)
- [Source: `api/application/reassign_statement.py`] — `ImportStatementNotFoundError` usage precedent for "no visible rows under this id" as 404
- [Source: `api/api/routes/cards.py`, `api/api/schemas/cards.py`] — route/schema file shape to mirror for `statements.py` equivalents
- [Source: `api/api/app.py`, lines ~60-73] — router registration list; `lists_router`/`budgets_router` both gated on `require_user_alias`, `cards_router` is not — this story's router joins the former group
- [Source: `ui/app/cards/CardsPanel.tsx`, `ui/app/cards/cardsClient.ts`] — client component + fetch-helper shape to mirror for `StatementsPanel`/`statementsClient.ts`
- [Source: `ui/components/soft-ledger/TabBar.tsx`, `ui/components/AppShell.tsx` lines ~40-44] — tabs is a flat array, confirmed structurally cheap to extend (per Sprint Change Proposal's own evidence)
- [Source: `ui/lib/appChrome.ts`] — `APP_CHROME_PREFIXES`/`tabKeyFromPath`, both need a `/statements` entry
- [Source: `ui/app/icons/FileImportIcon.tsx`, `ui/app/icons/stroke.ts`] — stroke-weight/visual-family precedent for the new Statements icon
- [Source: `ui/components/StackedListPanel/StackedListPanel.tsx`] — flat single-list panel; confirmed it has no heading-group concept, so the Statements tab page composes multiple instances (or a lighter in-page list) rather than extending this component
- [Source: `_bmad-output/implementation-artifacts/7-6-archive-budgets.md`] — most recent full-stack story in this codebase; used as the template for this file's Dev Notes/Project Structure Notes granularity and for confirming `BoxIcon`/`FileImportMorphIcon` is the *only* precedent for an animated icon (this story's icon does not need animation)
- [Source: `_bmad-output/project-context.md`] — AD-19 membership-ACL-only; i18n per-domain TS message file convention; dates as ISO strings at the API boundary; UUIDs for all entities; component location/test-location conventions

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
