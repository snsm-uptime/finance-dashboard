# Story 4.1: Register and match cards by IBAN

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a signed-in user,
I want cards keyed by IBAN with my own labels,
So that imports recognize my cards and show my names — not bank product codes.

## Acceptance Criteria

1. **Given** a statement yields an IBAN that matches a card I already registered, **when** import proceeds, **then** the system uses that card and its label as the human import identifier — no re-registration prompt. (FR-37, AD-20)
2. **Given** a statement yields an IBAN I have not registered, **when** import reaches card identity, **then** a registration prompt blocks review until I save a user-chosen label + IBAN, **and** fixed card→list routing is configured after this prompt, not inside it. (FR-37, AD-20; routing UI itself is Story 4.3 — out of scope here)
3. **Given** card registry data, **when** stored or displayed, **then** vocabulary is user-scoped and generic — no hardcoded personal card names in code. (NFR-2)

## Scope Note (read before starting)

This is the **first** story in Epic 4. The upload/parse pipeline (Stories 4.4–4.9) does not exist yet, so AC #1 and #2 cannot be wired into a live import flow in this story. This story delivers the **foundation** the later import stories will call:

- Domain + persistence + application services for registering a card and matching an IBAN to an existing card (the logic behind AC #1 and #2).
- A standalone **Cards** management page (reachable from Account) where the user can view registered cards and register a new one by label + IBAN — this is the concrete UI for AC #2's "registration prompt... save a user-chosen label + IBAN" until Story 4.6+ triggers the same flow mid-import.
- `MatchCardByIbanService` is the extension point Story 4.6 ("Upload PDF → detect/split → Import Session") will call in-process to decide "known card, use its label" (AC #1) vs. "unknown IBAN, block review" (AC #2). Do not build any upload/parse/review UI in this story — that is out of scope.
- Fixed-list vs. review-routing configuration (mentioned in AC #2) is Story 4.3. Do not build routing UI here — just make sure nothing you build forecloses it (e.g., do not silently default new cards to any list).

`ledger_entries.product_id` already exists as an unused nullable UUID column reserved for Epic 4 (see `api/adapters/persistence/models.py:274-275`, comment: *"Import stubs — no FK; cards/origin land in Epic 4 (do not add origin_* here)"*). **Do not** add a FK from `ledger_entries` to `cards` in this story — that wiring belongs to whichever later story actually attaches cards to ledger rows (4.2 origin / 4.6-4.9 import). This story only creates the `cards` table and its own repository/service/route/UI slice.

## Tasks / Subtasks

- [ ] Task 1: Domain — card validation + errors (AC: #2, #3)
  - [ ] 1.1 Add `api/domain/cards.py`: `validate_card_label(raw: str) -> str` (trim; reject empty/whitespace-only; cap length — mirror `domain/lists.py::validate_list_name` shape) and `normalize_iban(raw: str) -> str` (trim, uppercase, strip internal whitespace; reject empty after normalize). Do **not** enforce ISO 13616 IBAN checksum/country-prefix validation — FR-37 explicitly allows "IBAN (or equivalent account/card identifier extracted from the statement)", so treat it as an opaque matching string, not a strict IBAN.
  - [ ] 1.2 Add to `api/domain/errors.py`: `InvalidCardLabelError`, `InvalidCardIbanError`, `CardIbanAlreadyRegisteredError` (include the existing card's label in the message so the UI can say "You already have a card named X with this IBAN") — follow the existing `DomainError` subclass shape (message + optional `CODE` class attr, see `InvalidListNameError` / `AlreadyListMemberError`).
  - [ ] 1.3 `api/tests/test_cards_domain.py`: label trim/empty/whitespace/max-length; IBAN normalize (case, internal spaces) and empty-after-normalize rejection.

- [ ] Task 2: Persistence — `CardModel` + migration + repository (AC: #1, #2, #3)
  - [ ] 2.1 `api/adapters/persistence/models.py`: add `CardModel` (`__tablename__ = "cards"`) with `id: UUID PK`, `user_id: UUID FK users.id ondelete=CASCADE`, `label: String(100)`, `iban: String(64)` (generous headroom past ISO 13616's 34-char max, since FR-37 allows non-IBAN identifiers), `created_at` (`server_default=func.now()`), `__table_args__ = (UniqueConstraint("user_id", "iban", name="uq_cards_user_iban"),)` — uniqueness is **per-user**, not global, so two household members can each register a card on a shared account under their own label. Add `cards: Mapped[list[CardModel]] = relationship(back_populates="owner")` to `UserModel` and the matching `owner` relationship on `CardModel`, consistent with `owned_lists`/`memberships`.
  - [ ] 2.2 Alembic migration `api/adapters/persistence/migrations/versions/0013_cards.py` (`down_revision = "0012_ledger_fx_fields"`): create `cards` table + the unique index. Follow `0012_ledger_fx_fields.py`'s docstring/header format.
  - [ ] 2.3 New file `api/adapters/persistence/cards.py`: `SqlAlchemyCardRepository` implementing the `CardRepository` protocol from Task 3 — mirror `SqlAlchemyListRepository` in `repositories.py` for session/`begin_nested()`/`IntegrityError → CardIbanAlreadyRegisteredError` conventions (see `repositories.py:186-213`). This is a new bounded-concern file, not an addition to `repositories.py` — matches how `list_invite.py`/`password_reset.py`/`token_claim.py` each got their own adapter file rather than growing the shared one.

- [ ] Task 3: Application — register / match / list services (AC: #1, #2)
  - [ ] 3.1 `api/application/cards.py`: `CardRecord` (`id, user_id, label, iban, created_at`), `CardRepository` Protocol (`create_card`, `get_card_by_iban(user_id, iban_normalized)`, `list_cards_for_user(user_id)` — newest-first ordering owned by the repo), and:
    - `RegisterCardService` (`RegisterCardCommand(actor_user_id, label, iban)`): validates via `domain/cards.py`, checks `get_card_by_iban` for a pre-existing match for this user and raises `CardIbanAlreadyRegisteredError` if found (registration is not idempotent — the caller should have used the match path first), else creates and returns the new `CardRecord`.
    - `MatchCardByIbanService` (`MatchCardByIbanCommand(actor_user_id, iban)`): normalizes the IBAN and returns `CardRecord | None` via `get_card_by_iban`. **This is the AC #1/#2 decision point** — Story 4.6+ will call this per statement: hit → use the card's label (AC #1); miss → surface the registration prompt (AC #2). No HTTP route for this in this story (detect/parse/match all run in-process per AD-2 — see Dev Notes).
    - `ListCardsService` (`ListCardsCommand(actor_user_id)`): returns the user's cards, newest-first, for the management page.
  - [ ] 3.2 `api/tests/test_cards_application.py` (unit, fake repo — mirror `test_preferences_application.py`'s `_FakeRepo` pattern): register success; register duplicate IBAN for same user → `CardIbanAlreadyRegisteredError`; same IBAN registered by two different `user_id`s both succeed (per-user uniqueness); match hit/miss; list ordering.

- [ ] Task 4: API — routes + schemas (AC: #1, #2, #3)
  - [ ] 4.1 `api/api/schemas/cards.py`: `RegisterCardBody(label: str, iban: str)`, `CardResponse(id, label, iban, created_at)`, `CardsListResponse(cards: list[CardResponse])` — follow `schemas/lists.py` field-length capping pattern (`Field(max_length=...)` sourced from the domain constant, not a magic number).
  - [ ] 4.2 `api/api/routes/cards.py`: `router = APIRouter(prefix="/cards", tags=["cards"])`.
    - `GET ""` → `ListCardsService`, `200` `CardsListResponse`.
    - `POST ""` → `RegisterCardService`, `201` `CardResponse`; map `InvalidCardLabelError`/`InvalidCardIbanError` → `422` (`code: "invalid_card_label"` / `"invalid_card_iban"`), `CardIbanAlreadyRegisteredError` → `409` (`code: "card_iban_already_registered"`), following the `JSONResponse(status_code=..., content={"detail": str(exc), "code": ...})` shape used throughout `routes/lists.py`.
    - Both routes take `user_id: uuid.UUID = Depends(require_authenticated_user)` inline (no router-level `require_user_alias` dependency — see Dev Notes "Alias gating" below).
    - `logger.info("card_registered card_id=%s user_id=%s", ...)` on successful register, matching the `list_created`/`list_renamed` logging convention.
  - [ ] 4.3 `api/api/app.py`: import and `application.include_router(cards_router)` — add it near `invites_router` (ungated group), not inside the `require_user_alias` block.
  - [ ] 4.4 `api/tests/test_cards_integration.py` (Postgres, `DATABASE_URL`-skipped like `test_lists_integration.py`): unauthenticated → `401`; register → `201` + row visible in `GET /cards`; duplicate IBAN same user → `409`; same IBAN different users → both `201`; blank label / blank IBAN → `422`; label/IBAN with only whitespace → `422`.

- [ ] Task 5: UI — Cards page, register form, BFF proxy, i18n (AC: #2, #3)
  - [ ] 5.1 `ui/app/api/cards/route.ts`: `GET`/`POST` same-origin BFF proxy to `${getApiInternalUrl()}/cards`, forwarding the session cookie — copy `ui/app/api/lists/route.ts`'s `forwardCookie`/error-mapping/`cache: "no-store"` shape exactly (including the 502 `bad_gateway` fallback on fetch failure and 400 `invalid_body` on unparsable JSON).
  - [ ] 5.2 `ui/app/cards/cardsClient.ts`: `fetchCards()` and `registerCard(label, iban, messages)` client helpers — mirror `ui/app/lists/listsClient.ts`'s `mapError` (401 → unauthorized, 422 + `invalid_card_label`/`invalid_card_iban` → per-field errors, 409 + `card_iban_already_registered` → duplicate message) and `parseJson`/`Ok*`/`ErrorResult` result-type conventions.
  - [ ] 5.3 `ui/lib/i18n/cards.ts`: new domain i18n file, `cardsMessages` EN+ES object + `cardsCopy(locale)` accessor — same shape as `ui/lib/i18n/account.ts`. Keys needed: `title`, `subtitle`, `labelField`, `ibanField`, `submit`, `submitting`, `emptyState`, `listTitle`, `errorGeneric`, `errorUnauthorized`, `errorInvalidLabel`, `errorInvalidIban`, `errorDuplicateIban`, `backToAccount`.
  - [ ] 5.4 `ui/app/cards/RegisterCardForm.tsx` (`"use client"`): two-field form (label, IBAN) using `useFormSubmission` — mirror `ui/app/lists/InviteForm.tsx`'s structure (controlled inputs, `pending`/`error`/`clearError`, `aria-live` error slot). Use Tailwind utility classes co-located (per Epic 3.5 lock-in — **no new `*.module.css`/`*.module.scss` for this**; follow `AccountMenu.tsx`'s inline-Tailwind style, not `lists.module.scss`'s class-based style, since this is a new surface, not a migration of an existing CSS-Modules file).
  - [ ] 5.5 `ui/app/cards/CardsPanel.tsx` (`"use client"`): fetches cards on mount, renders the list (label + masked/plain IBAN — no design spec exists for card rows, use existing list-row conventions from `ListsPanel.tsx` for visual consistency) plus `RegisterCardForm`. Empty state uses `emptyState` copy.
  - [ ] 5.6 `ui/app/cards/page.tsx` (Server Component): SSR auth gate identical to `ui/app/account/page.tsx` (`fetchSession` → redirect to `/sign-in?returnTo=/cards` if absent), then render `CardsPanel`. Do **not** gate on alias — see Dev Notes.
  - [ ] 5.7 `ui/components/AccountMenu.tsx`: add a nav entry to `/cards` (new section, e.g. below Password reset) using a new `manageCards` key in `ui/lib/i18n/account.ts` (EN: "Manage cards", ES: "Administrar tarjetas").
  - [ ] 5.8 Tests: `ui/app/cards/cardsClient.test.ts` (mirror `listsClient.test.ts`), `ui/app/cards/RegisterCardForm.test.tsx` (mirror `InviteForm.test.tsx` — submit success, validation error, duplicate error, disabled-while-pending).

- [ ] Task 6: Story-close overview (required before `done` — see Dev Notes)

## Dev Notes

### Alias gating (judgment call — flag if you disagree)

`lists_router`/`splits_router` are gated with `dependencies=[Depends(require_user_alias)]` at the router level in `app.py` because "list surfaces need a person label" (roster names). `invites_router` is deliberately left off that gate ("invites/auth stay open so the alias can be claimed"). Cards are a **personal** resource, not a list-roster surface, and nothing in FR-37/AD-20 requires an alias to register a card. This story gates `cards_router` on `require_authenticated_user` only, **not** `require_user_alias`. By the time card→list routing exists (Story 4.3), that story's list-access checks will already require alias. If you think cards should be alias-gated for consistency instead, that's a reasonable alternate call — just be consistent between the API gate and the UI page gate (`ui/app/cards/page.tsx` should not call `requireAlias` either, matching whichever choice you make).

### Forward note for whoever builds the origin "chip" (Story 4.2 / 4.6-4.9 — not this story)

Confirmed with Sebas (2026-08-14): a transaction always belongs to exactly one **List** (for splitting/sharing), and can additionally carry a reference back to the **Card** it came from, shown as a "chip" on the shared-expenses row. Two things to get right when that lands:

- **`ledger_entries.product_id` is NOT the card reference.** It's the bank *adapter's* product code (`{bank, product_id, account_kind}` — FR-31/FR-32, used for parsing + dedup identity). Whoever wires origin/chip needs a **separate** `card_id`/`origin_card_id` column. Do not repurpose `product_id`.
- **Card labels are private to their owner.** When a list member who does *not* own the card views a shared list, the chip shows that transaction's payer/card-owner **alias**, not the card's actual label. Only the card's own owner sees their card's real label on the chip. Story 4.1's API already enforces this implicitly (`ListCardsService`/`get_card_by_iban` are always scoped to `actor_user_id` — there is no endpoint in this story that lets one user read another user's card), but the future chip-rendering story must not introduce a cross-user card-label lookup that breaks this.

This story (4.1) does not implement the chip, the `card_id` column, or any cross-user card visibility — flagging so it isn't lost by the time 4.2/4.6-4.9 start.

### Hexagonal placement (AD-1)

- `domain/cards.py`: pure validation, no imports outside `domain/errors.py`.
- `application/cards.py`: orchestration + `CardRepository` Protocol — no SQLAlchemy/FastAPI imports (mirror `application/lists.py`).
- `adapters/persistence/cards.py`: the only place `CardModel`/SQLAlchemy `Session` appears for this feature.
- `api/routes/cards.py` + `api/schemas/cards.py`: HTTP edge only — DTOs, status-code mapping, no domain logic.
- `ui` → HTTP only, via the `/api/cards` BFF proxy. Never call the FastAPI `api` service directly from the browser.

### Files you will modify (read these fully before editing — AD-1 / hex boundaries apply)

- `api/adapters/persistence/models.py` — adding `CardModel` + a new relationship on `UserModel`. Read the whole file first (already loaded in this story's research — see the `ledger_entries` comment at line 274 warning Epic 4 not to add FKs there yet). Do not touch `LedgerEntryModel`.
- `api/api/app.py` — adding one import + one `include_router` call. Do not change the existing router gating for `lists_router`/`splits_router`.
- `ui/components/AccountMenu.tsx` — adding one nav link + reusing existing `usePreferences`/Tailwind conventions already in the file. Do not restructure the existing language/theme/sign-out sections.

### Testing Requirements (project-context "Discipline" + "Layers")

- Domain: pure unit tests, no DB (Task 1.3).
- Application: unit tests with a fake repo double, no DB (Task 3.2) — same tier `test_preferences_application.py` uses.
- Integration: `Postgres 16` via `DATABASE_URL`-gated `TestClient` tests (Task 4.4) — **not** SQLite. Follow `tests/integration_db.py`'s `claim_alias`/`make_client` helpers (a user needs an alias to exist as a signed-up user in this test harness even though the cards endpoint itself doesn't require one).
- UI: component tests co-located per component (`RegisterCardForm.test.tsx`), plus a client-helper test (`cardsClient.test.ts`) — this is a new surface, not a Soft-Ledger primitive, so it does **not** belong in `ui/components/soft-ledger/soft-ledger.test.tsx`.
- Money is not involved in this story — no `Decimal` assertions needed here.

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `3-5-4-convention-lock-project-context-architecture.md`'s Completion Notes for the expected format.

### Project Structure Notes

- No conflicts detected with the unified project structure (`api/domain|application/adapters/api`, `ui/app` + `ui/lib/i18n` + `ui/hooks`). Cards is a net-new bounded concern that slots into the existing hex layout without touching `lists`/`expenses`/`splits` code.
- `ui/app/upload/page.tsx` already exists as an auth-gated stub ("Statement upload lands in Epic 4... This route is auth-gated so sign-out can be verified now.") — **leave it untouched**. It is not the Cards page; do not repurpose it.
- No existing IBAN-handling code anywhere in the repo (`grep -ri iban api/ ui/` returns nothing outside this story) — you are building this from scratch, not extending something.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1: Register and match cards by IBAN] — ACs, story statement.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-37: Register and match cards by IBAN] — full FR text, "assigned to the user" scoping, generic-vocabulary constraint.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-20 — Card registration] — "Cards are first-class durable entities owned by a user... unknown IBANs block import progress via registration... Card labels are the human import identifiers."
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-2 — Process topology] — detect/split/parse run in-process on `api`; no worker/queue, relevant to why `MatchCardByIbanService` is a plain in-process call, not an HTTP route.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md#J6 — Unknown IBAN card registration] — "label + IBAN only in this prompt... fixed routing afterward, not inside the prompt" (confirms Story 4.3 owns routing UI, not this story). No dedicated visual spec exists for card rows/forms in `DESIGN.md` — reuse existing list/form primitives.
- [Source: api/adapters/persistence/models.py:274] — `ledger_entries` comment reserving `product_id`/origin wiring for later Epic 4 stories; do not add a cards FK there in this story.
- [Source: api/application/lists.py, api/adapters/persistence/repositories.py:182-232, api/api/routes/lists.py, api/api/schemas/lists.py] — the closest existing analog (owned-entity CRUD with per-owner scoping) this story's domain/application/persistence/route/schema layers mirror.
- [Source: _bmad-output/project-context.md] — money/Decimal, snake_case wire, i18n per-domain TS files, no new CSS Modules, generic vocabulary, testing layers/discipline rules (all cited inline above where applied).

## Decisions confirmed with Sebas (2026-08-14)

1. **Epic sequencing gate:** `epic-3-5` retrospective is the only open item (marked `optional` in sprint-status.yaml) — intentional to proceed with Epic 4 now.
2. **UI scope:** standalone `/cards` management page (Task 5) confirmed in scope for this story — Sebas's card↔list↔chip description assumes a page where cards can be viewed/registered independent of import.
3. **Alias gating:** kept as originally planned — `/cards` requires `require_authenticated_user` only, not `require_user_alias` (see Dev Notes "Alias gating" above). Not revisited.
4. **Card/List/chip relationship** (informs future stories, not this one): see Dev Notes "Forward note for whoever builds the origin 'chip'" above — a transaction belongs to one List but can reference the Card it came from; the reference is a new column distinct from `product_id`; card labels are private to their owner, other list members see the card-owner's alias on the chip instead.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
