---
baseline_commit: 36b420fa56212bdf94ce59b536536840d5187cb3
---

# Story 4.3: Card routing mode + review default list

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a card owner,
I want to choose fixed-list vs review-routing for each card and set my low-effort default list,
So that imports land where I expect without assuming "always personal list."

## Acceptance Criteria

1. **Given** a registered card, **when** I choose fixed-list mode and pick a list I belong to, **then** that card's statements feed that list (subject to parse/failure handling), **and** v1 allows at most one active fixed list per card. (FR-11, FR-16)
2. **Given** a registered card, **when** I choose review-routing mode, **then** each statement/upload is assigned during review before commit. (FR-11, FR-16)
3. **Given** review-routing is active, **when** I set my configurable default destination list, **then** low-effort accepts (Individual "left" / default path) land on that list, **and** the default may be my personal list or any list I belong to. (FR-12)
4. **Given** routing is configured, **when** import runs, **then** the product does not silently assume always-personal-list. (FR-11)

## Scope Note (read before starting)

This story builds **configuration only**: per-card routing mode (fixed-list vs review-routing) + a global "default review destination list" preference. The actual import pipeline that *consumes* these settings — upload → detect/split → parse → Import Session → review → commit (Stories 4.4–4.9) — does not exist yet. AC #1's "that card's statements feed that list" and AC #3's "low-effort accepts land on that list" describe the *contract* this story's data must satisfy for that future pipeline; this story does not build the pipeline itself. Do not build any upload/review/commit UI or endpoints here.

Per EXPERIENCE.md: "Fixed card→list routing is configured **after** this [registration] prompt, not inside it" — routing config is a **separate settings action** on the already-registered card (Cards page), not part of `RegisterCardForm`/`RegisterCardService` (Story 4.1). Do not touch card registration.

