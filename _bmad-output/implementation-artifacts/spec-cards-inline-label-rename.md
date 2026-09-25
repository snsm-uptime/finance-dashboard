---
title: 'Inline double-click rename for card labels'
type: 'feature'
created: '2026-09-24'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '084ae074eb1e506cb71579d1ac144a87423a4151'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A registered card's label can only be set once, at registration (`RegisterCardForm`). There is no way to rename a card afterward, in the UI or the API.

**Approach:** Add double-click-to-rename on each card row's label in `CardsPanel.tsx`, using `GhostInput` for the inline field, mirroring the existing idle→primed→editing click-state machine documented in the `4-13` inline-title-edit spec and the `ListsPanel` rename flow. Add a matching `PATCH /cards/{card_id}/label` backend endpoint following the `PATCH /cards/{card_id}/routing` conventions exactly.

## Boundaries & Constraints

**Always:**
- Use an explicit `titleState: "idle" | "primed" | "editing"` click-count machine, not native `onDoubleClick`/`dblclick` (two clicks with any gap between them must both count).
- Reuse `validate_card_label` / `CARD_LABEL_MAX_LENGTH` (100) on the backend — no new domain rule.
- Reuse the existing `invalid_card_label` error code end-to-end; the client's `mapError` and `errorInvalidLabel` copy already handle it — no new client-message plumbing for that error path.
- On commit: trim; empty after trim is a client-side error (no PATCH call); unchanged from current label is a silent no-op back to idle (no PATCH call).
- Enter commits, Escape discards and returns to idle, outside-pointerdown while `primed` or `editing` cancels back to idle.
- On successful rename, update the card in local `cards` state in place (same pattern as `onRoutingUpdated`) — no full refetch.
- New endpoint requires authentication via `require_authenticated_user`, same as the routing endpoint (cards have no list-membership gate).

**Ask First:** none identified — this is additive (new PATCH endpoint + new UI state), zero risk to existing archive/routing/registration flows.

**Never:**
- Do not touch the `/cards` page chrome header title (`t.title`, static i18n "Cards"/"Tarjetas") — out of scope, confirmed with the human.
- Do not add a "was renamed" toast/notification system — the live region pattern already used for `registeredStatus` is sufficient if any status message is desired, but is not required by this spec.
- Do not build a bulk-rename or list-view rename shortcut — this is per-row, one-at-a-time, matching `ListsPanel`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Card row idle; double-click label, edit text, Enter | PATCH succeeds; row shows new label; state returns to idle | N/A |
| Empty after trim | User clears the field, presses Enter | No PATCH call; inline error shown (`errorInvalidLabel`); stays in `editing` | Client-side validation only |
| Unchanged label | User double-clicks, doesn't edit, presses Enter | No PATCH call; silently returns to idle | N/A |
| Escape while editing | User presses Escape mid-edit | Draft discarded; reverts to idle; no PATCH call | N/A |
| Outside click while primed | Single click primes the row, then user clicks elsewhere | Reverts to idle before input ever mounts | N/A |
| Outside click while editing | Input mounted, user clicks elsewhere | Same as Escape — draft discarded, reverts to idle | N/A |
| Server 404 (card deleted concurrently) | PATCH on a card removed by another session/tab | Inline error (`errorCardNotFound`); stays in editing | Show inline error, stay in editing |
| Server 422 invalid label | Label > 100 chars slips past client guard, or other domain rejection | Inline error (`errorInvalidLabel`); stays in editing | Show inline error, stay in editing |
| Card list refresh mid-edit | `cards` state changes (e.g. archive toggle) while a row is mid-rename | Row's `titleState` resets to idle, draft discarded, keyed on that card's id changing/disappearing | N/A |

</frozen-after-approval>

## Code Map

