---
baseline_commit: c598f6cfcd25935c6015a38e32ff64d327b8f541
---

# Story 4.2: Manual origin — card / Cash / blank + no-origin filter

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member,
I want to set an optional origin on manual expenses (existing card, Cash, or blank) and filter items with no origin,
So that I can tag how money was spent and catch up on unassigned rows later.

## Acceptance Criteria

1. **Given** I am adding or editing a manual expense and I have registered cards, **when** I open the origin control, **then** I can choose an existing card from a dropdown, choose Cash, or leave origin blank. (FR-21, UX-DR15)
2. **Given** the expense is neither card nor cash, **when** I leave origin blank and save, **then** the item is stored with no origin and remains valid.
3. **Given** items exist with blank origin, **when** I apply the no-origin filter, **then** I see those items and can assign origin (card or Cash) individually or in a batch assign flow.
4. **Given** I have no registered cards yet, **when** I open origin, **then** Cash and blank remain available; the card dropdown is empty or omitted without blocking save.

## Scope Note (read before starting)

This story extends **manual expenses only** (`ledger_entries`, Story 3.2's `LedgerEntryModel`/`ManualExpenseForm`). It does **not** touch imported/parsed statement lines — the import pipeline (Stories 4.4–4.9) doesn't exist yet, and `ledger_entries.product_id` stays reserved for the bank adapter's product code (see Story 4.1 Dev Notes "Forward note for whoever builds the origin chip" — do not repurpose `product_id`). Origin is a **new, separate** pair of columns.

**"Editing a manual expense" in AC #1/#3 means editing its origin only**, not a general expense-edit feature (amount/description/payer editing does not exist yet anywhere in the app and is out of scope here). AC #3's "individually or in a batch assign flow" is satisfied by a new `PATCH .../expenses/{entry_id}/origin` endpoint called once per item (sequentially for batch) — there is no bulk-update endpoint to build.

**No cross-user card access:** the card dropdown always lists the *acting user's own* registered cards (`ListCardsService`/`GET /cards`, same scoping Story 4.1 already enforces), not the expense payer's cards. A user adding an expense picks from their own wallet, matching EXPERIENCE.md J1: "optionally sets origin (card / Cash / blank)" during Sebas's own manual-entry flow, and Story 4.1's card-privacy rule (card labels are private to their owner).

**No receipt-row "chip" UI in this story.** Story 4.1 explicitly reserved the origin/chip *display* (showing which card a shared-expense row came from) for whoever builds it next — that is still future scope (4.6–4.9 import stories, per Story 4.1 Dev Notes). This story only adds the *set/edit* origin capability (form control + filter + assign flow), not a visible chip on `ReceiptRow`.

## Tasks / Subtasks

- [x] Task 1: Domain — origin validation (AC: #1, #2, #4)
  - [x] 1.1 `api/domain/expenses.py`: add `ORIGIN_KIND_CARD = "card"`, `ORIGIN_KIND_CASH = "cash"`, `ORIGIN_KINDS = frozenset({ORIGIN_KIND_CARD, ORIGIN_KIND_CASH})`. Extend `ManualExpenseDraft` with `origin_kind: str | None` and `origin_card_id: UUID | None`. Remove the `# Origin (card / Cash / blank) is Story 4.2 — do not add origin_kind / origin_card_id here.` placeholder comment (this story is where it lands).
  - [x] 1.2 Extend `validate_manual_expense(...)` with new keyword params `origin_kind: str | None = None`, `origin_card_id: UUID | None = None`. Validation (reuse `InvalidManualExpenseError` — do not add a new error class, this is still "manual expense input is invalid"):
    - `origin_kind` not in `{None, "card", "cash"}` → raise.
    - `origin_kind == "card"` and `origin_card_id is None` → raise ("Choose a card, or leave origin blank.").
    - `origin_kind != "card"` and `origin_card_id is not None` → raise (cash/blank must not carry a card id — prevents a stale id surviving a client-side mode switch).
    - `origin_kind is None` (blank) is always valid regardless of whether the user has any registered cards (AC #4) — no "must have cards" rule anywhere in domain.
  - [x] 1.3 Add a second pure function `validate_origin_update(*, origin_kind: str | None, origin_card_id: UUID | None) -> tuple[str | None, UUID | None]` that runs the same three checks as 1.2 without the rest of the manual-expense shape (amount/description/payer) — this is what the new origin-only update path (Task 3.3) calls. Factor the shared checks into a private helper both call; do not duplicate the raise logic.
  - [x] 1.4 `api/tests/test_manual_expense_domain.py`: add cases — origin blank always valid (with/without `member_ids` cards context, since domain doesn't know about cards at all); `origin_kind="card"` without `origin_card_id` → raises; `origin_kind="cash"` with `origin_card_id` set → raises; `origin_kind` outside `{card,cash,None}` → raises; `validate_origin_update` mirrors the same three failure cases standalone.

- [x] Task 2: Persistence — `origin_kind`/`origin_card_id` columns + card-ownership lookup (AC: #1, #2, #3, #4)
  - [x] 2.1 `api/adapters/persistence/models.py`: on `LedgerEntryModel`, add `origin_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)` and `origin_card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cards.id", ondelete="SET NULL"), nullable=True, index=True)`. Place them right after the existing `# Import stubs — no FK; cards/origin land in Epic 4 (do not add origin_* here).` / `product_id` comment block — update that comment to say origin now lives here, `product_id` is still adapter-only. Do **not** touch `product_id`, `external_ref`, or any FX field.
  - [x] 2.2 Alembic migration `api/adapters/persistence/migrations/versions/0014_ledger_origin.py` (`down_revision = "0013_cards"`): add both columns to `ledger_entries` + the FK + an index on `origin_card_id`. Follow `0013_cards.py`'s docstring/header format.
  - [x] 2.3 `api/adapters/persistence/repositories.py`: import `CardModel` into the existing `from adapters.persistence.models import (...)` block (line ~44). Add `get_card_for_owner(self, user_id: UUID, card_id: UUID) -> CardRecord | None` to `SqlAlchemyListRepository` (select `CardModel` where `id == card_id AND user_id == user_id`, mirror `SqlAlchemyCardRepository.get_card_by_iban`'s shape from `adapters/persistence/cards.py`; import `CardRecord` from `application.cards` locally like the other cross-module imports in this file already do). This is the **ownership check** — without it a user could set another user's card id as their expense origin.
  - [x] 2.4 `create_ledger_entry`: pass `origin_kind=draft.origin_kind, origin_card_id=draft.origin_card_id` into `LedgerEntryModel(...)` (currently hardcodes neither — you're adding both fields) and into the returned `LedgerEntryRecord(...)`.
  - [x] 2.5 `list_ledger_entries`: include `origin_kind=row.origin_kind, origin_card_id=row.origin_card_id` in the returned `LedgerEntryRecord(...)`.
  - [x] 2.6 Add `update_ledger_entry_origin(self, *, list_id: UUID, entry_id: UUID, origin_kind: str | None, origin_card_id: UUID | None) -> LedgerEntryRecord`: fetch `LedgerEntryModel` by id, raise `SubjectNotFoundError()` (existing error, already imported in this file — mirror how `splits.py` uses it) if missing or `row.list_id != list_id`; also raise `SubjectNotFoundError()` if the row is an incomplete pre-3.2 stub (same guard `list_ledger_entries` already applies — `normalized_description is None`, etc. — an origin update on a non-expense stub row makes no sense); set `row.origin_kind`, `row.origin_card_id`; flush; return the full `LedgerEntryRecord` (reuse the same construction as `create_ledger_entry`'s return, including FX fields already on the row).

- [x] Task 3: Application — create + update-origin services (AC: #1, #2, #3, #4)
  - [x] 3.1 `api/application/expenses.py`: extend `LedgerEntryRecord` with `origin_kind: str | None = None`, `origin_card_id: UUID | None = None` (defaulted so existing call sites that don't set them — none should remain after Task 2, but keep it defensive). Extend `CreateManualExpenseCommand` with `origin_kind: str | None = None`, `origin_card_id: UUID | None = None`.
  - [x] 3.2 Extend `ExpenseRepository` Protocol with `get_card_for_owner(self, user_id: UUID, card_id: UUID) -> "CardRecord | None"` and `update_ledger_entry_origin(self, *, list_id: UUID, entry_id: UUID, origin_kind: str | None, origin_card_id: UUID | None) -> LedgerEntryRecord`. Import `CardRecord` from `application.cards` (no SQLAlchemy import here — hex boundary, AD-1).
  - [x] 3.3 `CreateManualExpenseService.execute`: after `validate_manual_expense(...)` returns `draft` (now carrying `origin_kind`/`origin_card_id`) and **before** the FX call, if `draft.origin_kind == "card"`: call `self._repo.get_card_for_owner(command.actor_user_id, draft.origin_card_id)`; if it returns `None`, raise `InvalidManualExpenseError("Selected card is not registered to you.")` — fail before any write, matching the existing "fail loud before persisting" FX comment already in this method.
  - [x] 3.4 Add `UpdateExpenseOriginCommand(actor_user_id: UUID, list_id: UUID, entry_id: UUID, origin_kind: str | None, origin_card_id: UUID | None)` and `UpdateExpenseOriginService`: authorize via `AuthorizeListAccessService` action `"write_expense"` (same action `CreateManualExpenseService` uses — origin edit is a ledger-entry mutation, no new ACL action needed), call `domain.expenses.validate_origin_update(...)` (Task 1.3), then the same card-ownership check as 3.3, then `self._repo.update_ledger_entry_origin(...)`. Return the updated `LedgerEntryRecord`.
  - [x] 3.5 Add unit tests in a **new** `api/tests/test_expenses_application.py` (fake-repo pattern — mirror `test_cards_application.py`'s `_FakeRepo`; there is no existing application-tier test file for expenses to extend, Story 3.2 only has domain + Postgres-integration coverage): create with `origin_kind="card"` + owned card → succeeds and record carries origin; create with `origin_kind="card"` + card owned by a different user → `InvalidManualExpenseError`; create with `origin_kind="cash"` → succeeds, `origin_card_id is None`; create with no origin → succeeds, both fields `None`; `UpdateExpenseOriginService` happy path (blank→cash, cash→card, card→blank); update on a nonexistent/foreign-list entry id → `SubjectNotFoundError`; update by a non-member → `NotListMemberError` (ACL check runs first).

- [x] Task 4: API — schemas + routes (AC: #1, #2, #3, #4)
  - [x] 4.1 `api/api/schemas/lists.py`: add `origin_kind: Literal["card", "cash"] | None = None` and `origin_card_id: UUID | None = None` to `CreateExpenseBody`, `ExpenseItemResponse`, and `CreateExpenseResponse`. Add `class UpdateExpenseOriginBody(BaseModel): origin_kind: Literal["card", "cash"] | None = None; origin_card_id: UUID | None = None`.
  - [x] 4.2 `api/api/routes/lists.py`:
    - `_expense_item(row)`: add `origin_kind=row.origin_kind, origin_card_id=row.origin_card_id` to the returned `ExpenseItemResponse(...)`.
    - `create_list_expense`: pass `origin_kind=body.origin_kind, origin_card_id=body.origin_card_id` into `CreateManualExpenseCommand(...)`; the response already reuses `_expense_item`-shaped fields — extend whatever inline `CreateExpenseResponse(...)` construction exists similarly (check the ~15 lines after the `logger.info(...)` call around line 419 for the exact return shape and mirror it).
    - New route: `@router.patch("/{list_id}/expenses/{entry_id}/origin", response_model=ExpenseItemResponse)` → builds `UpdateExpenseOriginService(SqlAlchemyListRepository(db))`, executes `UpdateExpenseOriginCommand(actor_user_id=user_id, list_id=list_id, entry_id=entry_id, origin_kind=body.origin_kind, origin_card_id=body.origin_card_id)`, returns `_expense_item(updated)`. Error mapping: `InvalidManualExpenseError` → 422 `invalid_manual_expense` (same shape as create); `SubjectNotFoundError` → 404, reuse the `{"detail": SubjectNotFoundError.MESSAGE, "code": "subject_not_found"}` shape from `api/api/routes/splits.py` (add a local `_subject_not_found()` helper to `lists.py`, mirroring that file — `lists.py` doesn't have one yet); `(ListNotFoundError, NotListMemberError)` → `_access_denied()` (existing helper, same as create). `logger.info("manual_expense_origin_updated list_id=%s entry_id=%s origin_kind=%s", ...)` on success, matching the `manual_expense_created` logging convention.
  - [x] 4.3 `api/tests/test_manual_expense_api.py` (Postgres integration, extend existing file — do not create a new one): register a card for the test user first (reuse `SqlAlchemyCardRepository`/`POST /cards` or direct model insert, whichever this file's existing helpers favor), then: create expense with `origin_kind="card"` + that card id → `201`, response echoes both fields; create with a card id belonging to a second test user → `422 invalid_manual_expense`; create with `origin_kind="cash"` → `201`, `origin_card_id: null`; create with no origin fields at all (omit from body) → `201`, both `null` (backward-compatible with Story 3.2's existing request shape — no client is forced to send origin); `PATCH .../expenses/{id}/origin` happy path blank→card→cash→blank across three calls; `PATCH` on an entry id from a different list → `404 subject_not_found`; `PATCH` by a non-member → `403`.

- [x] Task 5: UI — origin control on the manual expense form (AC: #1, #2, #4)
  - [x] 5.1 `ui/app/lists/listsClient.ts`: add `origin_kind: string | null` and `origin_card_id: string | null` to `ExpenseItem`. Add optional `origin_kind?: "card" | "cash" | null` and `origin_card_id?: string | null` to `CreateExpenseBody`. In `asExpense`, read both with `typeof row.origin_kind === "string" ? row.origin_kind : null` / same for `origin_card_id` (do not add them to the required-field validation block — older cached responses without these keys must still parse). In `createExpense`'s `payload` object, include `origin_kind`/`origin_card_id` only when `body.origin_kind !== undefined` (same `...(condition ? {...} : {})` spread style already used for `split_override`).
  - [x] 5.2 Add `updateExpenseOrigin(listId: string, entryId: string, origin: { origin_kind: "card" | "cash" | null; origin_card_id: string | null }, messages: ListsClientMessages): Promise<OkExpense | ErrorResult>` to `listsClient.ts` — same fetch/error-handling shape as `createExpense`, `PATCH` to `` `/api/lists/${encodeURIComponent(listId)}/expenses/${encodeURIComponent(entryId)}/origin` ``.
  - [x] 5.3 New BFF route `ui/app/api/lists/[listId]/expenses/[entryId]/origin/route.ts`: `PATCH` handler, copy `ui/app/api/lists/[listId]/expenses/route.ts`'s `POST` handler shape exactly (`forwardCookie`, `cache: "no-store"`, 400 `invalid_body` on bad JSON, 502 `bad_gateway` on fetch failure), proxying to `` `${getApiInternalUrl()}/lists/{listId}/expenses/{entryId}/origin` `` with method `PATCH`.
  - [x] 5.4 `ui/lib/i18n/lists.ts`: add EN+ES keys (both locale blocks — see existing `expense*` keys ~line 66/148 for placement): `expenseOriginLabel` ("Origin" / "Origen"), `expenseOriginBlank` ("None" / "Ninguno"), `expenseOriginCash` ("Cash" / "Efectivo"), `expenseOriginNoCards` — not needed as a separate string per AC #4 (blank/Cash still show; just fewer options), so skip unless you find the dropdown reads oddly with only 2 options — judgment call, keep UI simple.
  - [x] 5.5 `ui/app/lists/ManualExpenseForm.tsx`:
    - Remove the `{/* Origin extension point (Story 4.2): card / Cash / blank — do not ship a stub control. */}` comment.
    - On mount, fetch the actor's own cards via `fetchCards()` from `../cards/cardsClient` (reuse Story 4.1's client helper — do not re-implement a `/cards` fetch here). Store in local state; loading/error here should not block the rest of the form (origin is optional — a failed card fetch just means the dropdown falls back to blank/Cash only, do not show a blocking error).
    - Add one `SoftLedgerSelect` (matches the existing payer/assignee select pattern in this file) with options: `[{value: "", label: messages.expenseOriginBlank}, {value: "cash", label: messages.expenseOriginCash}, ...cards.map(c => ({value: c.id, label: c.label}))]`. Local state `originValue: string` (`""` = blank, `"cash"` = cash, else a card id).
    - On submit, derive `origin_kind`/`origin_card_id` from `originValue`: `""` → `{origin_kind: null, origin_card_id: null}`; `"cash"` → `{origin_kind: "cash", origin_card_id: null}`; else → `{origin_kind: "card", origin_card_id: originValue}`. Include in the `createExpense(...)` call's body.
    - Reset `originValue` to `""` in `resetAdjustFields`'s sibling reset logic (the `onSuccess` handler that already resets `amount`/`description`/`payerId`).
    - Add `expenseOriginLabel`/`expenseOriginBlank`/`expenseOriginCash` to the exported `ManualExpenseMessages` type.
  - [x] 5.6 Both call sites that build a `ManualExpenseMessages` object must add the three new keys or the origin select renders blank labels: `ui/app/lists/[listId]/page.tsx` (desktop sidebar `<ManualExpenseForm messages={{...}}>`, ~line 446) and `ui/app/lists/ListDetailMobileActions.tsx`'s caller in `page.tsx` (`expenseMessages={{...}}`, ~line 520) — both read from the same `listsMessages`/`t` object, just add the three keys to both literal object spreads.
  - [x] 5.7 `ui/app/lists/ManualExpenseForm.test.tsx`: add cases — origin defaults to blank; selecting Cash then submitting sends `origin_kind: "cash"`; selecting a card then submitting sends `origin_kind: "card", origin_card_id: <id>`; zero cards → dropdown still renders with just blank/Cash options and submit is not blocked (mock `fetchCards` to resolve `{ok:true, cards:[]}`).

- [x] Task 6: UI — no-origin filter + assign flow (AC: #3)
  - [x] 6.1 New client component `ui/app/lists/NoOriginFilter.tsx` (`"use client"`). Props: `listId: string`, `expenses: ExpenseItem[]` (passed down from the already-SSR-fetched list on `page.tsx` — do not re-fetch expenses client-side, that data already exists server-side), `messages` (new `NoOriginFilterMessages` type exported from this file, EN+ES keys added to `lists.ts`: `noOriginFilterToggle`, `noOriginFilterEmpty`, `noOriginFilterAssign`, `noOriginFilterAssigning`, `noOriginFilterSelectAll`, plus reuse `expenseOriginCash`/`expenseOriginBlank` from Task 5.4).
    - On mount, fetch cards via `fetchCards()` (same helper as Task 5.5 — two independent fetches in two components is acceptable here, both are cheap "list my cards" calls; do not thread cards through page.tsx props).
    - A toggle button/`<details>` (mirror the `Adjust split` `<details>` pattern already in `ManualExpenseForm.tsx` for a consistent disclosure affordance) that reveals the filtered subset: `expenses.filter(e => e.origin_kind === null)`.
    - Empty filtered set → show `noOriginFilterEmpty` text, no controls.
    - Each filtered row: a checkbox (for batch selection) + its own `SoftLedgerSelect` (same 3-option shape as Task 5.5: blank/Cash/cards) + a per-row "Assign" `FormIconSubmit`-style button that calls `updateExpenseOrigin` for just that row.
    - Below the rows: a batch control — one shared `SoftLedgerSelect` (Cash or a card; blank is meaningless as a batch target since items already start blank) + "Assign selected" button, enabled only when ≥1 row is checked. On click, call `updateExpenseOrigin` **sequentially** (not `Promise.all` — keep it simple and give a clear per-row failure point) for each checked id; on any failure, stop and surface which row failed via the existing `error`/`aria-live` pattern (`useFormSubmission` or a local `pending`/`error` state, developer's call which is cleaner here).
    - On any successful assign (single or batch), call `router.refresh()` (same pattern `ManualExpenseForm` uses) so `page.tsx` re-fetches `expenses` server-side and this component's `expenses` prop updates with the item removed from the no-origin set.
  - [x] 6.2 Render `<NoOriginFilter listId={listId} expenses={expenses} messages={{...}} />` in `ui/app/lists/[listId]/page.tsx`, inside `detailPrimary`, directly under the `<SectionLabel>{t.detailReceiptsTitle}</SectionLabel>` line (~line 402) and before the `expensesLoadError ? ... : ...` receipts block — only render when `!expensesLoadError` (no point offering a filter over data that failed to load).
  - [x] 6.3 New test file `ui/app/lists/NoOriginFilter.test.tsx` (mirror `ManualExpenseForm.test.tsx`'s mock-fetch conventions): filters to only `origin_kind: null` items; empty-state copy when none are blank-origin; individual assign calls `updateExpenseOrigin` once with the right ids; batch assign with 2 selected calls it twice (sequential — assert call order/args, not just count); a mid-batch failure stops further calls and surfaces the error.

- [x] Task 7: Story-close overview (required before `done` — see Dev Notes)

## Dev Notes

### Data model decision (judgment call — flag if you disagree)

Origin is modeled as **two columns**, not one: `origin_kind: "card" | "cash" | NULL` and `origin_card_id: UUID | NULL` (FK → `cards.id`, `ON DELETE SET NULL`). A single nullable `origin_card_id` alone can't distinguish "Cash" from "blank" (both would be `NULL`), and FR-21/AC #2 requires blank to be a distinct, valid, first-class state — not just "no card yet". `origin_kind` is the source of truth for which of the three states applies; `origin_card_id` is only ever non-null when `origin_kind == "card"`. This mirrors how `provenance`/`line_type` already work as parallel nullable-string tags on the same table (Story 3.2).

If a referenced card is later deleted (card deletion isn't built in any story yet, but the FK exists for when it is), `ON DELETE SET NULL` silently drops `origin_card_id` back to `NULL` while `origin_kind` would incorrectly still say `"card"`. No story currently deletes cards, so this is a latent gap, not a bug to fix now — flag it in Completion Notes as deferred, do not build card-deletion cascading logic in this story.

### Hexagonal placement (AD-1) — same boundaries as Story 4.1 and Story 3.2

- `domain/expenses.py`: pure validation only, no DB/HTTP imports — extends existing `ManualExpenseDraft`/`validate_manual_expense`, adds `validate_origin_update`.
- `application/expenses.py`: orchestration + `ExpenseRepository` Protocol extension — imports `CardRecord` from `application.cards` (application-to-application import is fine; no SQLAlchemy/FastAPI).
- `adapters/persistence/repositories.py`: the only place `CardModel` gets touched for this story's purposes (via the new `get_card_for_owner` on `SqlAlchemyListRepository`) — `SqlAlchemyCardRepository` in `adapters/persistence/cards.py` stays untouched, this story does not need it directly since `SqlAlchemyListRepository` already implements `ExpenseRepository` and needs its own card-ownership read.
- `api/routes/lists.py` + `api/schemas/lists.py`: HTTP edge only, extends the existing expenses routes — no new router file (this is a field addition + one new route on an existing resource, not a new bounded concern like Cards was).
- `ui` → HTTP only via the existing `/api/lists/[listId]/expenses` BFF plus one new nested `/origin` BFF route.

### Files you will modify (read fully before editing — same AD-1/hex discipline as Story 4.1)

- `api/adapters/persistence/models.py` — adding two columns + one FK to `LedgerEntryModel`. Read the whole `LedgerEntryModel` class first (lines ~247-290); do not touch `amount_crc`/`fx_rate`/`fx_rate_date`/`fx_fallback` (Story 3.5) or `product_id`/`external_ref` (reserved for the future adapter pipeline, per Story 4.1's forward note).
- `api/adapters/persistence/repositories.py` (603 lines) — this file has three classes (`SqlAlchemySignupRepository`, `SqlAlchemyAuthUserRepository`, `SqlAlchemyListRepository`). All your edits are inside `SqlAlchemyListRepository` (starts at line 182): `create_ledger_entry` (~372), `list_ledger_entries` (~432), plus one new method. Do not touch the other two classes or any split/default-split/membership methods.
- `api/api/routes/lists.py` — extends the existing `/{list_id}/expenses` POST/GET handlers and `_expense_item()`; adds one new PATCH route. Do not touch invites/default-split/membership routes in this file.
- `ui/app/lists/ManualExpenseForm.tsx` — the exact "Origin extension point" comment (line 253 as of baseline) marks where the control goes; the form otherwise keeps its existing amount/description/payer/Adjust-split structure untouched.
- `ui/app/lists/[listId]/page.tsx` (584 lines, Server Component) — two `ManualExpenseMessages`-shaped object literals (desktop ~446, mobile-via-`ListDetailMobileActions` ~520) both need the three new keys, plus one new `<NoOriginFilter>` render. Everything else in this file (balances, invite, default-split, temporal nav) is out of scope.

### Recent live-code context (git log, 2026-08-14, same day as Story 4.1)

Two commits landed **after** Story 4.1 and are not reflected in that story's file: `feat(home): combine Lists and Cards into a new Home screen` and `refactor(home): address review findings and update Home copy`. They moved the authenticated landing page from `/lists` to `/home` (embedding `CardsPanel` with a new `embedded` prop) and made `/lists` redirect to `/home`. This does **not** affect this story's scope — `ManualExpenseForm` and the list-detail page (`ui/app/lists/[listId]/page.tsx`) are unchanged by that refactor, and `fetchCards()`/`CardItem` in `ui/app/cards/cardsClient.ts` (what Task 5.5/6.1 reuse) are unaffected. Mentioned so you don't get confused if you see `/home` references while reading around — `"back to lists"` links in `page.tsx` already point at `/home`, that's expected, not something to fix here.

### Testing Requirements (project-context "Discipline" + "Layers")

- Domain: pure unit tests, no DB (Task 1.4) — extend `test_manual_expense_domain.py`, do not create a new domain test file.
- Application: unit tests with a fake repo double, no DB (Task 3.5) — **new** file `test_expenses_application.py` (Story 3.2 never got one; Story 4.1's `test_cards_application.py` is the pattern to copy).
- Integration: Postgres 16 via `DATABASE_URL`-gated `TestClient` tests (Task 4.3) — extend `test_manual_expense_api.py`, not a new file. You'll need a second test user + their own card to prove the cross-user-card-id-rejected case; `tests/integration_db.py`'s helpers (`claim_alias`, `make_client`) already support multiple users (see how `test_cards_integration.py` proves per-user IBAN scoping).
- UI: component tests co-located (Tasks 5.7, 6.3) plus a `listsClient` — there's no standalone `listsClient.test.ts` today (check before assuming one exists; if none exists, add origin-shape assertions inline in `ManualExpenseForm.test.tsx`'s existing mock-fetch setup rather than creating a new client-test file for one function).
- Money is not involved in origin fields — no `Decimal` assertions needed for this story's new code (existing FX assertions elsewhere are untouched).

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `4-1-register-and-match-cards-by-iban.md`'s Completion Notes for the expected format.

### Project Structure Notes

- No conflicts detected with the unified project structure. This story is a field-and-endpoint extension of an existing bounded concern (manual expenses, Story 3.2), not a new one — no new domain/application module, one new UI component (`NoOriginFilter.tsx`) sitting alongside `ManualExpenseForm.tsx` in `ui/app/lists/`.
- `ledger_entries.product_id` (adapter product code, Story 4.1+4.4+) and `origin_card_id` (this story) are and must remain **distinct columns with distinct meanings** — re-confirmed from Story 4.1's forward note, now actually being built.
- Card ownership scoping (`get_card_for_owner`) mirrors the same per-`user_id` scoping every other card read path uses (`get_card_by_iban`, `list_cards_for_user` in Story 4.1) — do not introduce a cross-user card lookup here either.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2: Manual origin — card / Cash / blank + no-origin filter] — ACs, story statement.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2: Manual expense with payer + Adjust split UI] — "this story must not ship a dead or stub origin control that implies cards exist" (the constraint this story now fulfills) and confirms Story 3.2 deliberately left the extension point.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-21] — "optional origin is an existing card, Cash, or blank; a filter supports later assignment of no-origin items."
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md#Manual expense form] — "origin optional — dropdown of user's existing cards, Cash, or leave blank... Filter exists later to find/assign items with no origin." No dedicated visual spec exists for the origin control or the filter — reuse existing form/select/disclosure primitives (same situation Story 4.1 hit for card rows).
- [Source: _bmad-output/implementation-artifacts/4-1-register-and-match-cards-by-iban.md#Forward note for whoever builds the origin "chip"] — confirms `product_id` must not be repurposed, card labels are owner-private, and the chip *display* is explicitly out of scope until 4.6-4.9.
- [Source: api/domain/expenses.py:24, api/application/expenses.py, ui/app/lists/ManualExpenseForm.tsx:79-82] — the exact extension-point comments Story 3.2 left, now being replaced.
- [Source: api/application/cards.py, api/adapters/persistence/cards.py, ui/app/cards/cardsClient.ts] — Story 4.1's card domain/application/persistence/client to reuse (`ListCardsService`, `fetchCards()`), not reinvent.
- [Source: api/api/routes/splits.py:58-62] — `_subject_not_found()` 404 shape this story's new PATCH route reuses for `SubjectNotFoundError`.
- [Source: _bmad-output/project-context.md] — money/Decimal (N/A here), snake_case wire, i18n per-domain TS files, no new CSS Modules (this story adds no new stylesheet — `NoOriginFilter.tsx` uses co-located Tailwind utilities per Epic 3.5 convention, matching `RegisterCardForm.tsx`'s post-migration style, not `ManualExpenseForm.module.scss`'s pre-existing class-based style), generic vocabulary, testing layers/discipline rules (all cited inline above where applied).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- API dev-image integration tests: `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build api` initially stalled — the worktree's `db` service healthcheck uses `interval: 1h` with no immediate first check, so `depends_on: condition: service_healthy` blocked for up to an hour after the `run --build` step recreated `db`. Worked around by running the built dev image directly (`docker run --network <worktree>_internal -v ./api/tests:/app/tests fh-...-api pytest -q`), bypassing the `depends_on` gate — Postgres itself was already accepting connections (`pg_isready` would have passed), only Compose's own healthcheck bookkeeping was stale. Full suite (357 tests) passed this way. No code change — noting in case a future story hits the same stall.

### Completion Notes List

- All 7 tasks complete, TDD red→green per task: domain (12 new tests), application (8 new tests, first application-tier file for expenses), persistence (verified via Alembic upgrade + integration suite), API (7 new Postgres integration tests), UI (4 new ManualExpenseForm cases + 5 new NoOriginFilter cases, +2 more NoOriginFilter cases added during code review — see Review Findings).
- Full regression figures previously stated here ("357 api / incl. 32 new", "191 ui / incl. 15 new") had the wrong new-test breakdown — corrected during code review (2026-08-15): `api` 357 passed (12 domain + 8 application + 7 API = 27 new, re-verified against Postgres 16); `ui` 193 passed (4 ManualExpenseForm + 7 NoOriginFilter = 11 new — includes 2 NoOriginFilter cases added by the review's patch pass, see Review Findings), `tsc --noEmit` clean, both re-run and confirmed passing after the review's patches.
- Deferred, not a bug: per Dev Notes "Data model decision", if a referenced card is later deleted, `ON DELETE SET NULL` drops `origin_card_id` to `NULL` while `origin_kind` would incorrectly still read `"card"`. No story deletes cards yet — flagging for whoever adds card deletion, not building cascading logic now.
- Judgment calls from Dev Notes were followed as written (origin-only `PATCH` endpoint, not general expense edit; two-column `origin_kind`/`origin_card_id` model; card dropdown always scoped to the acting user's own cards; no receipt-row chip UI) — no deviations.

## Story-close overview — 4-2-manual-origin-card-cash-blank-no-origin-filter

**Request path:**
Browser → `ui` `ManualExpenseForm`/`NoOriginFilter` (client components) → same-origin BFF (`/api/lists/{id}/expenses`, new `/api/lists/{id}/expenses/{entryId}/origin`) → `api` `POST/PATCH /lists/{id}/expenses[...]` (`require_authenticated_user`) → `CreateManualExpenseService`/`UpdateExpenseOriginService` → `domain/expenses.py` validation (`validate_manual_expense`/`validate_origin_update`) → card-ownership check (`SqlAlchemyListRepository.get_card_for_owner`, scoped to `actor_user_id`) → `SqlAlchemyListRepository.create_ledger_entry`/`update_ledger_entry_origin` → Postgres `ledger_entries.origin_kind`/`origin_card_id` (FK → `cards.id`, `ON DELETE SET NULL`).

**Key components:**
`api/domain/expenses.py` (`ORIGIN_KIND_CARD/CASH`, `validate_origin_update`), `api/application/expenses.py` (`UpdateExpenseOriginCommand/Service`, `get_card_for_owner`/`update_ledger_entry_origin` on the `ExpenseRepository` Protocol), `api/adapters/persistence/{models.py,repositories.py}`, `api/adapters/persistence/migrations/versions/0014_ledger_origin.py`, `api/api/{schemas,routes}/lists.py` (new `PATCH .../expenses/{id}/origin` route); `ui/app/lists/{listsClient.ts,ManualExpenseForm.tsx,NoOriginFilter.tsx,[listId]/page.tsx}`, `ui/app/api/lists/[listId]/expenses/[entryId]/origin/route.ts`, `ui/lib/i18n/lists.ts`.

**Why this shape:**
Origin extends Story 3.2's manual expense (not a new bounded concern) — one field-and-endpoint addition on the existing `ledger_entries`/`expenses` route family, reusing Story 4.1's card domain/application/persistence (`ListCardsService`, `get_card_for_owner`) rather than duplicating card-ownership logic. Two columns (`origin_kind` + `origin_card_id`) instead of one nullable FK because "Cash" and "blank" must be distinguishable states, not both represented as `NULL` (Dev Notes "Data model decision"). The origin-only `PATCH` endpoint exists because no general expense-edit feature exists anywhere in the app yet — origin is edited standalone, not as part of a future full-edit form.

**What not to break:**
- `ledger_entries.product_id` stays reserved for the future bank-adapter pipeline (Story 4.1/4.4+) — `origin_card_id` is a distinct column with a distinct meaning; never merge or repurpose either into the other.
- Card ownership is always checked against `actor_user_id`, never the expense payer — a user can only set *their own* cards as origin, matching Story 4.1's card-privacy rule. `get_card_for_owner` is the only cross-reference into `CardModel` from the expenses path; do not add a second, looser card lookup.
- The receipt-row origin "chip" (visual display) is still out of scope — this story only adds the set/edit capability (form + filter + assign), not a `ReceiptRow` chip. That remains reserved for the future import stories (4.6–4.9) per Story 4.1's forward note.
- `NoOriginFilter` reads `expenses` from `page.tsx`'s server-side fetch and calls `router.refresh()` after a successful assign — it does not client-side re-fetch expenses itself; don't add a second expenses-fetch path here.

### File List

**New:**
- `api/adapters/persistence/migrations/versions/0014_ledger_origin.py`
- `api/tests/test_expenses_application.py`
- `ui/app/api/lists/[listId]/expenses/[entryId]/origin/route.ts`
- `ui/app/lists/NoOriginFilter.tsx`
- `ui/app/lists/NoOriginFilter.test.tsx`

**Modified:**
- `api/domain/expenses.py`
- `api/tests/test_manual_expense_domain.py`
- `api/adapters/persistence/models.py`
- `api/adapters/persistence/repositories.py`
- `api/application/expenses.py`
- `api/api/schemas/lists.py`
- `api/api/routes/lists.py`
- `api/tests/test_manual_expense_api.py`
- `ui/app/lists/listsClient.ts`
- `ui/lib/i18n/lists.ts`
- `ui/app/lists/ManualExpenseForm.tsx`
- `ui/app/lists/ManualExpenseForm.test.tsx`
- `ui/app/lists/[listId]/page.tsx`
- `ui/app/lists/[listId]/page.receiptRowFx.test.ts`

### Review Findings

- [x] [Review][Patch] Batch "Assign selected" leaves stale UI and risks overwriting already-succeeded rows on retry after a partial failure [ui/app/lists/NoOriginFilter.tsx:98-112] — Fixed: succeeded rows are now removed from `selected` and `router.refresh()` fires whenever at least one row persisted, so a retry only resubmits rows that actually failed.
- [x] [Review][Patch] Batch/row assign failure message doesn't identify which row failed [ui/app/lists/NoOriginFilter.tsx:82-86,44] — Fixed: the error now prefixes the failing row's description, e.g. "Groceries: Selected card is not registered to you."
- [x] [Review][Patch] Row-level "Assign" silently no-ops when no origin is selected [ui/app/lists/NoOriginFilter.tsx:93,144-152] — Fixed: the per-row Assign button is now disabled until a non-blank origin is chosen.
- [x] [Review][Patch] Foreign-card-ownership check duplicated verbatim in two services [api/application/expenses.py:357-364,389-392] — Fixed: extracted into a shared `_reject_unowned_card_origin` helper called from both services.
- [x] [Review][Patch] Application-tier test skips the card→blank leg of Task 3.5's required transition cycle [api/tests/test_expenses_application.py] — Fixed: `test_update_origin_blank_to_cash_to_card_to_blank` now covers all four states.
- [x] [Review][Patch] Completion Notes overstate new test counts [_bmad-output/implementation-artifacts/4-2-manual-origin-card-cash-blank-no-origin-filter.md:167-168] — Fixed: Completion Notes corrected with verified counts (api 357 passed incl. 27 new; ui 193 passed incl. 11 new after this review's patches).
- [x] [Review][Defer] Card deletion leaves origin_kind="card" with origin_card_id=NULL (ON DELETE SET NULL mismatch) [api/adapters/persistence/models.py:280-285] — deferred, pre-existing (already flagged as a known, deliberately-deferred gap in this story's own Dev Notes/Completion Notes; also currently unreachable since no card-delete endpoint exists anywhere in the app)
- [x] [Review][Defer] NoOriginFilter's `origin_kind === null` filter can't surface future corrupted origin state [ui/app/lists/NoOriginFilter.tsx:63] — deferred, pre-existing (same root cause and deferral as the card-deletion gap above; flagged for whoever builds card deletion)
- [x] [Review][Defer] TOCTOU gap between card-ownership check and entry write could surface a raw IntegrityError instead of a 422 [api/application/expenses.py:357-364,389-392] — deferred, pre-existing (currently unreachable — no card-delete feature exists yet in the app)
- [x] [Review][Defer] fetchCards() message-shape mismatch reuses generic text for card-creation-specific error fields [ui/app/lists/NoOriginFilter.tsx:48-53, ui/app/lists/ManualExpenseForm.tsx] — deferred, pre-existing (inherited from Story 4.1's `fetchCards()` signature; this diff only adds two more conforming call sites)
- [x] [Review][Defer] Card labels aren't disambiguated in origin dropdowns (no IBAN suffix, no uniqueness enforced) [ui/app/lists/NoOriginFilter.tsx:67, ui/app/lists/ManualExpenseForm.tsx] — deferred, pre-existing (inherited from Story 4.1's card model/UI; this diff reuses the existing `label` field as-is)

## Change Log

- 2026-08-15: Story implemented via `bmad-dev-story` — all 7 tasks complete; domain/persistence/application/API/UI slices for manual-expense origin (card/Cash/blank) + no-origin filter/assign flow; 357 api tests passing (incl. 32 new), 191 ui tests passing (incl. 15 new); status → review
- 2026-08-15: Code review (`bmad-code-review`) — 3 layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor); 0 decision-needed, 6 patch, 5 deferred, 6 dismissed as noise/matches-existing-convention
- 2026-08-15: All 6 patch findings applied and verified (`api` 357 passed, `ui` 193 passed, `tsc --noEmit` clean); status → done
