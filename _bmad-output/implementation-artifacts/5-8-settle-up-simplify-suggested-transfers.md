---
baseline_commit: 1c9185a
---

# Story 5.8: Settle-up pairwise grid, simplify group plan, copy to share

Status: review

## Story

As a list member,
I want the balance component to show who owes me and whom I owe, a net Balance, a Simplify group plan with fewer payments, and a way to copy that plan as plain text,
So that I can settle with fewer transactions and, when I settle, my payables are treated as already paid (clean for me) while others still owing me can be reminded later.

## Acceptance Criteria

1. **Given** I am a member of a list
   **When** I open shared-expenses for that list
   **Then** the balance component is a three-column grid: **You are owed** (members who owe me, CRC + name) | **You owe** (members I owe, CRC + name) | **Balance** (my signed net vs the rest of the list)
   **And** amounts are CRC with Warm Balance owe/owed polarity; empty columns have no fake zero rows
   **And** a member appears on both sides only when pairwise nets require it

2. **Given** Soft-Ledger shows my pairwise balances
   **When** I use **Simplify** (control on the balance component)
   **Then** I see a **group transfer plan** that preserves every member's net in CRC and reduces the number of payments (FR-41)
   **And** example of intent: instead of me paying A and B separately, the plan may be me → A only and B → A (smaller)
   **And** simplify does not write a bank/payment ledger — no "Mark settled" as "money moved in-app" (UX-DR20, AD-21)

3. **Given** I **Settle**
   **When** I confirm
   **Then** the product assumes I **already paid** the people in **You owe**; that column is **clean for me**
   **And** **You are owed** remains (inbound balances) so a later notification feature can remind those members to pay up
   **And** v1 does not record inter-member transfer lines as if the bank moved money; a minimal "my payables are done" assertion is persisted so notifications can query it later

4. **Given** the group plan is visible
   **When** I copy
   **Then** the UI uses existing `ui/components/CopyButton/CopyButton.tsx` — do not add a second copy component
   **And** clipboard text is the group plan in plain text (names, CRC, direction), shareable outside the app
   **And** copy never says "paid" and must not look like recording settlement (UX-DR17)
   **And** EN/ES chrome is localized; amounts stay CRC-first (UX-DR18)