- `api/domain/cards.py` -- already has `validate_card_label`/`CARD_LABEL_MAX_LENGTH`/`InvalidCardLabelError` — reuse as-is
- `api/domain/errors.py:329-332` -- `InvalidCardLabelError` (code `invalid_card_label`) — reuse as-is
- `api/application/cards.py` -- add `SetCardLabelCommand` + `SetCardLabelService`, mirroring `SetCardRoutingService`; add `update_label`/`set_label` to the `CardRepository` Protocol
- `api/adapters/persistence/models.py:480-509` -- `CardModel`, `label` column; `SqlAlchemyCardRepository` needs the new repository method implemented here
- `api/api/schemas/cards.py` -- add `SetCardLabelBody(BaseModel)` with `label: str = Field(max_length=CARD_LABEL_MAX_LENGTH)`
- `api/api/routes/cards.py` -- add `PATCH /{card_id}/label`, copying `set_card_routing`'s structure (auth, service call, `InvalidCardLabelError`→422, `CardNotFoundError`→404, log line, `_card_response`)
- `ui/app/cards/cardsClient.ts` -- add `setCardLabel(cardId, { label }, messages)` client function, copying `setCardRouting` verbatim in shape
- `ui/app/cards/CardsPanel.tsx` -- add per-row rename state machine + wire `onLabelUpdated` similar to `onRoutingUpdated`
- `ui/app/cards/CardRoutingControl.tsx` -- render the card label as the double-click target, replacing the static label text with the primed/editing `GhostInput` affordance
- `ui/components/soft-ledger/GhostInput.tsx` -- reuse unchanged as the inline input
- `ui/lib/i18n/cards.ts` -- add any new copy keys needed (none strictly required beyond existing `errorInvalidLabel`/`errorCardNotFound`/`errorGeneric`)
- `ui/app/lists/ListsPanel.tsx:196-279` -- reference implementation for the rename state machine, focus/select effect, outside-pointerdown-cancel effect
- `_bmad-output/implementation-artifacts/4-13-individual-review-card-four-direction-actions-inline-title-edit.md` (Task 7) -- reference for the idle→primed→editing click-count machine specifically (the pattern to mirror over `ListsPanel`'s click-to-rename-via-menu approach)

## Tasks & Acceptance

**Execution:**
- [x] `api/api/schemas/cards.py` -- add `SetCardLabelBody` -- request body for the new endpoint, mirrors `RegisterCardBody.label`
- [x] `api/application/cards.py` -- add `SetCardLabelCommand` dataclass + `SetCardLabelService` (constructor takes `CardRepository`, `execute` validates via `validate_card_label`, fetches via `get_card`, raises `CardNotFoundError` if missing, persists via new repo method, returns updated `CardRecord`) -- mirrors `SetCardRoutingService`
- [x] `api/application/cards.py` (`CardRepository` Protocol) + `api/adapters/persistence/models.py`/repository impl -- add `update_label(card_id, label) -> CardRecord` method -- persistence for the new service
- [x] `api/api/routes/cards.py` -- add `PATCH /{card_id}/label` route -- wires the service, maps `InvalidCardLabelError`→422 `invalid_card_label`, `CardNotFoundError`→404 `card_not_found`, logs `card_label_updated`, returns `_card_response(result)`
- [x] `ui/app/cards/cardsClient.ts` -- add `setCardLabel(cardId, body, messages)` -- PATCH client call, reuses `asCard`/`mapError`, mirrors `setCardRouting`
- [x] `ui/app/cards/CardsPanel.tsx` -- add `onLabelUpdated(updated: CardItem)` handler updating `cards` state in place -- mirrors `onRoutingUpdated`; pass it down to the row renderer
- [x] `ui/app/cards/CardRoutingControl.tsx` (or the row it renders) -- add `titleState`/`titleDraft`/`titleError` state, click-prime/click-edit handlers, focus/select effect, outside-pointerdown-cancel effect, Enter/Escape handlers, card-id-change reset effect -- the double-click-to-rename affordance itself, using `GhostInput` for the mounted input
- [x] Backend unit tests for `SetCardLabelService` -- cover: happy path, empty/whitespace label, label > 100 chars, unknown card id -- exercises the I/O matrix's server-side branches
- [x] Backend route test for `PATCH /cards/{id}/label` -- cover: 200 success, 401 unauthenticated, 404 unknown card, 422 invalid label -- exercises the I/O matrix's HTTP-level branches

**Acceptance Criteria:**
- Given a card row in idle state, when the user clicks its label once, then the row enters `primed` state (soft-border affordance, no input mounted yet, no network call).
- Given a `primed` row, when the user clicks its label again, then the row enters `editing` state, mounts a focused-and-selected `GhostInput` pre-filled with the current label.
- Given an `editing` row, when the user changes the text and presses Enter, then a `PATCH /cards/{id}/label` request is sent, and on success the row displays the new label and returns to `idle`.
- Given an `editing` row, when the user presses Escape, then the draft is discarded and the row returns to `idle` with no network call.
- Given a `primed` or `editing` row, when the user clicks anywhere outside the row, then the row returns to `idle`, discarding any draft.
- Given an `editing` row, when the PATCH call fails with `invalid_card_label` or `card_not_found`, then an inline error is shown and the row stays in `editing`.
- Given two clicks on the same row separated by several seconds, when both land while the row is in `idle`/`primed` respectively, then the row still reaches `editing` (no native double-click timing threshold applies).

## Spec Change Log

## Design Notes

The click-state machine intentionally does not use `Record<string, ...>` maps like `ListsPanel` does — cards are rendered one row at a time via `StackedListPanel`'s `renderItem`, so each row's rename state can live as local state inside the row-level component (`CardRoutingControl` or a small wrapper), scoped to that single card, rather than a panel-level map keyed by card id. This mirrors the simplification already made in the `4-13` spec's Task 7 for the same reason (only one row's state machine is ever "live" from that row's own perspective).

## Verification

**Commands:**
- `cd api && pytest tests/application/test_cards.py tests/api/test_cards_routes.py` -- expected: new label-rename tests pass, no regressions in existing card tests
- `cd ui && npm run lint` -- expected: no new lint errors in touched files
- `cd ui && npm run build` -- expected: type-checks cleanly (new `CardItem`/client types line up)

**Manual checks (if no CLI):**
- In the running app, on `/cards`, double-click a card's label, rename it, confirm it persists after a page reload.

## Suggested Review Order

**Frontend click-state machine (entry point)**

- Row-scoped rename state machine: idle → primed → editing, plus the shared cancel guard used by Escape/blur/outside-click.
  [`CardRoutingControl.tsx:92`](../../ui/app/cards/CardRoutingControl.tsx#L92)

- Commit logic: trim, empty/no-op short-circuits, submit guard, PATCH call, error handling.
  [`CardRoutingControl.tsx:111`](../../ui/app/cards/CardRoutingControl.tsx#L111)

- First-click primes, second-click enters editing — explicit state, not native dblclick.
  [`CardRoutingControl.tsx:99`](../../ui/app/cards/CardRoutingControl.tsx#L99)

- Outside-pointerdown-cancel effect, guards both `primed` and `editing` (wider than ListsPanel's reference).
  [`CardRoutingControl.tsx:77`](../../ui/app/cards/CardRoutingControl.tsx#L77)

- Enter commits, Escape cancels via the shared guard.
  [`CardRoutingControl.tsx:143`](../../ui/app/cards/CardRoutingControl.tsx#L143)

- Mounted `GhostInput`, wired to `onBlur`/`aria-label` for the Tab-away and screen-reader cases.
  [`CardRoutingControl.tsx:215`](../../ui/app/cards/CardRoutingControl.tsx#L215)

**Backend PATCH endpoint**

- New route, mirrors the routing PATCH's auth/error-mapping/logging shape.
  [`cards.py:151`](../../api/api/routes/cards.py#L151)

- Service: validates via the existing domain rule, fetches, persists, returns the updated record.
  [`cards.py:181`](../../api/application/cards.py#L181)

- Repository method backing the service.
  [`cards.py:114`](../../api/adapters/persistence/cards.py#L114)

- Request body schema, mirrors `RegisterCardBody.label`.
  [`cards.py:43`](../../api/api/schemas/cards.py#L43)

**Client wiring**

- New `setCardLabel` client call, mirrors `setCardRouting`.
  [`cardsClient.ts:162`](../../ui/app/cards/cardsClient.ts#L162)

- Single shared update handler replaces the two duplicate `onUpdated`/`onLabelUpdated` merges (post-review cleanup).
  [`CardsPanel.tsx:142`](../../ui/app/cards/CardsPanel.tsx#L142)

**Peripherals**

- New `renameLabel` i18n copy (EN/ES) backing the `aria-label` accessibility fix.
  [`cards.ts:35`](../../ui/lib/i18n/cards.ts#L35)

- Frontend test coverage for the full state machine, including blur/error/outside-click paths.
  [`CardRoutingControl.test.tsx:24`](../../ui/app/cards/CardRoutingControl.test.tsx#L24)
