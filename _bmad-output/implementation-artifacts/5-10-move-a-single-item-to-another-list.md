---
baseline_commit: 9e1b0fc5a2ddf71205c9831831e5d185283a1a79
---

# Story 5.10: Move a single item to another list

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Origin note — read before starting

Added 2026-09-30 via `bmad-correct-course` (Sprint Change Proposal 2026-09-30). The
trigger: `ListReceiptMenu`'s only "move to another list" action calls `reassignStatement`
(Story 5.3), which moves **every** ledger row from the statement's `batch_id` together —
correct for 5.3's own AC, but there was no way to move a single mis-filed item without
dragging its whole statement along. This story adds that single-item path **alongside**
5.3's existing action, not in place of it.

Part of the same batch as Story 4.17 (Epic 4) and Epic 12 — see Epic 12's
cross-reference note in `epics.md`. **Epic 12's Story 12.2 depends on this story's move
action** (it reuses the same "Move this item" label/confirm copy/service), so land this
one first if sequencing matters.

UX spines: `_bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-30/DESIGN.md` and `.../EXPERIENCE.md` (both `status: final`).

## Story

As a list member,
I want to move one ledger item to a different list I belong to,
so that a single mis-filed transaction can be corrected without disturbing the rest of its bank statement's items.

## Acceptance Criteria