"A list I belong to" / "any list I belong to" (AC #1, #3) means **membership**, not ownership — a card owner can route to a shared list they're a member but not owner of. Use the existing membership ACL (`AuthorizeListAccessService`), not an owner-only check.

## Tasks / Subtasks

- [x] Task 1: Domain — routing mode validation (AC: #1, #2, #4)
  - [x] 1.1 `api/domain/cards.py`: add `ROUTING_MODE_FIXED = "fixed"`, `ROUTING_MODE_REVIEW = "review"`, `ROUTING_MODES = frozenset({ROUTING_MODE_FIXED, ROUTING_MODE_REVIEW})`.
  - [x] 1.2 Add `validate_card_routing(routing_mode: str, fixed_list_id: UUID | None) -> tuple[str, UUID | None]`: raise `InvalidCardRoutingModeError` if `routing_mode not in ROUTING_MODES`; if mode is `"fixed"` and `fixed_list_id is None`, raise `InvalidCardRoutingModeError("Choose a list for fixed-list routing.")`; if mode is `"review"`, **return `(mode, None)`** — force-clear any `fixed_list_id` the caller passed (AC #1 "at most one active fixed list" — switching to review must not leave a stale fixed list hanging around); if mode is `"fixed"` with a list id, return `(mode, fixed_list_id)` unchanged.
  - [x] 1.3 `api/domain/errors.py`: add `InvalidCardRoutingModeError(DomainError)` (`CODE = "invalid_card_routing_mode"`, `MESSAGE = "Choose fixed-list or review-routing."`, same `__init__(self, detail=None)` shape as `InvalidCardLabelError`) and `CardNotFoundError(DomainError)` (`CODE = "card_not_found"`, `MESSAGE = "Card not found."`, no-arg `__init__` like `ListNotFoundError`).
  - [x] 1.4 `api/tests/test_cards_domain.py`: add cases — `"fixed"` + list id → returns unchanged; `"fixed"` + no list id → raises; `"review"` + a passed-in list id → returns `(mode, None)` (list id cleared); `"review"` + no list id → returns `(mode, None)`; mode outside `{fixed, review}` → raises.

- [x] Task 2: Domain — ACL action vocabulary for routing/default-list mutations (AC: #1, #3)
  - [x] 2.1 `api/domain/list_access.py`: add `"route_card_to_list"` and `"set_default_import_list"` to the `ListAccessAction` `Literal` and to `_MEMBER_MUTATION_ACTIONS` (same class as `"set_last_opened_list"`/`"import_to_list"` — any member, no owner requirement, per FR-11/FR-12 "a list I belong to").
  - [x] 2.2 `api/tests/test_list_access_domain.py`: add `test_route_card_to_list_member_allowed`/`test_route_card_to_list_non_member_denied` and `test_set_default_import_list_action_member_allowed`/`test_set_default_import_list_action_non_member_denied` — call `AuthorizeListAccessService.execute` directly with the new actions against the existing `FakeListRepo`, mirroring `test_set_last_opened_non_member_is_not_list_member`/`test_set_last_opened_member_persists` (lines ~229–258) in structure (member → `ListAccessGrant` returned; non-member → `NotListMemberError`, not 404 — mutation class hides nothing, just denies). Named with an `_action_` infix to avoid colliding with Task 5.5's full-service tests of the same feature.

- [x] Task 3: Persistence — schema (AC: #1, #2, #3, #4)
  - [x] 3.1 New Alembic migration `api/adapters/persistence/migrations/versions/0015_card_routing.py` (`down_revision = "0014_ledger_origin"`, follow `0013_cards.py`/`0014_ledger_origin.py`'s docstring/header format): add `cards.routing_mode` (`sa.String(16)`, `nullable=False`, `server_default="review"` — backfills existing Story-4.1 cards to review mode, the safe "does not assume always-personal-list" default per AC #4), `cards.fixed_list_id` (`postgresql.UUID(as_uuid=True)`, FK → `lists.id`, `ondelete="SET NULL"`, nullable, + index `ix_cards_fixed_list_id`), and `users.default_import_list_id` (same FK/ondelete/index shape, `ix_users_default_import_list_id`). `downgrade()` drops all three (index-then-column pairs, then the two new columns on `cards`, reverse order from `upgrade()`).
  - [x] 3.2 `api/adapters/persistence/models.py`: on `CardModel`, add `routing_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="review", server_default="review")` and `fixed_list_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lists.id", ondelete="SET NULL"), nullable=True, index=True)` — mirror `ListModel.default_split_mode`'s `default=`+`server_default=` pairing (both needed so a freshly-flushed row has the value populated in Python without a round trip, not just server-default).
  - [x] 3.3 On `UserModel`, add `default_import_list_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lists.id", ondelete="SET NULL"), nullable=True, index=True)` right after the existing `last_opened_list_id` column — same shape, sibling preference.
  - [x] 3.4 Run `alembic upgrade head` (inside the api container/venv) to verify the migration applies cleanly against a Postgres 16 instance before moving on.

- [x] Task 4: Application — `SetCardRoutingService` (AC: #1, #2, #4)
  - [x] 4.1 `api/application/cards.py`: extend `CardRecord` with `routing_mode: str = "review"`, `fixed_list_id: UUID | None = None` (defaulted — all existing construction call sites use keyword args, so this is additive and safe). Extend `CardRepository` Protocol with `get_card(self, card_id: UUID, user_id: UUID) -> CardRecord | None` and `update_routing(self, *, card_id: UUID, user_id: UUID, routing_mode: str, fixed_list_id: UUID | None) -> CardRecord`.
  - [x] 4.2 Import `ListAccessLookup` from `application.list_access` (do not redefine — reuse the existing narrow Protocol `get_list`/`get_membership`). Add `SetCardRoutingCommand(actor_user_id: UUID, card_id: UUID, routing_mode: str, fixed_list_id: UUID | None = None)`.
  - [x] 4.3 Add `SetCardRoutingService(card_repo: CardRepository, list_lookup: ListAccessLookup)`: `execute()` — (a) `mode, fixed_list_id = validate_card_routing(command.routing_mode, command.fixed_list_id)` (domain, Task 1.2); (b) if `mode == "fixed"`: `AuthorizeListAccessService(list_lookup).execute(AuthorizeListAccessCommand(acting_user_id=command.actor_user_id, list_id=fixed_list_id, action="route_card_to_list"))` — propagates `NotListMemberError` on deny, do not catch it here (route layer maps it); (c) `card = card_repo.get_card(command.card_id, command.actor_user_id)`; if `card is None`, raise `CardNotFoundError()`; (d) `return card_repo.update_routing(card_id=command.card_id, user_id=command.actor_user_id, routing_mode=mode, fixed_list_id=fixed_list_id)`.
  - [x] 4.4 `api/adapters/persistence/cards.py` (`SqlAlchemyCardRepository`): update `_card_record()` to include `routing_mode=row.routing_mode, fixed_list_id=row.fixed_list_id`. Add `get_card(self, card_id: UUID, user_id: UUID) -> CardRecord | None` (select `CardModel` where `id == card_id AND user_id == user_id`, mirror `get_card_by_iban`'s shape). Add `update_routing(self, *, card_id: UUID, user_id: UUID, routing_mode: str, fixed_list_id: UUID | None) -> CardRecord`: fetch the same scoped row, set `row.routing_mode`/`row.fixed_list_id`, flush, return `_card_record(row)`.
  - [x] 4.5 `api/adapters/persistence/repositories.py`: `SqlAlchemyListRepository.get_card_for_owner` (used by Story 4.2's expense-origin path) also constructs a `CardRecord` — add `routing_mode=row.routing_mode, fixed_list_id=row.fixed_list_id` there too so both `CardRecord` construction sites stay consistent (the dataclass defaults from 4.1 mean this isn't strictly required to avoid a crash, but a stale/wrong value here would be a silent bug — set it from the row).
  - [x] 4.6 `api/tests/test_cards_application.py`: extend `_FakeCardRepo` with `get_card`/`update_routing`. Add a local `_FakeListLookup` (implements `get_list(list_id) -> object|None` with `.id`/`.owner_id`, `get_membership(list_id, user_id) -> object|None` with `.user_id`/`.role`) — do not import `test_list_access_domain.py`'s fakes across files, keep this file self-contained like it already is. Tests: fixed mode + actor is a member of the target list → succeeds, `fixed_list_id` stored; fixed mode + actor **not** a member → `NotListMemberError`, `update_routing` never called (assert on the fake); review mode with a stray `fixed_list_id` passed in → stored value is `None`; `card_id` not owned by `actor_user_id` (or nonexistent) → `CardNotFoundError`; `routing_mode` outside `{fixed, review}` → `InvalidCardRoutingModeError`, ACL/repo never touched (validate before any I/O).

- [x] Task 5: Application — `SetDefaultImportListService` (AC: #3)
  - [x] 5.1 `api/application/ports.py`: add `default_import_list_id: UUID | None = None` to `UserPreferencesRecord`. Add `default_import_list_id: UUID | None = None` and `clear_default_import_list_id: bool = False` params to `PreferencesRepository.update_preferences`, mirroring `last_opened_list_id`/`clear_last_opened_list_id` exactly (same positions, same style).
  - [x] 5.2 `api/application/lists.py`: add `SetDefaultImportListCommand(actor_user_id: UUID, list_id: UUID)` and `SetDefaultImportListService(list_repo: ListRepository, prefs_repo: PreferencesRepository)` — copy `SetLastOpenedListService` (lines ~371–387) verbatim except: ACL `action="set_default_import_list"`, and `self._prefs_repo.update_preferences(command.actor_user_id, default_import_list_id=command.list_id)`. Place it directly after `SetLastOpenedListService`.
  - [x] 5.3 `api/application/preferences.py`: add `default_import_list_id: UUID | None` to `MePreferencesResult`; in `_to_result()`, add `default_import_list_id=row.default_import_list_id`.
  - [x] 5.4 `api/adapters/persistence/repositories.py`: `_preferences_record()` — add `default_import_list_id=row.default_import_list_id`. `SqlAlchemyAuthUserRepository.update_preferences` — add `default_import_list_id: UUID | None = None, clear_default_import_list_id: bool = False` params; mirror the `last_opened_list_id`/`clear_last_opened_list_id` if/elif block for `row.default_import_list_id`; extend the existing `except IntegrityError` re-raise guard's condition (`if last_opened_list_id is not None:` → `if last_opened_list_id is not None or default_import_list_id is not None:`) so a bad FK on either field surfaces as `NotListMemberError`, not a raw DB error.
  - [x] 5.5 `api/tests/test_list_access_domain.py`: `FakePrefsRepo.update_preferences` — add `default_import_list_id`/`clear_default_import_list_id` params mirroring the `last_opened_list_id` handling already there. Add `test_set_default_import_list_non_member_denied`/`test_set_default_import_list_member_persists`, copying `test_set_last_opened_non_member_is_not_list_member`/`test_set_last_opened_member_persists` (lines ~229–258) structure with `SetDefaultImportListCommand`/`SetDefaultImportListService`.

- [x] Task 6: API — schemas + routes (AC: #1, #2, #3, #4)
  - [x] 6.1 `api/api/schemas/cards.py`: add `routing_mode: str` and `fixed_list_id: UUID | None = None` to `CardResponse`. Add `class SetCardRoutingBody(BaseModel): routing_mode: Literal["fixed", "review"]; fixed_list_id: UUID | None = None` (import `Literal` from `typing`).
  - [x] 6.2 `api/api/routes/cards.py`: `_card_response()` — add `routing_mode=card.routing_mode, fixed_list_id=card.fixed_list_id`. New route:
    ```
    @router.patch("/{card_id}/routing", response_model=CardResponse)
    def set_card_routing(card_id: uuid.UUID, body: SetCardRoutingBody, user_id=Depends(require_authenticated_user), db=Depends(get_db)) -> CardResponse | JSONResponse
    ```
    Build `SetCardRoutingService(SqlAlchemyCardRepository(db), SqlAlchemyListRepository(db))` — `SqlAlchemyListRepository` already implements `get_list`/`get_membership` (used elsewhere as `ListAccessLookup`), no new adapter needed; import it from `adapters.persistence.repositories`. Execute `SetCardRoutingCommand(actor_user_id=user_id, card_id=card_id, routing_mode=body.routing_mode, fixed_list_id=body.fixed_list_id)`. Error mapping: `InvalidCardRoutingModeError` → 422 `{"detail": str(exc), "code": "invalid_card_routing_mode"}`; `CardNotFoundError` → 404 `{"detail": str(exc), "code": "card_not_found"}`; `NotListMemberError` → 403 `{"detail": str(exc), "code": "not_list_member"}` (this file has no existing `_access_denied()` helper like `lists.py` — add a small local one or inline it, developer's call). `logger.info("card_routing_updated card_id=%s user_id=%s routing_mode=%s", result.id, user_id, result.routing_mode)` on success.
  - [x] 6.3 `api/api/schemas/auth.py`: add `default_import_list_id: UUID | None = None` to `MeResponse` and to `PatchMeBody`.
  - [x] 6.4 `api/api/routes/auth.py`: `_me_response()` — add `default_import_list_id=result.default_import_list_id`. `patch_current_user()` — mirror the existing `if body.last_opened_list_id is not None:` block: add `if body.default_import_list_id is not None: SetDefaultImportListService(SqlAlchemyListRepository(db), prefs).execute(SetDefaultImportListCommand(actor_user_id=user_id, list_id=body.default_import_list_id))` (import both from `application.lists`; place right after the `last_opened_list_id` block — both are independent ACL-gated preference writes, order between them doesn't matter). `NotListMemberError` is already caught by the existing `except NotListMemberError:` handler below — no new except clause needed. Extend the trailing log-guard: `if wrote_prefs or body.last_opened_list_id is not None or body.default_import_list_id is not None:`.
  - [x] 6.5 `ui`-facing BFF note (informational, no code change needed here): `ui/app/api/auth/me/route.ts`'s `PATCH` forwards the raw request body text verbatim to `/auth/me` — `default_import_list_id` flows through automatically, same as `last_opened_list_id` already does. **Do not modify this file.**
  - [x] 6.6 `api/tests/test_cards_integration.py`: add cases — `PATCH /cards/{id}/routing` with `{"routing_mode": "fixed", "fixed_list_id": <a list the user is a member of>}` → 200, response echoes both fields; same but the list belongs only to a second registered user (mirror `test_same_iban_different_users_both_succeed`'s sign-out/re-register pattern for the second user) → 403 `not_list_member`; `{"routing_mode": "review"}` after previously setting fixed mode → 200, `fixed_list_id: null`; unauthenticated → 401; unknown/foreign `card_id` → 404 `card_not_found`; `{"routing_mode": "bogus"}` → 422 `invalid_card_routing_mode`. Also assert `GET /cards`/`POST /cards` responses now include `routing_mode: "review"`, `fixed_list_id: null` by default on a freshly registered card.
  - [x] 6.7 `api/tests/test_lists_integration.py`: add `test_set_default_import_list_member_and_non_member`, copying `test_set_last_opened_list_member_and_non_member` (lines ~212–229) structure exactly against `PATCH /auth/me` with `{"default_import_list_id": ...}`, asserting the round trip via `GET /auth/me` and the 403 `not_list_member` denial for a non-member/nonexistent list id.

- [x] Task 7: UI — client helpers (AC: #1, #2, #3, #4)
  - [x] 7.1 `ui/app/cards/cardsClient.ts`: extend `CardItem` with `routing_mode: "fixed" | "review"`, `fixed_list_id: string | null`. In `asCard`, **do not** add these to the required-field validation block (same reasoning as Story 4.2's `origin_kind`/`origin_card_id` — keep older/partial cached responses parseable): `routing_mode: row.routing_mode === "fixed" ? "fixed" : "review"`, `fixed_list_id: typeof row.fixed_list_id === "string" ? row.fixed_list_id : null`. **Correction during implementation:** the three existing mock responses' *inputs* (lines ~25, ~121, ~143) stayed unchanged as predicted, but their `toEqual(...)` *assertions* on the parsed result needed `routing_mode: "review", fixed_list_id: null` added — `toEqual` is exact-shape, not subset, so a result with two extra defaulted keys fails against an expectation object that lacks them. Fixed inline.
  - [x] 7.2 Add `errorForbidden` and `errorCardNotFound` to `CardsClientMessages`. **Deviation:** made both **optional** (`?:`) rather than required — `ManualExpenseForm.tsx`/`NoOriginFilter.tsx` (Story 4.2) build inline `CardsClientMessages` object literals for their own `fetchCards()` calls that don't need these two fields; making them required would have forced unrelated edits to those two files. `mapError()` falls back to `messages.errorGeneric` when absent (same optional-field-with-fallback convention `ListsClientMessages` already uses for `errorInvalidEmail`/`errorAlreadyMember`/`errorSmtp`). Add `setCardRouting(cardId: string, body: { routing_mode: "fixed" | "review"; fixed_list_id: string | null }, messages: CardsClientMessages): Promise<{ ok: true; card: CardItem } | { ok: false; error: string }>` — `PATCH` to `` `/api/cards/${encodeURIComponent(cardId)}/routing` ``, same fetch/error shape as `registerCard`. Extend `mapError()`: `status === 403 || code === "not_list_member"` → `messages.errorForbidden ?? messages.errorGeneric`; `status === 404 || code === "card_not_found"` → `messages.errorCardNotFound ?? messages.errorGeneric`; `code === "invalid_card_routing_mode"` → fall through to `errorGeneric` (no dedicated field-level message needed, the UI prevents this state client-side per Task 8).
  - [x] 7.3 `ui/app/lists/listsClient.ts`: add `fetchLists(messages: ListsClientMessages): Promise<{ ok: true; lists: ListItem[] } | { ok: false; error: string }>` — `GET /api/lists`, mirror `fetchCards`'s shape exactly (this BFF route already exists and already returns `{lists: [...]}`, used server-side today by `ui/app/home/page.tsx` — this just adds the client-side wrapper, no backend/BFF change). Add `setDefaultImportList(listId: string, messages: ListsClientMessages): Promise<{ ok: true } | { ok: false; error: string }>` — copy `setLastOpenedList` verbatim except the PATCH body is `{ default_import_list_id: listId }`.
  - [x] 7.4 New BFF route `ui/app/api/cards/[cardId]/routing/route.ts`: `PATCH` handler, copy `ui/app/api/lists/[listId]/expenses/[entryId]/origin/route.ts`'s `PATCH` handler shape exactly (`forwardCookie`, 400 `invalid_body` on bad JSON, 502 `bad_gateway` on fetch failure, `cache: "no-store"`), proxying to `` `${getApiInternalUrl()}/cards/${cardId}/routing` ``.
  - [x] 7.5 `ui/app/lists/listsClient.test.ts`: add cases for `fetchLists` (success shape, error mapping) and `setDefaultImportList` (PATCH body shape, success, 403 mapping) — mirror this file's existing `setLastOpenedList`/list-fetch test conventions.
  - [x] 7.6 `ui/app/cards/cardsClient.test.ts`: add cases for `setCardRouting` — success (fixed + list id), success (review, `fixed_list_id: null`), 403 → `errorForbidden`, 404 → `errorCardNotFound`.

- [x] Task 8: UI — per-card routing control + default destination selector (AC: #1, #2, #3, #4)
  - [x] 8.1 `ui/lib/i18n/cards.ts`: add EN+ES keys to both locale blocks: `routingTitle` ("Routing" / "Enrutamiento"), `routingModeFixed` ("Fixed list" / "Lista fija"), `routingModeReview` ("Review each import" / "Revisar cada importación"), `routingListLabel` ("Destination list" / "Lista destino"), `routingSave` ("Save" / "Guardar"), `routingSaving` ("Saving…" / "Guardando…"), `defaultListTitle` ("Default review destination" / "Destino de revisión por defecto"), `defaultListHint` ("Low-effort review accepts land here." / "Las revisiones rápidas llegan aquí."), `errorForbidden` ("You don't have access to that list." / "No tienes acceso a esa lista."), `errorCardNotFound` ("Card not found." / "Tarjeta no encontrada.").
  - [x] 8.2 New component `ui/app/cards/CardRoutingControl.tsx` (`"use client"`, Tailwind utilities co-located — Epic 3.5 convention, no new `.module.scss`). Props: `card: CardItem`, `lists: ListItem[]`, `messages` (new `CardRoutingMessages` type: `CardsClientMessages & {routingModeFixed, routingModeReview, routingListLabel, routingSave, routingSaving}`), `onUpdated: (card: CardItem) => void`. Local state: `mode` initialized from `card.routing_mode`, `fixedListId` initialized from `card.fixed_list_id ?? ""`. Two `SoftLedgerRadio` options (shared `name` per instance via `useId()`) for Fixed/Review. When `mode === "fixed"`, render a `SoftLedgerSelect` (options from `lists.map(l => ({value: l.id, label: l.name}))`) bound to `fixedListId`. Use `useFormSubmission` (mirror `RegisterCardForm.tsx`'s usage) wrapping `setCardRouting`; Save button `disabled={pending || (mode === "fixed" && !fixedListId)}`; on success call `onUpdated(result.card)`.
  - [x] 8.3 New component `ui/app/cards/DefaultImportListControl.tsx` (`"use client"`). Props: `lists: ListItem[]`, `messages` (`{defaultListTitle, defaultListHint, errorGeneric, errorUnauthorized, errorForbidden}`). On mount, `fetch("/api/auth/me")` directly (do not extend `PreferencesProvider`'s global `MePreferences` type for this one field — keep blast radius to this component) to read `default_import_list_id`; store in local state. A single `SoftLedgerSelect` bound to that state; **auto-save on change** (mirror `AccountMenu.tsx`'s `setLanguage`/`setTheme` interaction — no separate Save button) calling `setDefaultImportList(nextListId, messages)`; show an inline error (`role="alert"`) on failure, matching `RegisterCardForm`'s error `<div aria-live="polite">` pattern.
  - [x] 8.4 `ui/app/cards/CardsPanel.tsx`: on mount, also call `fetchLists()` (alongside the existing `fetchCards()` — `Promise.all` or sequential, developer's call) and store `lists` state. Inside each card `<li>`, render `<CardRoutingControl card={card} lists={lists} messages={...} onUpdated={(updated) => setCards(prev => prev.map(c => c.id === updated.id ? updated : c))} />` below the existing label/IBAN row. Add a new section (after the "Your cards" section, before "Register card") rendering `<DefaultImportListControl lists={lists} messages={...} />` — this is a page-level setting, not per-card, so it belongs alongside the cards list rather than nested in one row.
  - [x] 8.5 New test `ui/app/cards/CardRoutingControl.test.tsx` (mirror `RegisterCardForm.test.tsx`'s `vi.mock("./cardsClient", ...)` convention): defaults to the card's current mode/list; switching to Fixed disables Save until a list is chosen; Save in Fixed mode calls `setCardRouting` with `{routing_mode: "fixed", fixed_list_id}`; switching to Review then Save calls with `{routing_mode: "review", fixed_list_id: null}`; a 403 error surfaces via the error region.
  - [x] 8.6 New test `ui/app/cards/DefaultImportListControl.test.tsx`: mocks `fetch("/api/auth/me")` and `setDefaultImportList`; renders the current default; changing the select fires `setDefaultImportList` immediately (no Save click needed); a failure surfaces an inline error.

- [x] Task 9: Story-close overview (required before `done` — see Dev Notes)

## Dev Notes

### Why the default `routing_mode` is `"review"`, not `"fixed"`

AC #4 / FR-11's "does not silently assume always-personal-list" rules out any default that pre-selects a specific list. `"review"` with no `fixed_list_id` is the only default that commits to nothing — it defers the destination choice to actual review time (a future story). This also means **existing Story-4.1 cards** (created before this migration) backfill to `routing_mode = "review"` via the column's `server_default` — they are not silently fixed to any list either. This is a judgment call; flag in Completion Notes if you take a different view, but do not ship a default that assumes personal-list.

### Hexagonal placement (AD-1) — same boundaries as Stories 4.1/4.2

- `domain/cards.py` / `domain/list_access.py`: pure validation + ACL vocabulary, no DB/HTTP imports.
- `application/cards.py`: `SetCardRoutingService` composes a `CardRepository` (cards table) **and** a `ListAccessLookup` (from `application.list_access`, already implemented by `SqlAlchemyListRepository`) — two ports into one service, same multi-port-injection pattern `SetLastOpenedListService` already uses (`list_repo` + `prefs_repo`). Do not invent a new combined repository type.
- `application/lists.py`: `SetDefaultImportListService` — same two-port shape as `SetLastOpenedListService`, sitting right next to it.
- `adapters/persistence/{cards.py,repositories.py}`: `SqlAlchemyCardRepository` gets new `get_card`/`update_routing` methods (cards-table writes); `SqlAlchemyAuthUserRepository.update_preferences` gets the new preference field (mirrors `last_opened_list_id` exactly); `SqlAlchemyListRepository` needs **no new methods** — it already implements `get_list`/`get_membership` (the `ListAccessLookup` shape) from Story 2.2.
- `api/routes/cards.py` + `api/schemas/cards.py`: one new route on the existing Cards resource. `api/routes/auth.py` + `api/schemas/auth.py`: one new field on the existing `/auth/me` resource (same pattern as `last_opened_list_id`). No new router file.
- `ui` → HTTP only via `/api/cards/[cardId]/routing` (new) and the existing `/api/auth/me` (unchanged, verbatim body passthrough) and `/api/lists` (new client wrapper on an already-existing BFF route) BFF routes.

### Files you will modify (read fully before editing)

- `api/application/lists.py` (already 480+ lines, several service classes) — your addition (`SetDefaultImportListCommand`/`Service`) goes immediately after `SetLastOpenedListService` (~line 387). Do not touch `RenameListService`, `DeleteListService`, default-split services, or balances/expenses stubs in this file.
- `api/application/cards.py` — currently only Story 4.1's three services. Your `SetCardRoutingCommand`/`Service` is new; `CardRecord`/`CardRepository` get extended, not replaced.
- `api/adapters/persistence/repositories.py` (600+ lines, three classes: `SqlAlchemySignupRepository`, `SqlAlchemyAuthUserRepository`, `SqlAlchemyListRepository`) — edits touch `SqlAlchemyAuthUserRepository.update_preferences`/`_preferences_record` and `SqlAlchemyListRepository.get_card_for_owner` only. Do not touch membership/split/expense methods.
- `api/api/routes/auth.py` — `patch_current_user` already has a specific ordering comment about prefs-before-alias (read it); your `default_import_list_id` block slots in next to the existing `last_opened_list_id` block, same section.
- `ui/app/cards/CardsPanel.tsx` — currently a single client component doing one `fetchCards()` on mount and rendering two sections (list, register form). You're adding a second fetch (`fetchLists`) and a third section (`DefaultImportListControl`) plus per-row routing controls — keep the existing `embedded` prop behavior (used by `/home`) working unchanged.

### What NOT to build (explicit scope fences)

- No upload/import/review UI or endpoints (Stories 4.4–4.9) — this story only persists the two settings.
- No card-registration-flow changes — routing is configured strictly after registration, on the Cards management page (`CardsPanel`), per EXPERIENCE.md.
- No "multiple fixed lists per card" — the schema is deliberately a single nullable `fixed_list_id` column (naturally enforces "at most one"); FR-11 notes the design "must not foreclose" multiple later, which a single-column-today, migrate-later approach satisfies without over-building now.
- No change to `ui/app/api/auth/me/route.ts` (Task 6.5) — it already passes the body through verbatim.
- `PreferencesProvider`'s global `MePreferences` type/context is untouched — `DefaultImportListControl` does its own scoped `/api/auth/me` fetch rather than extending a context used app-wide, to keep this story's blast radius contained to the Cards page.

### Testing Requirements (project-context "Discipline" + "Layers")

- Domain: pure unit tests, no DB (Tasks 1.4, 2.2) — extend `test_cards_domain.py` and `test_list_access_domain.py`, do not create new domain test files.
- Application: unit tests with fakes, no DB (Tasks 4.6, 5.5) — extend `test_cards_application.py` (mirrors its own existing `_FakeCardRepo` pattern, add a local ACL fake) and `test_list_access_domain.py` (extend `FakePrefsRepo`, mirror the `set_last_opened_list` test pair).
- Integration: Postgres 16 via `DATABASE_URL`-gated `TestClient` tests (Tasks 6.6, 6.7) — extend `test_cards_integration.py` and `test_lists_integration.py`, not new files. Reuse the existing sign-out/re-register multi-user pattern already in `test_cards_integration.py` for the non-member-list 403 case.
- UI: two new co-located component test files (Tasks 8.5, 8.6) plus additions to the two existing client-test files (`cardsClient.test.ts`, `listsClient.test.ts`) — no new client-test files needed, both already exist.
- No `Decimal`/money assertions needed — this story touches no monetary fields.

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `4-2-manual-origin-card-cash-blank-no-origin-filter.md`'s Completion Notes for the expected format.

### Project Structure Notes

- No conflicts detected with the unified project structure. This story extends two existing bounded concerns (Cards — Story 4.1; account preferences — Story 1.6/2.x) rather than creating a new one. Two new UI components (`CardRoutingControl.tsx`, `DefaultImportListControl.tsx`) sit alongside `RegisterCardForm.tsx` in `ui/app/cards/`, following that file's structure.
- Migration numbering: next revision is `0015` (`0014_ledger_origin.py` was Story 4.2's, already merged) — do not reuse `0014`.
- `cards.fixed_list_id` and `users.default_import_list_id` are separate FKs to `lists.id` with independent `ON DELETE SET NULL` semantics — a list deletion (no story builds cascading UX for this yet, same class of latent gap Story 4.2 flagged for `origin_card_id`) silently clears either back to a safe null/review state; not a bug to fix in this story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3: Card routing mode + review default list] — ACs, story statement.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-11: Card-to-list association chosen at import] — fixed-list vs review-routing, "at most one active fixed list per card," "must not foreclose multiple fixed lists per card later."
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-12: Configurable review default destination] — default may be personal or any list the user belongs to; explicit choice and skip remain available regardless of the default.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-16: Choose card routing mode] — fixed-list commits subject to parse success; review-routing proceeds to bulk/individual review before commit (future stories).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md] lines 84, 231, 259 — "Fixed card→list routing is after this prompt, not inside it"; "Card→list fixed-routing UI after J6 (after registration; not journeyed as its own flow)" — confirms no dedicated visual spec exists, reuse existing form/select/radio primitives (same situation Story 4.1/4.2 hit).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md] line 113 — "Individual review: swipe primary — right → chosen list (list picker first), left → configurable default list, down → skip" — confirms `default_import_list_id` is the setting that future Individual-review swipe-left will read (not built in this story).
- [Source: api/application/lists.py#SetLastOpenedListService, api/application/list_access.py, api/domain/list_access.py] — the exact ACL + two-port-service pattern this story's two new services (`SetCardRoutingService`, `SetDefaultImportListService`) copy.
- [Source: api/application/expenses.py#_reject_unowned_card_origin, api/adapters/persistence/repositories.py#get_card_for_owner] — Story 4.2's precedent for a `CardRecord` construction site outside `adapters/persistence/cards.py` that this story must also keep in sync (Task 4.5).
- [Source: _bmad-output/implementation-artifacts/4-1-register-and-match-cards-by-iban.md, 4-2-manual-origin-card-cash-blank-no-origin-filter.md] — Cards/expenses domain, application, persistence, and UI patterns reused throughout (`ListCardsService`, `fetchCards()`, `SoftLedgerSelect`/`SoftLedgerRadio`, `useFormSubmission`).
- [Source: _bmad-output/project-context.md] — money/Decimal (N/A here), snake_case wire, i18n per-domain TS files (EN+ES both blocks), no new CSS Modules (Epic 3.5 — Tailwind utilities co-located), generic vocabulary, membership ACL over ownership for "list I belong to," testing layers/discipline rules (all cited inline above where applied).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- API pytest requires the `--group dev` image (prod image has no pytest). `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --build api` stalls on the `db` healthcheck (same `interval: 1h` issue Story 4.2 hit) — worked around identically: `docker compose -f docker-compose.yml -f docker-compose.test.yml build api` to build, then `docker run --network <worktree>_internal -v ./api/tests:/app/tests <image> pytest -q` to run against the already-running Compose `db`. Note the Dockerfile does not `COPY tests` — the `-v tests:/app/tests` mount is required every run, not just once.
- Migration 0015 verified both directions (`alembic upgrade head` / `downgrade -1` / `upgrade head`) against the live Compose Postgres via `docker exec` into the running `api` container (bind-mounted source, no rebuild needed for that check).

### Completion Notes List

- All 9 tasks complete, TDD red→green per task: domain (11 new tests: 6 routing-validation + additions), ACL vocabulary (4 new domain-action tests + 2 new full-service tests), application (5 new `SetCardRoutingService` tests + 2 new `SetDefaultImportListService` tests), persistence (migration verified up/down against Postgres 16), API (8 new card-routing integration tests + 1 new default-import-list integration test), UI (2 new component test files — `CardRoutingControl.test.tsx` 5 cases, `DefaultImportListControl.test.tsx` 3 cases — plus additions to both existing client-test files).
- Final regression: `api` 381 passed (0 failed) — fresh Docker image rebuild confirmed, not a stale-image false-positive (see Debug Log). `ui` 209 passed, `tsc --noEmit` clean, `eslint .` clean (0 errors, 4 pre-existing unrelated warnings). `ruff check .` / `ruff format --check .` clean.
- Two deliberate deviations from the story's original plan, both documented inline at Task 7.1/7.2: (1) `cardsClient.test.ts`'s three pre-existing `toEqual(...)` assertions needed `routing_mode`/`fixed_list_id` added to their *expected* objects — `toEqual` is exact-shape not subset, so a parsed result with two new defaulted keys fails against an expectation that lacks them; the *mock inputs* did stay unchanged as planned. (2) `CardsClientMessages.errorForbidden`/`errorCardNotFound` were made optional (with `?? errorGeneric` fallback in `mapError`) rather than required, to avoid forcing edits to Story 4.2's `ManualExpenseForm.tsx`/`NoOriginFilter.tsx` (both build inline `CardsClientMessages` literals for their own unrelated `fetchCards()` calls) — mirrors the existing optional-field-with-fallback convention already used on `ListsClientMessages`.
- Per Dev Notes "Why the default `routing_mode` is `review`": followed as written — no deviation. `cards.routing_mode` defaults to `"review"` (both Python-side `default=` and DB `server_default=`), `fixed_list_id`/`default_import_list_id` default to `NULL`; existing Story-4.1 cards backfill to review mode via the migration's `server_default`.
- Scope fences from Dev Notes ("What NOT to build") were honored: no upload/import/review pipeline UI or endpoints; `RegisterCardForm`/`RegisterCardService` untouched; `ui/app/api/auth/me/route.ts` untouched (verbatim body passthrough already carries `default_import_list_id`); `PreferencesProvider`'s global `MePreferences` context untouched — `DefaultImportListControl` does its own scoped `/api/auth/me` fetch.

## Story-close overview — 4-3-card-routing-mode-review-default-list

**Request path:**
Browser → `ui` `CardsPanel` → `CardRoutingControl`/`DefaultImportListControl` (client components) → same-origin BFF (`/api/cards/{cardId}/routing` new, `/api/auth/me` existing, `/api/lists` new client wrapper on an existing BFF route) → `api` `PATCH /cards/{card_id}/routing` / `PATCH /auth/me` (`require_authenticated_user`) → `SetCardRoutingService` / `SetDefaultImportListService` → `domain/cards.py` (`validate_card_routing`) + `AuthorizeListAccessService` (`route_card_to_list` / `set_default_import_list` — membership ACL, Story 2.2's port) → `SqlAlchemyCardRepository.update_routing` / `SqlAlchemyAuthUserRepository.update_preferences` → Postgres `cards.routing_mode`/`cards.fixed_list_id` / `users.default_import_list_id` (both FK → `lists.id`, `ON DELETE SET NULL`).

**Key components:**
`api/domain/{cards.py,list_access.py,errors.py}` (`validate_card_routing`, `route_card_to_list`/`set_default_import_list` ACL actions, `InvalidCardRoutingModeError`/`CardNotFoundError`), `api/application/{cards.py,lists.py,ports.py,preferences.py}` (`SetCardRoutingService`, `SetDefaultImportListService`), `api/adapters/persistence/{cards.py,repositories.py,models.py}`, `api/adapters/persistence/migrations/versions/0015_card_routing.py`, `api/api/{schemas,routes}/{cards.py,auth.py}` (new `PATCH /cards/{id}/routing`, extended `/auth/me`); `ui/app/cards/{cardsClient.ts,CardRoutingControl.tsx,DefaultImportListControl.tsx,CardsPanel.tsx}`, `ui/app/lists/listsClient.ts` (`fetchLists`, `setDefaultImportList`), `ui/app/api/cards/[cardId]/routing/route.ts`, `ui/lib/i18n/cards.ts`.

**Why this shape:**
Two independent settings — per-card routing mode (cards-table field) and a global default-import-list preference (users-table field, sibling to `last_opened_list_id`) — reusing Story 2.2's `AuthorizeListAccessService`/`ListAccessLookup` port rather than inventing new ACL plumbing (`SetCardRoutingService` composes a `CardRepository` **and** a `ListAccessLookup`, the same multi-port shape `SetLastOpenedListService` already established for `SetDefaultImportListService`). `routing_mode` defaults to `"review"` (never a specific list) because FR-11/AC #4 explicitly forbid a default that silently assumes "always personal list" — a single nullable `fixed_list_id` column naturally enforces "at most one active fixed list per card" (AC #1) without a separate table.

**What not to break:**
- This story is **configuration only** — no upload/review/commit pipeline exists yet (Stories 4.4–4.9 build on top of `routing_mode`/`fixed_list_id`/`default_import_list_id`, but don't consume them until then).
- `"fixed"` mode always requires a `fixed_list_id`; `"review"` mode always **clears** it (`domain.cards.validate_card_routing` forces this even if a caller passes a stray value) — never let a card have a non-null `fixed_list_id` while in review mode.
- Fixed-list/default-list ACL is **membership**, not ownership (`route_card_to_list`/`set_default_import_list` are member-mutation actions) — do not tighten this to an owner-only check later without re-reading FR-11/FR-12's "a list I belong to" wording.
- `CardsClientMessages.errorForbidden`/`errorCardNotFound` are optional with an `errorGeneric` fallback — existing `fetchCards()` callers (`ManualExpenseForm.tsx`, `NoOriginFilter.tsx`, Story 4.2) don't supply them and must keep working unchanged.
- `ui/app/api/auth/me/route.ts` forwards the PATCH body verbatim — do not add per-field handling there; new preference fields on `PatchMeBody`/`MeResponse` flow through automatically.

### File List

**New:**
- `api/adapters/persistence/migrations/versions/0015_card_routing.py`
- `ui/app/api/cards/[cardId]/routing/route.ts`
- `ui/app/cards/CardRoutingControl.tsx`
- `ui/app/cards/CardRoutingControl.test.tsx`
- `ui/app/cards/DefaultImportListControl.tsx`
- `ui/app/cards/DefaultImportListControl.test.tsx`

**Modified:**
- `api/domain/cards.py`
- `api/domain/errors.py`
- `api/domain/list_access.py`
- `api/tests/test_cards_domain.py`
- `api/tests/test_list_access_domain.py`
- `api/tests/test_cards_application.py`
- `api/adapters/persistence/models.py`
- `api/application/cards.py`
- `api/application/lists.py`
- `api/application/ports.py`
- `api/application/preferences.py`
- `api/adapters/persistence/cards.py`
- `api/adapters/persistence/repositories.py`
- `api/api/schemas/cards.py`
- `api/api/routes/cards.py`
- `api/api/schemas/auth.py`
- `api/api/routes/auth.py`
- `api/tests/test_cards_integration.py`
- `api/tests/test_lists_integration.py`
- `ui/app/cards/cardsClient.ts`
- `ui/app/cards/cardsClient.test.ts`
- `ui/app/lists/listsClient.ts`
- `ui/app/lists/listsClient.test.ts`
- `ui/lib/i18n/cards.ts`
- `ui/app/cards/CardsPanel.tsx`

## Change Log

- 2026-08-16: Story implemented via `bmad-dev-story` — all 9 tasks complete; domain/persistence/application/API/UI slices for card routing mode (fixed-list vs review-routing) + configurable review default destination list; 381 api tests passing (incl. ~28 new), 209 ui tests passing (incl. 8 new); status → review