5. **Given** unresolved same-price conflicts remain for the period (Story 5.5)
   **When** I view Soft-Ledger
   **Then** Simplify is unavailable — no Simplify affordance until those conflicts are resolved (aligns with Story 5.5/5.7's existing `balance_status.is_incomplete` signal)

6. **Given** a solo list, already-minimal two-member nets, or all-zero balances
   **When** I open Simplify
   **Then** Simplify remains available (unless blocked by AC #5) but may show empty / no-op suggestions
   **And** it never invents debts
   **And** after Epic 6, solo lists hide Simplify entirely (this AC is v1 shared-mode, including interim solo-on-settle-strip)

7. **Given** I dismiss Simplify
   **When** I return to the pairwise grid
   **Then** underlying net balances are unchanged

**Deferral (2026-08-26):** Solo lists hide the settle grid entirely only after Epic 6 (Story 6.1); v1 shows it for every list regardless of member count (matches Story 3.3/3.4 as-built behavior — do not gate on member count in this story).

**Out of scope for this story (explicitly deferred):**
- Statement-cycle/period selector (Story 5.9) — balances stay whole-list/unfiltered, same as Story 5.7.
- Sending remind-to-pay notifications — this story only leaves a clean split (`is_settle_blocked`/settle-assertion data) for a later notify feature to read; it does not send anything.
- Recording/reconciling bank settlement payments (AD-21, PRD v2 OPEN) — the settle assertion is a viewer-only "my payables are done" marker, never a transfer/payment ledger line.
- Individual-list mode member-count gating (Epic 6, Story 6.1) — out of scope here.

## Tasks / Subtasks

- [x] **Task 1 — Domain: pairwise balances + simplify (api/domain/settle.py)** (AC: 1, 2, 6, 7)
  - [x] Add `compute_pairwise_settle_balances(ledger_entries, list_members, list_owner_id, compute_allocations_fn, get_split_override_fn, get_list_default_split_fn, default_mode="even", currency_exponent=2) -> dict[tuple[UUID, UUID], Decimal]`, mirroring `compute_settle_balance_for_list_members`'s entry-iteration loop (same `INCLUDED_LINE_TYPES` filter, same sign/reversal handling — do not duplicate line-type/allocation logic, share the per-entry allocation call) but instead of accumulating into a single `balance_dict[member]`, accumulate into edges `edge[(payer_id, other_member_id)] += allocation.amount * sign` for every non-payer allocation. Key edges consistently as `(A, B)` meaning "B owes A" (same polarity convention as the existing function: positive = A is owed). Do not net `(A,B)` against `(B,A)` inside this function — return raw directional edges; netting per pair happens in the caller that needs a single number per counterparty (Task 2).
  - [x] Add a pure helper `net_pairwise_edges(edges: dict[tuple[UUID, UUID], Decimal]) -> dict[tuple[UUID, UUID], Decimal]` that collapses `(A,B)` and `(B,A)` into one signed value per unordered pair (canonical ordering, e.g. lexicographically smaller UUID first) — a member appears on only one side of a pair (AC #1's "member appears on both sides only when pairwise nets require it" is trivially satisfied once nets are collapsed per pair).
  - [x] Add `simplify_group_transfers(net_balances: dict[UUID, Decimal], currency_exponent: int = 2) -> list[SuggestedTransfer]` — a **pure**, list-wide (not pairwise-preserving) min-transaction-count algorithm operating on the existing `compute_settle_balance_for_list_members` net-balance output: greedily match the largest current creditor with the largest current debtor, transfer `min(abs(creditor_balance), abs(debtor_balance))`, reduce both, drop zeroed members, repeat until no balances remain (all Decimal arithmetic, quantized to `currency_exponent`). Add `@dataclass(frozen=True, slots=True) class SuggestedTransfer: from_member_id: UUID; to_member_id: UUID; amount_crc: Decimal`. This function must preserve `sum(net_balances.values())` invariants: after applying all transfers, replaying them against `net_balances` returns every member to (near-)zero. Never invents a transfer between two zero-balance members and never produces a transfer of amount `0`.
  - [x] Both new functions stay free of FastAPI/SQLAlchemy imports (AD-1) — pure domain, `Decimal` only, no `float`.
  - [x] Unit tests in `api/tests/test_settle.py` (existing file — add cases, do not create a parallel test module): pairwise edges for 2-member and 3-member lists incl. remainder-to-creator rows; `net_pairwise_edges` collapsing both directions on a pair; `simplify_group_transfers` on a classic 3-person cycle (A owes B, B owes C, C owes A — should net to fewer/zero transfers if nets allow), a 2-member case (single transfer), an all-zero case (empty list, no invented debts), and a case verifying transfers sum back to original nets exactly (Decimal equality, not float-tolerant).

- [x] **Task 2 — Application: viewer pairwise + simplify + settle services (api/application/lists.py)** (AC: 1, 2, 3, 5, 6)
  - [x] Add `ListPairwiseBalances` dataclass: `list_id: UUID`, `you_are_owed: tuple[PairwiseEdge, ...]`, `you_owe: tuple[PairwiseEdge, ...]`, `balance_crc: str` (reuse existing net-balance math via `compute_viewer_balance_crc`, unchanged — Balance is always the true net, never affected by a settle assertion), `is_incomplete: bool` (reuse existing `conflicts_touching_list` signal exactly as `GetListBalancesStubService` does today — do not duplicate that computation, extend the existing service or compose a sibling that shares its logic).
  - [x] `PairwiseEdge` dataclass: `member_id: UUID`, `alias: str | None`, `amount_crc: str`.
  - [x] Extend `GetListBalancesStubService` (preferred, keeps balances a single read call from the route as Story 5.7's dev notes established) to additionally compute pairwise edges from `compute_pairwise_settle_balances` + `net_pairwise_edges`, split into `you_are_owed`/`you_owe` from the viewer's perspective, and **apply the settle-assertion filter to `you_owe` only**: if the actor has a persisted settle assertion for this list with `settled_at`, exclude ledger entries with `created_at <= settled_at` from the edges feeding `you_owe` (re-run `compute_pairwise_settle_balances` a second time over the filtered entry set, or filter after aggregation per-entry — either is fine as long as `you_are_owed` and `balance_crc` are computed from the **unfiltered** entry set). This is the concrete mechanism behind AD-21's "payable side is clean for them; inbound balances remain" — the true net (`Balance`) never changes because no money actually moved; only the `You owe` presentation column clears until new debt accrues after the settle timestamp.
  - [x] Add `SimplifyGroupPlanService`: authorize `read_balances` (same action as balances — simplify is a read, it writes nothing), fetch full list ledger + members (same repo calls as `compute_viewer_balance_crc`), compute list-wide nets via existing `compute_settle_balance_for_list_members`, call `simplify_group_transfers`, resolve `from`/`to` member aliases, return an ordered list of transfers. Also return `is_incomplete` (reuse `conflicts_touching_list`) so the route/UI can enforce AC #5 (Simplify blocked, not silently degraded) — the service should still compute and return the plan; **the API route is what returns 409/blocks**, matching the existing pattern where domain/application stay permissive and gating lives at the edge (mirrors how `ResolveSamePriceConflictService` from Story 5.6 does not itself decide HTTP status).
  - [x] Add `SettlePayablesCommand`/`SettlePayablesService`: `authorize_list_access(action="settle_payables")` (new member-gated **mutation** action — 403 non-member, same shape as `set_last_opened_list`/`write_ledger` per the ACL sketch, not a new ACL scheme), then `repo.upsert_settle_assertion(list_id, actor_user_id, settled_at=now)` (new repo method — see Task 3). Idempotent: settling again just moves `settled_at` forward; no error on repeat settle. Do not accept a request body — no user-editable timestamp, no partial settle of specific counterparties (v1 scope is "settle everything I currently owe on this list").
  - [x] All three services take the same defaulted-collaborator shape Story 5.6/5.7 established (`conflict_repo: SamePriceConflictRepository | None = None` defaults to `NullSamePriceConflictRepository()`) so existing test call sites keep compiling.

- [x] **Task 3 — Persistence: settle assertion table + repo methods** (AC: 3)
  - [x] New Alembic migration `api/adapters/persistence/migrations/versions/0031_list_settle_assertions.py`, `down_revision = "0030_description_aliases"` (verified current head at story-creation time — re-confirm with `alembic heads` if other work has landed on this branch first). Table `list_settle_assertions`: `id UUID PK`, `list_id UUID FK→lists.id ON DELETE CASCADE`, `actor_user_id UUID FK→users.id ON DELETE CASCADE`, `settled_at TIMESTAMPTZ NOT NULL`, unique constraint on `(list_id, actor_user_id)` (one row per member per list — upsert target, not an append-only log; v1 only needs "when did I last settle," not history). Follow `0029_same_price_conflicts.py`'s exact style (revision docstring, `sa`/`op` imports, explicit FKs with `ondelete`).
  - [x] `SqlAlchemyListRepository` gains `upsert_settle_assertion(list_id, actor_user_id, settled_at) -> None` (Postgres `ON CONFLICT (list_id, actor_user_id) DO UPDATE`) and `get_settled_at(list_id, actor_user_id) -> datetime | None`. Add both to the `ListRepository` Protocol in `application/lists.py` alongside the existing methods (`get_stored_default_split`, etc.).
  - [x] `list_ledger_entries(list_id)` already returns `application.expenses.LedgerEntryRecord` rows that include `created_at: datetime` (verified — `api/application/expenses.py`, set explicitly at insert time in `repositories.py`'s `create`, not DB `now()`, to avoid transaction-scoped ordering collapse). No schema/record change needed here — reuse `created_at` directly as the settle-timestamp boundary field (Task 2).

- [x] **Task 4 — API: schemas + routes** (AC: 1, 2, 3, 4, 5)
  - [x] `api/api/schemas/lists.py`: extend `ListBalancesStubResponse` with `you_are_owed: list[PairwiseEdgeResponse]` and `you_owe: list[PairwiseEdgeResponse]` (`PairwiseEdgeResponse { member_id: UUID; alias: str | None; amount_crc: str }`) — additive fields, `balance_crc`/`balance_status` shape unchanged (Story 3.6/UI parsing must not break, same rule Story 5.7 followed).
  - [x] Add `SimplifyPlanResponse { transfers: list[TransferResponse]; is_incomplete: bool }`, `TransferResponse { from_member_id: UUID; from_alias: str | None; to_member_id: UUID; to_alias: str | None; amount_crc: str }`.
  - [x] `api/api/routes/lists.py`: extend `get_list_balances_stub` to populate the new pairwise fields from the extended service result.
  - [x] Add `GET /{list_id}/settle/simplify` → `SimplifyPlanResponse`. If `is_incomplete` is true, return **HTTP 409** with a structured error body (`{"detail": ..., "code": "settle_incomplete"}`, follow the existing error-shape convention used elsewhere in this router) instead of a plan — this is the enforcement point for AC #5; do not let the UI infer blocking from an empty transfer list (empty ≠ blocked, per AC #6).
  - [x] Add `POST /{list_id}/settle` → `204 No Content` on success (no response body needed; the next `GET /balances` reflects the clean `you_owe` column). Non-member → 403 (`not_list_member`), list-not-found → `_list_not_found()` (reuse the existing helper, same as every other route in this file).
  - [x] `api/domain/list_access.py`: add `"settle_payables"` to `ListAccessAction`'s `Literal` and to `_MEMBER_MUTATION_ACTIONS` (alongside `write_ledger`/`import_to_list`/etc. — any member can settle their own payables, this is **not** an owner action). `AuthorizeListAccessService.execute` (`api/application/list_access.py`) fails closed (403 `not_list_member`) on any action not in this allow-list via `normalize_list_action` — a new action string used without this addition will always 403, even for members. Do not invent a second ACL code path; this is the single existing choke point (AD-19).

- [x] **Task 5 — UI: redesign BalanceStrip into the 3-column grid + Simplify + Settle** (AC: 1, 2, 3, 4, 5, 6, 7)
  - [x] `ui/components/soft-ledger/BalanceStrip.tsx` is used in exactly one place (`ui/app/lists/[listId]/page.tsx`) — safe to change its anatomy in place per EXPERIENCE.md's explicit instruction ("do not use a single who-line + hero amount as the primary list-detail settle read"). Replace the two-column `who`/`amount` layout with the 3-column grid (You are owed | You owe | Balance). Keep the existing `action` slot (currently `ListDetailMobileActions`) — the mobile actions cluster still needs a home; decide whether it moves into the grid's Balance cell, becomes a 4th slot, or floats via the same `action` prop pattern (component-level layout decision, not an architecture rule — pick whichever keeps `ListDetailMobileActions` untouched and tappable).
  - [x] Empty columns: no fake zero rows (AC #1) — if `you_are_owed`/`you_owe` is an empty array, render nothing in that column (not a "₡0" placeholder row). This mirrors the "honest empty" principle already used for `IncompleteDisclosure` (Story 5.7 AC #3) and `BalanceStrip`'s own current empty state (`detailSettleEmpty`).
  - [x] Add a `SimplifyPanel` (new component, `ui/components/soft-ledger/SimplifyPanel.tsx` + co-located test cases in `soft-ledger.test.tsx`, following the existing "one shared test file for all Soft-Ledger primitives" convention — Story 5.7's dev notes documented this, do not create a new per-component test file) that renders the fetched transfer list plus a `CopyButton` (import from `ui/components/CopyButton/CopyButton.tsx` — the **exact existing path**, do not add a second copy component per AC #4) whose `value` is the plain-text plan built from `transfers` (names + CRC + direction, e.g. `"{from} pays {to} ₡{amount}"` per line — build via a pure exported function so it's unit-testable without rendering, same pattern as `balanceStripPropsFrom`/`asBalances` in `page.tsx`).
  - [x] Simplify needs a client component somewhere in the tree (fetching `/lists/{listId}/settle/simplify` on demand and toggling panel visibility is inherently interactive) — `page.tsx` stays an async Server Component; do **not** convert it to a client component. Follow the same pattern Story 4.x/5.x mobile-action sheets use: a small `"use client"` wrapper (see `ListDetailMobileActions.tsx`, `OriginChipPicker.tsx` for the established shape of a client island embedded in this RSC tree) that owns its own fetch/toggle state, imported into `page.tsx` as a plain component.
  - [x] Simplify blocked state (AC #5): when the client Simplify control calls `GET /settle/simplify` and gets **409**, show a calm disabled/blocked affordance (no crash, no empty-plan-looks-like-"nothing to pay" confusion) — reuse the existing `incompleteDisclosureResolve`/`/upload/conflicts` link pattern from Story 5.7 rather than inventing new blocked-state copy from scratch if the messaging fits.
  - [x] Settle control: a confirm action (button + confirm step, same UX weight as the existing rollback-batch confirm dialog pattern in `ListReceiptMenu`/`page.tsx`'s `rollbackBatchConfirmBodyFrom` — reuse that interaction shape, not a bespoke one) that calls `POST /{listId}/settle`, then revalidates the balances read (Next.js `router.refresh()` or a re-fetch, since `page.tsx` is `force-dynamic`/`cache: "no-store"` already). Copy must never say "paid" (UX-DR17/UX-DR20) — phrase as e.g. "I've settled my side" / EN-ES equivalents, not "Mark settled" or "Payment sent."
  - [x] `ui/lib/i18n/lists.ts`: add new keys to both `en`/`es` in `listsMessages` next to existing `balanceOwe`/`balanceOwed`/`balanceZero` (e.g. `balanceYouAreOwed`, `balanceYouOwe`, `balanceLabel`, `simplifyAction`, `simplifyEmpty`, `simplifyBlocked`, `settleAction`, `settleConfirmTitle`, `settleConfirmBody`, `settleConfirmAction`, `settleCancel`, `copyPlanLabel`, `copyPlanCopiedLabel`). Do not hardcode English/Spanish strings inline in components — every new string goes through this file (existing project-context.md rule).
  - [x] `page.tsx`: extend `asBalances`/`BalancesPayload` to parse `you_are_owed`/`you_owe` (defensive parsing — malformed/absent arrays default to `[]`, never fabricate rows, same discipline as the `is_incomplete` parsing Story 5.7 added). Wire the new grid + Simplify control + Settle control into the existing `<BalanceStrip>` call site; keep `IncompleteDisclosure` wiring unchanged.

- [x] **Task 6 — Tests** (AC: all)
  - [x] API integration (Postgres 16, `test_lists_integration.py` or a new sibling module if it keeps that file from becoming unwieldy — follow whichever the file's current size suggests): pairwise edges for 2- and 3-member lists; `you_owe` clears after `POST /settle` while `you_are_owed`/`balance_crc` are unchanged; a new purchase after settle re-appears in `you_owe` (settled_at boundary, not a permanent clear); `GET /settle/simplify` returns transfers preserving nets; `GET /settle/simplify` returns 409 when an unresolved same-price conflict touches the list (reuse Story 5.5/5.7's conflict-fixture setup); non-member on `/settle` and `/settle/simplify` → 403/404 per existing ACL test conventions.
  - [x] Domain unit tests per Task 1.
  - [x] UI: `SimplifyPanel` plain-text copy-text builder (pure function, edge cases: empty transfers, single transfer, multiple); `BalanceStrip`/grid empty-column rendering (no fake zero rows); Settle confirm flow (client component, following `ListReceiptMenu`'s existing confirm-dialog test pattern if one exists — check before inventing a new render harness).
  - [x] No fabricated conflict/settle data outside integration tests — UI tests take pairwise/transfer data as literal props only (same rule Story 5.7 followed for `isIncomplete`).

## Dev Notes

### Architecture compliance

| Rule | Apply |
|------|-------|
| AD-1 | `domain/settle.py` new functions and `application/lists.py` new services stay free of FastAPI/SQLAlchemy imports. |
| AD-5 | Money stays `Decimal` end-to-end for pairwise edges, simplify transfers, and the settle-assertion path (no money math there, but never introduce a `float` anywhere near CRC amounts). |
| AD-6 | Split remainder → list creator — unchanged, reused via existing `compute_share_allocations`/`resolve_effective_default`; do not re-derive remainder logic in the new pairwise function. |
| AD-7 | `amount_crc` is the sole money read for settle math (already materialized at commit) — never re-call BCCR or recompute FX here. |
| AD-10 | Simplify-blocked signal reuses `list_unresolved_conflicts` + `conflicts_touching_list` exactly as Story 5.7 wired it — do not add a second conflict query. |
| AD-15 | Postgres 16 integration tests for settle-assertion persistence and simplify (not SQLite). |
| AD-19 | `settle_payables` is a new **action name** on the existing `authorize_list_access` membership check — not a new ACL surface/scheme. `read_balances` is reused unchanged for the extended balances read and for simplify (a read). |
| AD-21 | **This is the story that implements AD-21's settle addendum.** No inter-member transfer lines are ever written; the settle assertion is a viewer-only "payables done" timestamp; Balance/`you_are_owed` are never altered by settling — only `you_owe` is filtered by the settle timestamp. Simplify and Copy never write anything. |

### Current component/API state (verified in this codebase, not from planning docs)

- `/lists/{list_id}/balances` today returns `{ list_id, balance_crc, balance_status: { is_incomplete } }` from `GetListBalancesStubService` (`api/application/lists.py:396-427`) / `ListBalancesStubResponse` (`api/api/schemas/lists.py:130-133`). This story adds `you_are_owed`/`you_owe` additively; do not touch `balance_crc`/`balance_status` shape.
- `compute_viewer_balance_crc` (`api/application/lists.py:286-332`) is the existing net-balance read path — **reuse it unchanged** for `balance_crc`; it already handles split overrides, list-default resolution, and FX-materialized amounts correctly. The new pairwise function must reuse the same `compute_allocations_fn`/`get_split_override_fn`/`get_list_default_split_fn` wiring pattern (see that function's body for the exact shape), not reinvent it.
- `domain/settle.py`'s `compute_settle_balance_for_list_members` (existing, unchanged) is **necessary but not sufficient** per the 2026-08-26 Sprint Change Proposal — it gives per-member nets (used for `balance_crc` and as the input to `simplify_group_transfers`), but has no notion of *who* a member's balance is against. Pairwise tracking is new domain code (Task 1).
- `BalanceStrip` (`ui/components/soft-ledger/BalanceStrip.tsx`) is currently a 2-column `who`/`amount` layout with an `action` slot used for `ListDetailMobileActions`. It is used in exactly one place — `ui/app/lists/[listId]/page.tsx` — so a full anatomy rewrite is safe (verified via grep, no other importers besides its own test file).
- `CopyButton` (`ui/components/CopyButton/CopyButton.tsx`) is a `"use client"` component taking `value`/`label`/`copiedLabel`/optional `children`; it already exists and is fully reusable as-is — **do not build a second copy affordance** (AC #4 is explicit about this).
- `list_ledger_entries`/`list_members_with_alias` (`api/adapters/persistence/repositories.py:474`, `:558`) are accessed via `getattr` duck-typing inside `compute_viewer_balance_crc`, not declared on the `ListRepository` Protocol — an existing inconsistency in this codebase, not something to "fix" in this story; follow the same duck-typed access pattern for the new pairwise/simplify services unless it becomes awkward, in which case adding them to the Protocol properly is fine (improvement, not a required change).
- `ListRepository` Protocol (`api/application/lists.py:97-126`) currently has no settle-assertion methods — this story adds `upsert_settle_assertion`/`get_settled_at` to it (Task 3).
- No `list_settle_assertions` table exists yet — this is new persistence (Task 3), following `0029_same_price_conflicts.py`'s migration style.
- `AuthorizeListAccessService` (`api/application/list_access.py`) calls `normalize_list_action` from `api/domain/list_access.py`, which **fails closed** (raises `NotListMemberError`, i.e. 403) for any action string not in `ALL_KNOWN_ACTIONS`. `"settle_payables"` **must** be added to `ListAccessAction`'s `Literal` and `_MEMBER_MUTATION_ACTIONS` in that file (Task 4) or the new mutation will always 403 for everyone, including members. This is a real allow-list, not free-form duck typing — do not skip this step.

### Simplify algorithm — concrete guidance

`simplify_group_transfers` is a classic "settle up with minimum transactions" greedy reduction, **not** the pairwise edges from Task 1 — it operates purely on the aggregate net-balance dict (`{member_id: Decimal}`, positive = owed, negative = owes) that `compute_settle_balance_for_list_members` already produces. Algorithm:

1. Partition members into creditors (`balance > 0`) and debtors (`balance < 0`), sorted by magnitude descending for determinism (stable ordering matters for reproducible test fixtures — sort by `(abs(balance), member_id)` descending as a tiebreak).
2. While both lists are non-empty: take the largest creditor and largest debtor, transfer `min(creditor_balance, abs(debtor_balance))`, record `SuggestedTransfer(from=debtor, to=creditor, amount=transfer)`, reduce both balances by the transfer amount, drop any that hit exactly zero.
3. Stop when either list is empty (remaining balances, if any due to rounding, should be `0` given the domain's Decimal quantization — assert this invariant in tests, do not silently drop a nonzero remainder).

This is intentionally the well-known minimum-transaction settle-up heuristic (not provably minimal in every topology, but standard, deterministic, and sufficient for FR-41's "fewer transfers" — do not attempt a more complex minimum-cash-flow-count optimal algorithm; that is scope creep for v1).

### Anti-patterns (do not)

- Do not add a second copy component — `CopyButton` already exists and is the only one AC #4 permits.
- Do not persist inter-member "transfer" ledger lines from Simplify/Copy/Settle — AD-21 explicitly forbids treating these as bank/payment ledger writes. The only new persistence is the single-row-per-`(list_id, actor_user_id)` settle-assertion timestamp.
- Do not let a settle assertion change `balance_crc` or `you_are_owed` — those always reflect the true, unfiltered net. Only `you_owe` is timestamp-filtered.
- Do not gate the 3-column grid or Simplify on member count (`member_count == 1` hiding is Epic 6 / Story 6.1, out of scope here — matches how 3.3/3.4 already ship the strip for every list regardless of member count).
- Do not build a period/date-range param to satisfy anything in this story — Story 5.9 owns period infrastructure; this story's balances stay whole-list/unfiltered exactly like Story 5.7 left them.
- Do not silently return an empty Simplify plan when conflicts block it (AC #5) — the route must signal blocked (409) distinctly from "no-op, already minimal" (200 with an empty/short list, AC #6).
- Do not reformat `compute_settle_balance_for_list_members` or `compute_viewer_balance_crc` — both are correct and reused as-is; this story is additive domain/application code alongside them.

### Testing requirements

- Postgres 16 for all settle-assertion/pairwise/simplify integration coverage — not SQLite, per every prior Epic 4/5 story and `project-context.md`.
- Money/`Decimal` assertions throughout — pairwise edges, simplify transfer amounts, and settle-assertion-filtered balances all use `Decimal` equality, never float tolerance.
- Reuse Story 5.5/5.7's synthetic-ledger-rows-via-repositories-directly integration test setup pattern — no new PDF fixtures needed for this story.
- Cover the settle-timestamp boundary explicitly: an entry created **before** settle is excluded from `you_owe`; an entry created **after** settle (viewer owes someone new) reappears in `you_owe` on the next read — this is the core mechanic behind "clean for me, not forever."

### Previous story intelligence (5.7)

- The `NullSamePriceConflictRepository()`-default-collaborator pattern (introduced in 5.6, reused in 5.7) is the established way to add an optional dependency to an existing service without breaking prior test call sites — apply it again for any new optional collaborator here.
- `IncompleteDisclosure`'s `resolveHref`-as-plain-string (not a callback prop) pattern exists because `page.tsx` is an async Server Component that cannot pass non-serializable function props to children — the same RSC-boundary constraint applies to any new interactive control added to this page. Simplify/Settle need genuine client interactivity (fetch-on-click, confirm dialogs), so they need their own `"use client"` islands (like `ListDetailMobileActions`/`OriginChipPicker` already are), not function props threaded from the server component.
- `asBalances`'s defensive-parsing discipline (never fabricate a truthy/populated value on a parse miss, default to the "nothing to show" state) — apply identically to `you_are_owed`/`you_owe` array parsing.
- Story 5.7 confirmed `/lists/{id}/balances` is the "one call from the route" pattern established by Story 3.6's anticipation and reused since — keep extending that single endpoint rather than fragmenting balance reads across multiple round trips (Simplify is the one necessary exception, since it needs a distinct blocking status code and is user-triggered, not part of the initial page load).

### Git intelligence

- `main` at `1c9185a` (merge of PR #92, Story 5.7) is the branch base. Recent history (`f4d9235`, `b4a9aaf`, `1b3ac16`) is Stories 5.6/5.7 landing cleanly — `same_price_conflicts`/`description_aliases`/`balance_status` are exactly as documented above, no drift to account for.
- Current branch: `feat/5/5-8-settle-up-simplify-suggested-transfers`, worktree already prepared at `1c9185a`.

### Project context reference

Follow `_bmad-output/project-context.md`: money stays `Decimal`/string end-to-end (`amount_crc` fields on every new response type are strings, never JSON numbers); API wire stays snake_case (`you_are_owed`, `you_owe`, `settled_at`, `from_member_id`), mapped at the UI edge in `page.tsx`; i18n via per-domain TS message objects (`listsMessages` in `ui/lib/i18n/lists.ts`), never JSON files or inline strings; Alembic-only schema changes (new `list_settle_assertions` table, Task 3); UI wire snake_case → camelCase mapping happens at the fetch boundary, not in components; no Bearer/localStorage auth changes; Tailwind utilities co-located for any new component markup (`SimplifyPanel`, grid layout) — no new `.module.css`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.8` lines 1788-1834]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-26.md` — full rationale for pairwise grid / simplify / settle-clean-for-me]
- [Source: `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` FR-41 lines 746-756]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` AD-21 line 235-239, AD-1, AD-5, AD-6, AD-7, AD-10, AD-19]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` lines 277-281 — `components.balance-strip` anatomy]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` — `read_balances`/mutation-action ACL conventions]
- [Source: `_bmad-output/implementation-artifacts/5-7-wire-incomplete-balance-disclosure-on-strip.md` — defaulted-collaborator pattern, RSC-boundary `resolveHref` precedent, `balance_status` shape]
- [Source: `api/domain/settle.py` — `compute_settle_balance_for_list_members`, `LedgerEntryRecord`, `ListMemberView`]
- [Source: `api/application/lists.py:97-427` — `ListRepository` Protocol, `compute_viewer_balance_crc`, `GetListBalancesStubService`]
- [Source: `api/adapters/persistence/repositories.py:474,558` — `list_ledger_entries`, `list_members_with_alias`]
- [Source: `api/adapters/persistence/migrations/versions/0029_same_price_conflicts.py` — migration style precedent]
- [Source: `api/api/routes/lists.py:590-608`, `api/api/schemas/lists.py:130-133` — current balances route/schema]
- [Source: `ui/components/soft-ledger/BalanceStrip.tsx`, `ui/components/CopyButton/CopyButton.tsx`]
- [Source: `ui/app/lists/[listId]/page.tsx` — `asBalances`, `BalanceStrip` call site, RSC constraints]
- [Source: `ui/app/lists/ListDetailMobileActions.tsx`, `OriginChipPicker.tsx` — client-island-in-RSC pattern precedent]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Domain unit tests: `poetry run pytest tests/test_settle.py -q` — 22 passed.
- Full API suite via test overlay: `docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml -f docker-compose.test.yml run --rm --build api pytest -q` — 828 passed (includes new Story 5.8 integration/unit tests, real Postgres 16).
- Alembic migration verified against live Compose Postgres: `docker compose exec api alembic upgrade head` / `downgrade -1` / `upgrade head` round-trip clean; `\d list_settle_assertions` confirmed columns, unique constraint, FKs.
- UI: `npm run typecheck` clean; `npm run lint` — 0 errors (3 pre-existing warnings unrelated to this story); `npm run test` — 549 passed (includes new SettleControls/SimplifyPanel/BalanceStrip-grid tests and updated `asBalances` fixtures).
- `ruff check .` / `ruff format .` clean on the API tree after this story's changes.

### Completion Notes List

- Domain (Task 1): added `compute_pairwise_settle_balances`, `net_pairwise_edges`, `simplify_group_transfers` + `SuggestedTransfer` to `api/domain/settle.py`, mirroring the existing per-member entry-iteration loop without duplicating line-type/allocation logic. 12 new unit tests cover 2-/3-member pairwise edges, both-direction netting, the classic 3-person cycle, a 2-member single transfer, an all-zero no-invented-debts case, and an exact-Decimal sum-back-to-nets invariant check.
- Application (Task 2): extended `GetListBalancesStubService` to compute `you_are_owed`/`you_owe` via a new `compute_viewer_pairwise_edges` helper — `you_are_owed` and `balance_crc` always read the full ledger; `you_owe` is re-derived from entries with `created_at` strictly after any persisted settle assertion. Added `SimplifyGroupPlanService` (a read, like balances — returns the plan and `is_incomplete`, does not itself gate) and `SettlePayablesService` (idempotent upsert of a single settle-assertion timestamp, no ledger write). All new/extended dataclasses (`PairwiseEdge`, `ListBalancesStub`, `SimplifyGroupPlan`, etc.) are additive.
- Persistence (Task 3): new migration `0031_list_settle_assertions` (down-revision `0030_description_aliases`, confirmed via `alembic heads` before authoring) adds a single `list_settle_assertions` table, one row per `(list_id, actor_user_id)`. `SqlAlchemyListRepository` gained `upsert_settle_assertion` (Postgres `ON CONFLICT ... DO UPDATE`) and `get_settled_at`, both added to the `ListRepository` Protocol.
- API (Task 4): `ListBalancesStubResponse` gained additive `you_are_owed`/`you_owe` fields; added `SimplifyPlanResponse`/`TransferResponse`, `GET /{list_id}/settle/simplify` (409 `settle_incomplete` when blocked by unresolved conflicts, per AC #5 — never a silently empty 200), and `POST /{list_id}/settle` (204, no body, no request body accepted). Added `settle_payables` to the ACL's member-mutation allow-list in `domain/list_access.py` — verified it 403s before the addition and succeeds after, per AD-19's single-choke-point rule.
- UI (Task 5): `BalanceStrip` now supports a `variant="grid"` (3-column You are owed / You owe / Balance, no fake zero rows in empty columns) alongside the original `message` variant (kept for the empty/error/no-expenses states, so existing usages needed no changes beyond the new optional `variant` field). Added presentational `SimplifyPanel` (pure `simplifyPlanTextFrom` builder + `CopyButton` reuse — no second copy component) and a client-island `SettleControls` (fetch-on-demand Simplify with a calm 409-blocked state distinct from an empty 200 plan, and a Settle confirm dialog reusing `DiscardConfirmDialog`, same shape as the existing rollback-batch confirm). Added two same-origin BFF routes (`/api/lists/{id}/settle`, `/api/lists/{id}/settle/simplify`). All new EN/ES strings live in `ui/lib/i18n/lists.ts`; no inline literals. `page.tsx`'s `asBalances` defensively parses the new arrays (malformed/absent → `[]`, never fabricated).
- Tests (Task 6): API integration coverage in `test_lists_integration.py` for 2-/3-member pairwise edges, the settle-clears-you_owe-not-you_are_owed/balance invariant, the settle-timestamp boundary (new debt reappears), settle idempotency, non-member 403/404 on both new endpoints, simplify preserving nets, and simplify's 409 when a conflict touches the list. UI coverage added to `soft-ledger.test.tsx` (grid rendering, empty-column no-fake-zero-rows, `simplifyPlanTextFrom` edge cases, `SimplifyPanel` render states) and a new `SettleControls.test.tsx` (Simplify fetch/blocked/loaded states, Settle confirm → POST → `router.refresh()`).
- No deviations from the story's Dev Notes / anti-patterns list — `compute_settle_balance_for_list_members` and `compute_viewer_balance_crc` were reused unchanged; no inter-member transfer ledger lines are ever written; the 3-column grid and Simplify are not gated on member count (Epic 6 scope).

### File List

**API**
- `api/domain/settle.py` (modified) — `compute_pairwise_settle_balances`, `net_pairwise_edges`, `simplify_group_transfers`, `SuggestedTransfer`
- `api/domain/list_access.py` (modified) — `settle_payables` action
- `api/application/lists.py` (modified) — `PairwiseEdge`, `ListBalancesStub` (+2 fields), `ListPairwiseBalances`, `SuggestedTransferView`, `SimplifyGroupPlan(Command)`, `SettlePayablesCommand`, `compute_viewer_pairwise_edges`, `SimplifyGroupPlanService`, `SettlePayablesService`, `ListRepository` Protocol (+2 methods)
- `api/adapters/persistence/models.py` (modified) — `ListSettleAssertionModel`
- `api/adapters/persistence/repositories.py` (modified) — `upsert_settle_assertion`, `get_settled_at`
- `api/adapters/persistence/migrations/versions/0031_list_settle_assertions.py` (new)
- `api/api/schemas/lists.py` (modified) — `PairwiseEdgeResponse`, `ListBalancesStubResponse` (+2 fields), `TransferResponse`, `SimplifyPlanResponse`
- `api/api/routes/lists.py` (modified) — extended `get_list_balances_stub`; new `get_settle_simplify_plan`, `post_settle_payables`
- `api/tests/test_settle.py` (modified) — 12 new unit tests
- `api/tests/test_lists_integration.py` (modified) — 10 new integration tests + helpers

**UI**
- `ui/components/soft-ledger/BalanceStrip.tsx` (modified) — added `variant="grid"`
- `ui/components/soft-ledger/SimplifyPanel.tsx` (new)
- `ui/components/soft-ledger/soft-ledger.test.tsx` (modified) — new grid/SimplifyPanel tests
- `ui/app/lists/SettleControls.tsx` (new)
- `ui/app/lists/SettleControls.test.tsx` (new)
- `ui/app/lists/[listId]/page.tsx` (modified) — `asBalances`/`BalancesPayload` pairwise parsing, `pairwiseRowsFrom`, grid wiring, `SettleControls` wiring
- `ui/app/lists/[listId]/page.balanceStrip.test.ts` (modified) — updated `asBalances` fixtures, new pairwise-parsing cases
- `ui/app/api/lists/[listId]/settle/route.ts` (new)
- `ui/app/api/lists/[listId]/settle/simplify/route.ts` (new)
- `ui/lib/i18n/lists.ts` (modified) — new EN/ES keys

**Sprint tracking**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — status → in-progress → review

## Change Log

| Date | Change |
|------|--------|
| 2026-08-29 | Story created via create-story workflow. Ultimate context engine analysis completed - comprehensive developer guide created. |
| 2026-08-29 | Implemented Story 5.8: pairwise settle-up grid, Simplify group-transfer plan, Copy-to-share, and payable-clean Settle assertion. All 6 tasks complete; 828 API tests + 549 UI tests passing (Postgres 16 integration + vitest). Status → review. |