1. **Given** a committed ledger item on list A that originated from a statement (or was entered by hand), **when** I move it to list B that I belong to, **then** only that item moves — its `statement_id`/`batch_id` are unchanged, and every other item from the same statement/batch stays on list A (FR-56).
2. **Given** the move, **when** it completes, **then** balances on both list A and list B reflect it immediately (same balance path as Epic 3/4/5 — no parallel settle math).
3. **Given** the moved item's share allocation, **when** it lands on list B, **then** it follows list B's default split rules unless an item-level (`SUBJECT_ITEM`) override already exists for that entry — same continuity rule as FR-29/Story 5.3 (FR-56, FR-9/10 continuity).
4. **Given** the moved item shares a `receipt_id` with sibling entries that are **not** being moved, **when** the move executes, **then** only this entry's own `list_id` changes — any **receipt-level** (`SUBJECT_RECEIPT`) split override is left on the source list untouched (it still governs the siblings that stayed); the moved entry keeps only its own item-level override, if any. (See Dev Notes — this is a new case 5.3 never had to handle, since a whole-statement move always takes every sibling with it.)
5. **Given** I am not a member of the destination list, **when** I attempt the move, **then** the action is rejected (NFR-3), mirroring Story 5.3's ACL check (403, `not_list_member`, same `_access_denied()` shape).
6. **Given** the moved item's payer is not a member of the destination list, **when** I attempt the move, **then** the action is rejected with `invalid_split_override` (409) — mirrors Story 5.3's payer-membership check (`reassign_statement.py:120-124`), applied to the single entry instead of every row in the batch.
7. **Given** the list detail page's per-row menu (`ListReceiptMenu`/`ReceiptRowMenu`), on a row that belongs to a statement, **when** I open it, **then** I see two distinct, separate actions — "Move this item" and "Move whole statement" — each with its own confirm copy naming what will move; the existing "Move whole statement" action (Story 5.3) is unchanged, not replaced.
8. **Given** a hand-entered row with no `statement_id` (no sibling batch to disturb), **when** I open its menu, **then** only "Move this item" is offered — "Move whole statement" stays hidden exactly as it is today for rows with no `statementId` (`ListReceiptMenu.tsx:120-122`'s existing conditional, unchanged).
9. **Given** the two move menu entries, **when** rendered, **then** their accessible names are distinguishable without relying on icon or color alone — satisfied by giving each its own distinct, fully-worded visible label text (see Dev Notes: `IconButtonPopupItem` already uses its visible text as the accessible name, so two different label strings are sufficient — no extra `aria-label` plumbing needed beyond the new i18n string).

## Tasks / Subtasks

- [ ] Task 1 — Backend: application service (AC: #1, #3, #4, #5, #6)
  - [ ] Add `ReassignLedgerEntryService` + `ReassignLedgerEntryCommand`/`Result` in
    `api/application/reassign_statement.py` (or a sibling module if preferred — keep the
    `ReassignStatementRepository` protocol in mind, since the new service needs an
    analogous but entry-scoped repo contract) — mirror `ReassignStatementService.execute`'s
    structure (`api/application/reassign_statement.py:77-175`) but:
    - resolve a **single** `StatementLedgerMove`-shaped record for one `entry_id` instead
      of `list_statement_ledger_moves(statement_id)`'s full batch list
    - run the same two ACL checks (`reassign_statement` on the entry's current list,
      `import_to_list` on the destination — reuse these exact action names, they already
      alias to `write_ledger`/member-mutation; no new `ListAccessAction` needed)
    - run the same payer-membership check (AC #6), scoped to the one entry
    - **diverge from 5.3 here (AC #4):** only look up/carry forward the entry's
      **item-level** override (`SUBJECT_ITEM`, keyed by `entry_id`) — do **not** touch any
      `SUBJECT_RECEIPT` override, even if the entry has a `receipt_id`, since that override
      governs sibling entries that are not moving. This is the one place this story's
      service must NOT reuse `_override_keys`'s receipt-key logic (`reassign_statement.py:162-175`)
      as-is — it would incorrectly try to move a receipt-level override that still applies
      to rows left behind.
    - do **not** touch `ImportBatchModel.list_id` or any other sibling entry — the whole
      point is leaving the batch where it is
  - [ ] Add repo methods on `SqlAlchemyListRepository` (`api/adapters/persistence/repositories.py`):
    `get_ledger_entry_move(entry_id)` (single-row analogue of `list_statement_ledger_moves`,
    `repositories.py:844-870`) and `apply_entry_reassign(...)` (single-row analogue of
    `apply_statement_reassign`, `repositories.py:872-921` — update only the one
    `LedgerEntryModel.list_id`, and only the item-level override row if present; no batch,
    no candidate-row, no receipt update)
- [ ] Task 2 — Backend: API route + schema (AC: #1, #5, #6)
  - [ ] Add `POST /lists/{list_id}/entries/{entry_id}/reassign` in `api/api/routes/lists.py`,
    mirroring the `reassign_statement` route (`lists.py:1118-1162`) — same error mapping
    (`ImportStatementNotFoundError`/equivalent → 404, `InvalidSplitOverrideError` → 409
    `invalid_split_override`, `ListNotFoundError`/`NotListMemberError` → `_access_denied()`)
  - [ ] Add `ReassignEntryBody` (`destination_list_id: UUID`) and `ReassignEntryResponse`
    schemas in `api/api/schemas/lists.py`, mirroring `ReassignStatementBody`/`Response`
    (`schemas/lists.py:246-254`)
- [ ] Task 3 — Frontend: client + menu wiring (AC: #7, #8, #9)
  - [ ] Add `reassignEntry(listId, entryId, destinationListId, messages)` to
    `ui/app/lists/listsClient.ts`, mirroring `reassignStatement` (`listsClient.ts:887-916`)
  - [ ] Add `moveItemLabel` to `ReceiptRowMenuMessages` and an `onMoveItem?: () => void`
    prop to `ReceiptRowMenu` (`ui/components/soft-ledger/ReceiptRowMenu.tsx`), rendered as
    its own `IconButtonPopupItem` alongside the existing `moveStatementLabel`/`onMoveStatement`
    entry — **use a different icon** than `FolderIcon` (which `onMoveStatement` already uses)
    so the two are visually distinct too (DESIGN.md Do/Don't: "must not share the same icon")
  - [ ] `onMoveItem` is **always** offered (no `statementId` gate) — unlike
    `onMoveStatement`, which stays gated on `statementId !== null` (AC #8)
  - [ ] In `ListReceiptMenu.tsx`, add a second `Sheet`/confirm flow for the item move
    (reuse the existing list-picker `Sheet` body pattern at `ListReceiptMenu.tsx:136-181`,
    but with its own confirm copy — "This item will move to {list}" vs the existing
    "All items from this statement will move to {list}") and wire it to
    `reassignEntry` instead of `reassignStatement`
  - [ ] Add EN/ES i18n strings for `moveItemLabel` and the item-move confirm copy
    (`ui/lib/i18n/lists.ts`)
- [ ] Task 4 — Tests
  - [ ] `api/tests/test_reassign_statement_application.py`-style unit tests for
    `ReassignLedgerEntryService`: happy path, non-member destination (403-equivalent),
    non-member payer (`InvalidSplitOverrideError`), and the receipt-override case (AC #4) —
    assert a `SUBJECT_RECEIPT` override is left untouched when the entry has sibling
    entries sharing its `receipt_id`
  - [ ] `api/tests/test_reassign_statement_integration.py`-style integration test for the
    new route
  - [ ] Frontend test for `ListReceiptMenu` rendering two distinct move actions, and for
    `onMoveItem` being offered even when `statementId` is `null` (AC #8)

## Dev Notes

### What 5.3's code already gives you (read `reassign_statement.py` and its route/repo first)

This story is a narrower sibling of Story 5.3, not a new pattern. Read these three files
end-to-end before writing anything — most of this story is "do the same thing, but for
one entry and without moving the batch/receipt":

- `api/application/reassign_statement.py` — `ReassignStatementService.execute` (lines
  77-175) is the full blueprint: ACL on every source list + destination, payer-membership
  check against destination members, item/receipt override carry-forward via
  `_override_keys`, atomic repo call.
- `api/adapters/persistence/repositories.py:844-921` — `list_statement_ledger_moves` /
  `apply_statement_reassign` show exactly which tables move (`LedgerEntryModel`,
  `ImportBatchModel`, `ImportCandidateRowModel.resolved_list_id`, `ReceiptModel`,
  `SplitOverrideModel`). **Your single-entry version touches only the first and the last
  of these (one `LedgerEntryModel` row, and only its item-level override) — never the
  batch, candidate row, or receipt.**
- `api/api/routes/lists.py:1118-1162` — the route's error-mapping shape to copy exactly.

### The one genuinely new edge case (AC #4) — receipt-level overrides

Story 5.3 never had to decide what happens to a receipt-level (`SUBJECT_RECEIPT`) split
override on a partial move, because a whole-statement move always takes every entry under
that receipt with it. A single-item move can leave siblings behind. If the entry you're
moving has a `receipt_id` shared by other entries that are **not** moving, that receipt's
split override must **not** travel with the one entry — it still has to govern the entries
left on the source list. Only an **item-level** (`SUBJECT_ITEM`) override tied to the
specific `entry_id` should move with it. This means the new service's override-lookup
logic cannot reuse `_override_keys` (`reassign_statement.py:162-175`) unmodified — that
helper always includes the receipt key when `row.receipt_id` is set, which is correct for
a full-batch move but wrong here.

### Accessibility note — this is simpler than it might look (AC #9)

`IconButtonPopupItem` (`ui/components/IconButtonPopup/IconButtonPopup.tsx:166+`) renders a
plain `<button role="menuitem">` whose accessible name comes from its visible text
children — there is no separate `aria-label` to wire up. So AC #9's "distinguishable to
assistive tech" requirement is satisfied simply by giving the new "Move this item" entry
its own distinct label string (which Task 3 already does for other reasons) — no
additional accessibility-specific code is needed beyond that i18n string existing.

### Project Structure Notes

- Backend touches: `api/application/reassign_statement.py` (new service, co-located with
  5.3's — do not create a parallel file unless the module gets unwieldy),
  `api/adapters/persistence/repositories.py` (two new methods on
  `SqlAlchemyListRepository`), `api/api/routes/lists.py`, `api/api/schemas/lists.py`.
- Frontend touches: `ui/app/lists/listsClient.ts`, `ui/components/soft-ledger/ReceiptRowMenu.tsx`,
  `ui/app/lists/ListReceiptMenu.tsx`, `ui/lib/i18n/lists.ts`.
- Does not touch: `ListReceiptMenu.tsx`'s existing `confirmMove`/`reassignStatement` path,
  `ImportBatchModel`, `ImportCandidateRowModel`, `ReceiptModel` rows (no code should write
  to these for a single-item move).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.10: Move a single item to another list]
- [Source: _bmad-output/planning-artifacts/epics.md#FR-56]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-30.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-30/EXPERIENCE.md#Accessibility Floor]
- [Source: api/application/reassign_statement.py:77-175 — ReassignStatementService blueprint]
- [Source: api/adapters/persistence/repositories.py:844-921 — list_statement_ledger_moves / apply_statement_reassign]
- [Source: api/api/routes/lists.py:1118-1162 — reassign_statement route]
- [Source: api/api/schemas/lists.py:246-254 — ReassignStatementBody/Response]
- [Source: api/domain/list_access.py — reassign_statement/import_to_list actions, both alias to write_ledger/member-mutation]
- [Source: ui/app/lists/ListReceiptMenu.tsx:52-184 — confirmMove, Sheet picker pattern]
- [Source: ui/components/soft-ledger/ReceiptRowMenu.tsx — onMoveStatement/moveStatementLabel pattern to mirror]
- [Source: ui/components/IconButtonPopup/IconButtonPopup.tsx:166+ — IconButtonPopupItem accessible-name behavior]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- AC #4 (receipt-level override handling on a partial move) is this story's main novel
  risk — Story 5.3 never had to solve it. Flagged with explicit test coverage in Task 4.

### File List
