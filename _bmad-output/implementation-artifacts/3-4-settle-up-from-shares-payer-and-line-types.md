---
baseline_commit: b3fd6d1
---

# Story 3.4: Settle-up from shares, payer, and line types

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member,
I want settle-up computed from per-transaction shares, payer, and included line types,
So that the strip shows who should return what in CRC and stays ready for v2 payments.

## Acceptance Criteria

1. **Given** committed expenses with share allocations and an explicit payer
   **When** settle-up is computed for the list period
   **Then** suggested balances preserve net positions from those allocations (FR-44)
   **And** Soft-Ledger strip shows plain who-owes-whom in CRC with owe/owed polarity (UX-DR17)

2. **Given** lines with excluded types (payment, interest, fee, voluntary_service, installment_schedule, balance_forward, unclassified credit_note, etc.)
   **When** settle-up runs
   **Then** those lines do not change member settle balances (FR-45)
   **And** included types are purchases and classified purchase reversals only

3. **Given** percentage splits leave a leftover minor unit after floor-division
   **When** allocations are applied
   **Then** remainder goes to the list creator (AD-6)

4. **Given** a manual expense is added (Story 3.2)
   **When** I return to shared-expenses
   **Then** strip totals update to reflect the new shares (J5 → J2 demo path)

5. **And** no payment ledger writes occur — settle-up is computed shares only (AD-21)

## Tasks / Subtasks

- [ ] Task 0: Confirm hard prerequisites
  - [ ] **Branch:** create `feat/3/3-4-settle-up-from-shares-payer-and-line-types` from `main` @ `baseline_commit`. One story per branch (AD-13)
  - [ ] **Mandatory reads:** this story + `project-context.md` · Story 3.3 completion notes (how the balance stub is wired) · Story 3.2 completion notes (manual expense + shares) · Story 2.6 completion notes (split overrides domain) · ARCHITECTURE-SPINE.md AD-5 (money), AD-6 (split remainder), AD-21 (settle is computed not recorded)
  - [ ] **Hard deps on tip (all already shipped):** 3.3 balance strip wiring with the `"0"` stub · 3.2 manual expense entry with share allocations · 2.6 split override domain model (both-item level and list-default) · 2.5 configurable list default split · domain expense/ledger entry models with payer and share allocation fields · API routes for getting list expenses/balances
  - [ ] **Scope gate:** Implement `ComputeListSettleBalanceService` in `api/application/` that computes real balances from ledger entries grouped by member (AC #1). Replace the stub in `GetListBalancesStubService` with the real computation. **Out:** FX materialization (Story 3.5 — stay focused on CRC-only computations for now), incomplete-disclosure wiring (3.6), simplify algorithm (5.9), statement-cycle period selector (5.10). Compute balance for "the list period" as TODAY's view (single point-in-time); deferred period selection to Epic 5. **Excluded from AC #2 filter:** explicitly test the included line types (purchase, classified purchase reversal) and verify excluded types don't contribute; ignore unimplemented types (treat as pass-through if they exist in fixtures, but no new type def needed for this story).

- [ ] Task 1: Implement settle-up balance computation logic (AC: #1, #3, #5)
  - [ ] **Understand allocations architecture:** Allocations are **computed dynamically**, not stored. The `LedgerEntryRecord` has no allocations field. For each entry:
    - Query `SplitOverrideModel` where `subject_kind="receipt"` and `subject_id=entry.receipt_id`
    - Fetch list default split config from `ListDefaultSplitModel` (or application service if wrapped)
    - Call `compute_share_allocations()` from `api/domain/splits.py` with the entry amount, currency, overrides, defaults, member list, and list creator UUID (list.owner_id, not created_by)
    - Result is dict[UUID, Decimal] mapping member UUID → their share amount for that entry
  - [ ] In `api/domain/`, add a new pure-logic module `api/domain/settle.py` containing:
    ```python
    def compute_settle_balance_for_list_members(
        ledger_entries: list[LedgerEntryRecord],
        list_members: list[ListMemberView],
        list_owner_id: UUID,
        compute_allocations_fn: Callable,  # compute_share_allocations from splits.py
        get_split_override_fn: Callable,  # query fn (receipt_id) -> SplitOverrideModel | None
        get_list_default_split_fn: Callable,  # query fn (list_id) -> ListDefaultSplitConfig
        currency_exponent: int = 2,
    ) -> dict[UUID, Decimal]:
    ```
    Returns dict mapping member UUID → net CRC balance (positive = member is owed CRC; negative = member owes CRC out).
    
    **Algorithm:** For each ledger entry with line_type in (purchase, classified_purchase_reversal):
    - Compute allocations using the helper functions above
    - For each member in allocations:
      - If member == payer: balance[payer] += (entry.amount - allocations[member])  (paid minus their share)
      - Else: balance[member] -= allocations[member] (they owe); balance[payer] += allocations[member] (payer is owed)
    - If payer not in allocations: balance[payer] += entry.amount (paid it all, others owe them)
    
    Return aggregated balance dict. Validate invariant: sum(balances.values()) ≈ 0 (log warning if violated; indicates allocation or data bug).
  
  - [ ] Write unit tests in `api/tests/test_settle.py` covering:
    - **Simple case:** Alice pays ₡1000, 50/50 with Bob → Alice: +₡500, Bob: -₡500
    - Single payer, single recipient: payer balance negative (owes), recipient positive (owed)
    - Multiple members with mixed payers and splits
    - Excluded line types (fee, payment, interest, voluntary_service) are **skipped** — verify they don't change balances
    - Percentage split with remainder going to list creator (via allocations computed correctly)
    - Edge case: no expenses → all balances zero
    - Edge case: expense with only payer in allocations (paid for self only)
    - Invariant check: sum of balances = 0
    - **Double-count prevention:** Expense with per-item override; verify allocation is at receipt level only, not item+receipt sum

- [ ] Task 2: Integrate settle computation into the application service layer (AC: #1)
  - [ ] **Replace** the stub service (do not add a parallel service). In `api/application/lists.py`, update `GetListBalancesStubService.execute()`:
    - Fetch ledger entries: `ledger_entries = self._repo.list_ledger_entries(command.list_id)` → list[LedgerEntryRecord]
    - Fetch list object: `list_record = self._repo.get_list(command.list_id)` → includes `owner_id`
    - Fetch list members: `members = self._repo.get_list_members(command.list_id)` → list[ListMemberView]
    - Fetch list default split: `default_split = self._repo.get_list_default_split(command.list_id)` → includes mode and shares_by_member dict
    - Batch-fetch split overrides: `overrides_by_receipt = self._repo.get_split_overrides_for_receipts([e.receipt_id for e in ledger_entries])` → dict[UUID, SplitOverrideModel]
    - Call: `all_balances = compute_settle_balance_for_list_members(ledger_entries, members, list_record.owner_id, compute_share_allocations, ...helpers...)`
    - Extract authenticated user's balance: `user_balance = all_balances.get(user_id, Decimal("0"))`
    - Return `ListBalancesStub(list_id=command.list_id, balance_crc=str(user_balance))`
    - **Note:** The domain-level settle function is pure logic; ACL/membership checks stay at the route level (Story 2.2's `read_balances` ACL already enforces membership before this service runs)
  - [ ] Write integration tests in `api/tests/test_lists_integration.py`:
    - **J5 → J2 demo path:** Create list with 2 members, add manual expense with split, fetch `/balances` as each member, verify balance reflects new shares
    - Verify balances update correctly when a new expense is added (refresh → new balance)
    - Verify zero balance when: no expenses exist, all expenses are settled/canceled, or only excluded-type expenses exist
    - Verify different users on same list see their own perspective (Alice sees what she's owed/owes, Bob sees his perspective)
    - Regression: non-member still gets 404 on `GET /lists/{id}/balances` (existing ACL remains unbroken)

- [ ] Task 3: Wire the real balance into the UI strip state machine (AC: #1, #4)
  - [ ] Story 3.3 already wired the stub balance through `balanceStripPropsFrom()`. Now that the balance endpoint returns real numbers (instead of `"0"`):
    - The strip should automatically render owe/owed/zero states based on the real balance values
    - No UI changes needed; the stub→real transition happens transparently at the API boundary
    - Verify the demo path works: add manual expense → observe strip update (refresh or via `router.refresh()`)
  - [ ] Regression test in `ui/app/lists/[listId]/page.balanceStrip.test.ts`:
    - The `balanceStripPropsFrom()` helper already tests tone mapping; verify it works for real positive/negative/zero values, not just stub `"0"`

- [ ] Task 4: Verify line-type filtering and balance correctness (AC: #2)
  - [ ] Add test data to `api/tests/fixtures/` (or inline in test code) with mixed line types:
    - A purchase (included)
    - A payment, fee, interest (excluded) — these should be ignored even if present
    - Verify the balance computation includes only purchase and classified-purchase-reversal types
  - [ ] If any unimplemented line types exist in the current schema, add a comment in the test explaining the filtering rule and why they're excluded
  - [ ] Test with real expense data from Story 3.2 seeds (manual expenses with hand provenance and line_type="purchase")

- [ ] Task 5: Code quality and CI (AC: #1–#5)
  - [ ] `api`: `python -m pytest` — domain tests (`test_settle.py`), application tests (`test_lists_integration.py`), and API route tests all pass
  - [ ] `api`: `uv run ruff check . && uv run ruff format .` — linting and formatting clean
  - [ ] `ui`: `npx typecheck && npx lint && npx test` — no regressions from the transparent balance update
  - [ ] Confirm `api/` balance endpoint still enforces `read_balances` ACL (non-members → 404); no regression
  - [ ] Manual test (J5 → J2): create a list with members, add a manual expense with a split, verify the shared-expenses view renders the correct owe/owed/zero state on the strip

## Dev Notes

### Critical product pins

| Pin | Rule |
|-----|------|
| Balance polarity | **CRITICAL:** Positive = member **is owed** CRC (they should receive); negative = member **owes** CRC out (they should pay). Example: Alice pays ₡1000 for 50/50 with Bob → Alice: +₡500 (owed to her), Bob: -₡500 (he owes). |
| Balance scope | Compute balance for "TODAY's view" — a single point-in-time. Deferred period selection (statement cycles, date ranges) to Epic 5 Story 5.10. This story computes what the API returns when no period param is passed. |
| Line types | Only purchases and classified purchase reversals contribute to settle-up. Exclude: payment, interest, fee, voluntary_service, installment_schedule, balance_forward, unclassified credit_note, other. Unimplemented types: skip without error; just don't feed them to settle math. |
| Remainder rule | After percentage-share floor-division, remainder goes to list creator. This rule is already enforced at allocation-compute time (Story 2.6). Settle-up function only reads the final allocated amounts; no re-computation needed here. |
| Allocations are dynamic | Allocations are **computed on-the-fly**, not stored in LedgerEntryRecord. Must call `compute_share_allocations()` with split overrides + list defaults. See Task 1 data dependencies. |
| No payment recording | AD-21 is firm: settle-up is computed from shares, not from recorded payments. There is no "payment ledger"; balances are always recomputed from expense shares on-demand. |
| Invariant | Sum of all member balances should equal 0 (balanced system). A deviation indicates a data bug elsewhere. Log a warning if violated; don't error. |

### Settle-up computation algorithm

**Simple worked example (Alice pays ₡1000, 50/50 with Bob):**
```
Entry: payer=Alice, amount=₡1000, currency=CRC, line_type=purchase
Allocations: {Alice: ₡500, Bob: ₡500}
Computation:
  For Alice (payer in allocations):
    balance[Alice] += (₡1000 - ₡500) = +₡500  (she paid ₡1000, her share is ₡500, net owed to her)
  For Bob (not payer):
    balance[Bob] -= ₡500 = -₡500  (he owes ₡500)
    balance[Alice] += ₡500 = +₡500  (already above; redundant here for clarity)
Result: {Alice: +₡500, Bob: -₡500}
```

**Pseudocode (full logic):**
```
balance_dict = {each member UUID: Decimal(0)}

For each ledger entry in list:
  If line_type NOT IN (purchase, classified_purchase_reversal):
    Skip entry (excluded type)
  
  payer_id = entry.payer_id
  amount = entry.amount  (assume CRC for this story)
  allocations = compute_share_allocations(  # computed dynamically, not stored
    entry, list_defaults, split_overrides, members, list_creator_id
  ) → dict[UUID, Decimal]
  
  For each (member_id, share_amount) in allocations:
    If member_id == payer_id:
      balance[payer_id] += (amount - share_amount)
    Else:
      balance[member_id] -= share_amount
      balance[payer_id] += share_amount
  
  If payer_id NOT in allocations.keys():
    balance[payer_id] += amount

Return balance_dict  (positive = owed to member; negative = member owes)
Validate: sum(balance_dict.values()) == 0  (log warning if not)
```

### Architecture compliance

[Source: `architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-5:** Money is Postgres NUMERIC + Python Decimal; settle-up function uses Decimal throughout (never float)
- **AD-6:** Remainder after floor-division goes to list creator; already handled at allocation-compute time (2.6)
- **AD-19:** Membership ACL enforced at route level (`read_balances` → 404); settle function is pure and doesn't check membership (application service layer owns that)
- **AD-21:** v1 settle-up is computed shares only; no payment ledger. Function computes balances from expense shares, not from a separate payment table
- **AD-1:** Domain (`api/domain/settle.py`) has no FastAPI / SQLAlchemy imports; pure business logic

### File structure requirements

**API side (implement settle computation):**
```
api/
  domain/
    settle.py                          # NEW — pure compute_settle_balance_for_list_members(...)
  application/
    lists.py                           # UPDATE — GetListBalancesStubService.execute() calls settle function
  adapters/persistence/
    repositories.py                    # VERIFY these methods exist (or add them):
                                       # - list_ledger_entries(list_id)
                                       # - get_list(list_id)  
                                       # - get_list_members(list_id)
                                       # - get_list_default_split(list_id)
                                       # - get_split_overrides_for_receipts(receipt_ids)
  tests/
    test_settle.py                     # NEW — unit tests for settle balance computation
    test_lists_integration.py          # UPDATE — add tests for /balances endpoint with real balances
    (use existing 3.2 manual expense seeds; no fixture changes)

ui/
  app/lists/[listId]/page.balanceStrip.test.ts   # UPDATE — test tone mapping with real balance values
  (no changes to page.tsx; strip rendering handles real numbers transparently)
```

**Query methods to verify/add in repositories.py:**
- `get_list_members(list_id: UUID) -> list[ListMemberView]` — fetch members with aliases
- `get_split_override(subject_id: UUID, subject_kind: str = "receipt") -> SplitOverrideModel | None` — single override
- `get_split_overrides_for_receipts(receipt_ids: list[UUID]) -> dict[UUID, SplitOverrideModel]` — batch fetch
- `get_list_default_split(list_id: UUID) -> ListDefaultSplitConfig` — mode + shares_by_member dict

### Deferred work and out-of-scope

- **FX materialization** (Story 3.5): Assume all amounts are already in CRC. Do not add `amount_crc` / `fx_rate` computation; that's 3.5's job. For now, use `entry.amount` and assume it's in CRC when `entry.currency == "CRC"`.
- **Incomplete disclosure wiring** (Story 3.6): The strip shows balance; Story 3.6 adds an incomplete disclosure banner when quarantine affects the period. This story doesn't touch that.
- **Simplify / suggested transfers** (Story 5.9): Settle computation is the net per-member balance. Simplify applies an algorithm to reduce transfer count; out of scope here.
- **Statement-cycle period selector** (Story 5.10): This story computes balance for "NOW" (single point-in-time). Period selection is deferred.
- **Per-counterparty balance breakdown** (not in v1 ACs): Settle-up returns a single net CRC figure. DESIGN.md aspirational example ("You owe Partner ₡42,500") requires multiple counterparties and is out of v1 scope.

### Double-count prevention (critical!)

From deferred-work.md: "Settle double-count if summing receipt + item allocations — Epic 3.4 settle must choose one subject grain"

**Rule:** Allocations are computed at **receipt level only**. If item-level overrides exist (Story 3.2), they are **contained within** the receipt allocation computed by `compute_share_allocations()`. The settle function uses the final receipt-level allocation dict — it does NOT sum item-level + receipt-level overrides.

**Test this:** Create a receipt with 2 items. Override item-1 to whole-line for Alice. Override receipt to 50/50 between Alice & Bob. Verify settle computation uses the receipt-level allocation (50/50), not item-level + receipt-level combined.

### Previous story intelligence

#### From 3.3 (shared-expenses strip + receipt list) — immediate predecessor

- The strip is already wired to fetch `/lists/{id}/balances` and render the response through `balanceStripPropsFrom()` helper
- The balance endpoint currently returns stub `"0"` via `GetListBalancesStubService`
- When you replace the service to compute real balances, the UI automatically re-renders with real numbers
- The tone mapping (`balanceTone()`) and state machine (`balanceStripPropsFrom()`) are already correct; no UI changes needed

#### From 3.2 (manual expense + adjust split)

- Manual expenses are stored with `line_type="purchase"` and `payer_id=current_user` (default)
- Story 3.2 completion notes: `list_ledger_entries()` returns all ledger entries for the list; real manual-expense rows have `provenance="hand"`. No extra filtering needed in settle-up.
- **Critical:** Allocations are NOT stored; they're computed via `compute_share_allocations()` at the time of allocation (Story 2.6). Settle-up must recompute them dynamically.

#### From 2.6 (split overrides domain) — Critical for this story

- **Allocations are NOT stored:** There is no `ExpenseRecord.allocations` field. Allocations are **computed on-demand** via `compute_share_allocations()` function
- **Input to allocation computation:**
  - Receipt total amount + currency
  - Split override config (stored as SplitOverrideModel with `subject_kind="receipt"`)
  - List default split mode (even or percentage) + shares_by_member dict
  - List members (for validation and zero-share handling)
  - List creator UUID (for remainder assignment)
- **Output:** dict[UUID, Decimal] mapping member → their allocated share amount for that receipt
- The remainder from percentage floor-division is already assigned to list creator (inside `compute_share_allocations()`)
- Settle-up function calls `compute_share_allocations()` for each entry; no re-computation or re-division needed
- **Story 2.6 deferred note:** "Item override survival across list reassignment" — Story 5.5 must handle this; for 3.4, assume overrides don't move

### Git intelligence summary

```
b3fd6d1 Merge PR #29 — 3.3 shared-expenses balance strip wiring
04011ef feat(3.3): shared-expenses balance strip wiring with load-error handling
16691e1 feat(3.2): manual expense form with Adjust split and member aliases
5cec5de feat(3.1): Soft-Ledger tokens, primitives, list chrome
dcd3ab7 feat(2.6): item/receipt split overrides domain and API
```

Follow Conventional Commits (`feat(3.4): …`). This story touches:
- `api/domain/settle.py` (new)
- `api/application/lists.py` (update GetListBalancesStubService)
- `api/tests/test_settle.py` (new)
- `api/tests/test_lists_integration.py` (update)
- `ui/app/lists/[listId]/page.balanceStrip.test.ts` (update — optional if tone mapping logic already covered)

### Latest tech notes

No new libraries needed — this is pure domain logic using already-pinned `decimal.Decimal`. No web research required.

### Testing requirements

| Layer | Expectation |
|-------|-------------|
| domain | TDD red → green: write `test_settle.py` tests first, then implement `settle.py`. Tests cover single/multiple payers, excluded line types, remainder rule, zero-balance, invariant check. |
| application | Integrate settle function into `GetListBalancesStubService`; write integration test that adds expenses and fetches balance to verify end-to-end |
| api routes | No new routes; `GET /lists/{id}/balances` already exists and enforces ACL. Regression test ensures it still 404s for non-members. |
| ui | `balanceStripPropsFrom()` helper already unit-tested; optional extra case for real (non-stub) balance values. No E2E Playwright required. |
| Manual | J5 → J2 happy path: create list + members, add manual expense, refresh view, verify strip shows real balance (owe/owed/zero as appropriate) |

### Project context reference

Follow `_bmad-output/project-context.md`: no settlement-recording CTA ever (AD-21); pure money (Decimal, not float); balance is computed not stored; one story per branch; before marking done, add story-close how/why overview per `story-close-overview-checklist.md`.

### Anti-patterns (will fail review)

- **Balance polarity backwards:** Positive = owed to member (not member owes out). If reversed, settlement shows inverted amounts
- **Hard-coded allocations:** Assuming `entry.allocations` field exists. It doesn't. Must call `compute_share_allocations()` dynamically
- **Using `created_by` instead of `owner_id`:** List creator is `list.owner_id` field, not a separate `created_by` column
- **Using `amount_crc` field:** LedgerEntryRecord only has `amount` + `currency`. For now (3.4), assume it's in CRC; FX materialization is Story 3.5
- **Implement period-based filtering** — that's Story 5.10; compute for "NOW" only
- **Create a separate "payment ledger" table** — balances are always computed from expense shares (AD-21)
- **Use `float` instead of `Decimal`** — AD-5 is non-negotiable; all money is Decimal
- **Implement simplify/transfer-reduction algorithm** — that's Story 5.9; this story only computes net per-member balance
- **Add `BalanceStrip` `action` prop or settlement-recording control** — AD-21, never
- **Store computed balance in DB** — settle-up is computed on-demand; no new schema column needed
- **Skip excluded line types silently** — document the filtering rule in tests; verify they truly don't affect balances
- **Double-count allocations** — use receipt-level allocation only, don't sum item-level + receipt-level
- **Forget to validate invariant** — sum(balances) must equal 0; log warning if violated (indicates data bug)

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 3.4 ACs; FR-44, FR-45; AD-6, AD-21]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-5 (money), AD-6 (remainder), AD-21 (settle is computed)]
- [Source: `_bmad-output/implementation-artifacts/3-3-shared-expenses-view-strip-receipt-list.md` — how strip is wired to balance endpoint]
- [Source: `_bmad-output/implementation-artifacts/3-2-manual-expense-with-payer-adjust-split-ui.md` — expense/payer structure]
- [Source: `_bmad-output/implementation-artifacts/2-6-item-and-receipt-split-overrides-domain-api.md` — split allocation structure]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

Claude Haiku 4.5 (claude-haiku-4-5-20251001)

### Debug Log References

(none yet — story creation phase)

### Completion Notes List

(to be filled in after dev-story implementation)

### File List

(to be filled in after dev-story implementation)
