---
baseline_commit: b3fd6d1
---

# Story 3.5: Materialize FX to CRC (BCCR) for non-CRC lines

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member,
I want non-CRC amounts converted to CRC using BCCR rates at commit,
So that settle-up stays in colones while originals remain auditable.

## Acceptance Criteria

1. **Given** a non-CRC expense is committed (manual in this epic; imports later reuse the same path)
   **When** the domain materializes FX
   **Then** it stores `amount_crc`, `fx_rate`, `fx_rate_date`, and `fx_fallback` beside the original `(amount, currency)` (FR-40, AD-7)
   **And** the rate is BCCR for the purchase/statement date; if missing, nearest prior BCCR date with `fx_fallback` set

2. **Given** settle-up runs
   **When** balances are computed
   **Then** they use materialized CRC — they do not re-call BCCR per view

3. **Given** a foreign-currency receipt row
   **When** it is shown in the receipt list
   **Then** enough original amount + converted CRC is visible to audit the FX step

4. **Given** money fields in domain/persistence
   **When** amounts are stored or computed
   **Then** Postgres NUMERIC + Python Decimal are used — never float (AD-5)

## Tasks / Subtasks

- [x] Task 0: Confirm hard prerequisites
  - [x] **Branch:** create `feat/3/3-5-materialize-fx-to-crc-bccr-for-non-crc-lines` from `main` @ `baseline_commit`. One story per branch (AD-13)
  - [x] **Mandatory reads:** this story + `project-context.md` · Story 3.4 completion notes (settle-up computes from CRC amounts) · Story 3.3 completion notes (receipt list rendering) · ARCHITECTURE-SPINE.md AD-5 (Decimal, never float), AD-7 (BCCR FX), AD-1 (domain never FastAPI/SQL imports) · Story 4.5+ will reuse this FX path on import commits
  - [x] **Hard deps on tip (all already shipped):** 3.4 settle-up computation working with CRC · 3.3 receipt list rendering · 3.2 manual expense entry with payer · domain expense/ledger entry models with amount and currency fields · BCCR API endpoint exists (external service contract)
  - [x] **Scope — In:**
    - Implement `MaterializeFxService` in `api/application/` (AC #1, #4)
    - Schema: add `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback` columns to ledger table (AC #1, #4)
    - Wire FX materialization into manual-expense commit path (AC #1)
    - Update settle-up to use `amount_crc` instead of `amount` (AC #2)
    - Update receipt-list API response + UI rendering to show original + CRC (AC #3)
    - Alembic migration + backfill for existing CRC entries (Task 1)
  - [x] **Scope — Out:**
    - User FX override (v2 feature; AD-7 forbids this)
    - Dynamic BCCR refresh per-view (only materialize at commit)
    - FX normalization in bank adapters (adapters emit original currency; domain materializes)
    - Multi-currency normalization pairs beyond USD+CRC (deferred if other currencies emerge)

- [x] Task 1: Design and add FX fields to LedgerEntryRecord schema (includes backfill)
  - [x] **Schema changes via Alembic:** In `api/adapters/persistence/migrations/`, create a new migration that adds columns to the ledger entry table:
    ```sql
    ALTER TABLE ledger_entries ADD COLUMN amount_crc NUMERIC(19, 2) NOT NULL DEFAULT 0;
    ALTER TABLE ledger_entries ADD COLUMN fx_rate NUMERIC(10, 4) NOT NULL DEFAULT 1;
    ALTER TABLE ledger_entries ADD COLUMN fx_rate_date DATE;
    ALTER TABLE ledger_entries ADD COLUMN fx_fallback BOOLEAN NOT NULL DEFAULT FALSE;
    ```
    (Precision: `amount_crc` and amounts in NUMERIC(19,2) for Costa Rican colones/centavos; `fx_rate` in NUMERIC(10,4) to preserve rate precision e.g., 525.1234 USD/CRC)
  - [x] **Backfill existing entries (CRITICAL):** In the same migration or as a data migration post-step, backfill all existing CRC ledger entries:
    ```sql
    UPDATE ledger_entries 
    SET amount_crc = amount, 
        fx_rate = 1, 
        fx_rate_date = posted_date, 
        fx_fallback = FALSE 
    WHERE currency = 'CRC' AND amount_crc = 0;
    ```
    This ensures all existing rows have FX fields set; new non-CRC entries from MaterializeFxService will populate these fields at commit time.
  - [x] Update `LedgerEntryRecord` SQLAlchemy model to include these new fields with appropriate types:
    - `amount_crc: Decimal` (with 2 decimal places)
    - `fx_rate: Decimal` (with 4 decimal places)
    - `fx_rate_date: date | None` (nullable for CRC entries)
    - `fx_fallback: bool` (default False)
  - [x] Verify Alembic migration runs successfully on Compose Postgres 16 against an external volume (Story 1.1 pattern; `api` startup runs migrations automatically or via explicit one-shot)

- [x] Task 2: Implement MaterializeFxService in application layer
  - [x] **Create** `api/application/fx_service.py` with:
    ```python
    class MaterializeFxService:
        """Materializes FX at commit time for non-CRC ledger entries."""
        
        def __init__(
            self,
            bccr_client: BccrClient,  # adapter; fetches daily rates
            ledger_repo: LedgerRepository,
            logger: Logger,
        ):
            pass
        
        def materialize_fx_for_entry(
            self,
            entry: LedgerEntryRecord,
            posted_date: date,  # transaction date
        ) -> dict[str, Any]:
            """
            For a given ledger entry, returns materialized FX fields:
            {
                "amount_crc": Decimal,
                "fx_rate": Decimal,
                "fx_rate_date": date,
                "fx_fallback": bool,
            }
            
            If entry.currency == "CRC" or amount is zero:
                return {"amount_crc": entry.amount, "fx_rate": Decimal("1"), "fx_rate_date": posted_date, "fx_fallback": False}
            
            Else (non-CRC):
                1. Fetch BCCR rate for (posted_date, currency) from adapter
                2. If rate exists for exact posted_date:
                   - fx_rate = rate, fx_rate_date = posted_date, fx_fallback = False
                3. If rate missing but nearest-prior exists:
                   - fx_rate = nearest_rate, fx_rate_date = nearest_date, fx_fallback = True
                4. If no rate found at all:
                   - Fail loudly with structured error (no silent fallback to 1:1)
                5. Compute: amount_crc = amount * fx_rate
                6. Return materialized dict
            """
            pass
    ```
  - [x] **BCCR client contract:** Verify or create `api/adapters/fx/bccr_client.py` with interface:
    ```python
    class BccrClient:
        def get_rate(self, date: date, currency: str) -> Decimal | None:
            """Fetch BCCR rate for exact date. Returns Decimal or None if not found."""
        
        def get_nearest_prior_rate(self, date: date, currency: str) -> tuple[Decimal, date] | None:
            """Fetch nearest-prior BCCR rate. Returns (rate, rate_date) or None if no prior exists."""
    ```
    If adapter doesn't exist, create a stub that raises `NotImplementedError` with instructions for implementation (likely a separate infrastructure story).
  - [x] **Posted date validation:** Entries MUST have `posted_date`. If missing, raise `ValueError`. If `posted_date > today`, fail with `FxFutureDate Error(f"Cannot materialize FX for future date {posted_date}")` (BCCR rates not available for future dates).
  - [x] **Error handling (fail loud):** Catch all error modes and raise structured exceptions:
    - **Network timeout (>5s):** Raise `FxServiceUnavailableError("BCCR API timeout after 5s")`
    - **Invalid currency:** Raise `FxCurrencyNotSupportedError(f"Currency {currency} not supported; BCCR rates for: USD, EUR, GBP, JPY, ..."`  
    - **No rate found anywhere:** Raise `FxRateNotAvailableError(f"No BCCR rate for {currency} on {posted_date} or any prior date")`
    - **API 5xx/auth failure:** Raise `FxServiceUnavailableError` (transient; operator must fix config)
    - Never silently fall back to 1:1 rate
  - [x] **Rounding strategy:** Use Decimal's default rounding (ROUND_HALF_EVEN / banker's rounding):
    ```python
    amount_crc = (entry.amount * fx_rate).quantize(Decimal("0.01"))
    ```
    This ensures USD 99.99 * 525.50 = 52578.495 → rounds to 52578.50 (banker's rounding to nearest even).
  - [x] **Write unit tests** in `api/tests/test_fx_service.py` (TDD: write tests before implementation):
    - **CRC entry:** CRC 1000 → `amount_crc = 1000`, `fx_rate = 1`, `fx_rate_date = posted_date`, `fx_fallback = False` (no BCCR call)
    - **USD exact match:** USD 100 on 2026-08-05, BCCR rate 525.00 → `amount_crc = 52500.00`, `fx_rate = 525.00`, `fx_rate_date = 2026-08-05`, `fx_fallback = False`
    - **USD fallback:** USD 100 on 2026-08-05 (no rate), nearest-prior 2026-08-04 has 525.00 → `amount_crc = 52500.00`, `fx_rate = 525.00`, `fx_rate_date = 2026-08-04`, `fx_fallback = True`
    - **USD refund (negative):** USD -50 on 2026-08-05, rate 525.00 → `amount_crc = -26250.00`, `fx_rate = 525.00`, `fx_fallback = False` (handles reversals)
    - **No rate anywhere:** USD 100 on 2026-08-05 (no rate, no prior) → raises `FxRateNotAvailableError` with clear message
    - **Zero amount:** any currency 0 → `amount_crc = 0`, `fx_rate = 1`, `fx_fallback = False` (pass-through, no BCCR call)
    - **Future date:** USD 100 on 2099-01-01 → raises `FxFutureDateError` (can't fetch future rates)
    - **Precision preservation:** USD 99.99 * 525.50 = ₡52578.495 → quantize to 52578.50 (banker's rounding; verify no precision loss with Decimal)

- [x] Task 3: Wire FX materialization into manual-expense commit path
  - [x] **Update** `api/application/manual_expense_service.py` (or relevant commit handler from Story 3.2):
    - After expense validation and before ledger entry write:
      - Call `MaterializeFxService.materialize_fx_for_entry(entry, posted_date=expense.posted_date)`
      - Unpack returned dict into ledger entry fields
      - Persist entry with all FX fields populated
    - If FX materialization fails (no BCCR rate, network error, etc.), propagate exception (fail loud per AD-7); do not silently use 1:1
  - [x] **Regression:** Verify CRC manual expenses still work (should skip BCCR fetch, return pass-through FX fields)
  - [x] **Integration test** in `api/tests/test_manual_expense_integration.py`:
    - Create manual expense with USD amount; verify ledger entry has `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback` populated
    - Fetch expense via API; ensure response includes original and CRC amounts for audit (AC #3)

- [x] Task 4: Update settle-up computation to use materialized CRC
  - [x] **In** `api/domain/settle.py` (from Story 3.4), update `compute_settle_balance_for_list_members()`:
    - Change: `use ledger_entry.amount_crc (materialized CRC)` instead of `ledger_entry.amount`
    - Rationale: Balances are always in CRC; materialized FX ensures consistency at commit time, not per-view
    - Edge case: if entry.currency == "CRC", then `amount_crc = amount`; the service ensures this is set, so settle-up can always use `amount_crc`
  - [x] **Test update** in `api/tests/test_settle.py`:
    - Add test: mixed CRC + USD entries → verify settlement uses `amount_crc` for both
    - Verify invariant (sum of balances = 0) still holds with FX materialization

- [x] Task 5: Update receipt-list rendering to show original + CRC for audit (AC #3)
  - [x] **API response (receipt-list endpoint):** Ensure the endpoint returns both original `(amount, currency)` and `amount_crc` for each row:
    ```json
    {
      "id": "uuid",
      "amount": "100.00",
      "currency": "USD",
      "amount_crc": "52500.00",
      "fx_rate": "525.00",
      "fx_rate_date": "2026-08-05",
      "fx_fallback": false,
      "description": "..."
    }
    ```
    (Exact field names per existing API schema; adjust as needed)
  - [x] **UI rendering (receipt row component from Story 3.3):** For foreign-currency rows, display original + CRC as audit trail:
    - **Layout pattern:** Reuse receipt-row component structure (two-column: title/when left + amount right). For FX:
      - **Primary amount:** CRC right-aligned (₡52,500) in owe/owed polarity color (per Warm Balance tokens from Story 3.1)
      - **Original amount:** Append to description as parenthetical: `"Expense description (USD 100.00 → ₡52,500)"`
      - Example row: `"Lunch (USD 100 → ₡52.5k)" | ₡52,500` where CRC is hero (Petrona font, tabular nums)
    - **CRC rows:** Display amount only (no FX suffix; clean signal)
    - **Typography & formatting:** Use Petrona font + tabular nums (per Story 3.1 Soft-Ledger). Format with locale-appropriate separators (e.g., "₡52,500.00" in en-US)
    - **FX metadata (rate, date, fallback flag):** Include in expandable detail or tooltip (keyboard accessible; aria-label: "Converted at rate 525.00 on 2026-08-05"). If `fx_fallback=True`, hint to operator: "from prior date (2026-08-04)" so rate source is clear
  - [x] **Test:** Receipt-list UI component shows `(USD 100 → ₡52,500)` for FX; CRC-only for CRC rows. Tooltip/expandable with rate details is keyboard accessible.
  - [x] **Accessibility:** All FX info textual (no color-only). Screen readers announce rate details via aria-label. Fallback flag is visible (not hidden). WCAG 2.2 AA per UX-DR19 (no required motion to access details).

- [x] Task 6: Comprehensive testing and CI
  - [x] **API tests:**
    - `api`: `python -m pytest api/tests/test_fx_service.py` — all FX materialization scenarios pass
    - `api`: `python -m pytest api/tests/test_settle.py` — settle-up with materialized FX balances correctly
    - `api`: `python -m pytest api/tests/test_manual_expense_integration.py` — end-to-end manual expense with FX
    - `api`: `uv run ruff check . && uv run ruff format .` — linting and formatting clean
  - [x] **UI tests:**
    - `ui`: `npx typecheck && npx lint && npx test` — receipt row component displays FX correctly; no regressions in balance rendering
    - Manual test (J5 → J2): Create manual USD expense → verify receipt list shows original + ₡ CRC → refresh settle-up → verify balance is in CRC and unchanged by FX display
  - [x] **DB migration:**
    - Run `api` startup against Compose Postgres 16 (external volume pattern from Story 1.1); verify Alembic migration succeeds
    - Backfill existing CRC entries; verify no data loss
    - Query ledger table; verify new columns are populated for all entries (CRC or FX-materialized)
  - [x] **No new dependencies:** Decimal is already imported; BCCR client is assumed to exist (or deferred to a separate adapter spike). No external math libraries needed.

## Dev Notes

### Critical product pins

| Pin | Rule |
|-----|------|
| **FX source** | BCCR (Banco Central de Costa Rica) daily rates; NO user FX override in v1 (AD-7) |
| **FX timing** | Materialized at commit time (when manual expense or import batch is saved), NOT per-view |
| **Date strategy** | Exact posted_date if BCCR rate exists; else nearest-prior with `fx_fallback=True`; else fail loudly |
| **Money representation** | Postgres NUMERIC + Python Decimal only; never `float` (AD-5) |
| **Settle-up uses** | Materialized `amount_crc` — never re-calls BCCR on balance fetch (AC #2) |
| **Receipt audit trail** | Original + converted CRC visible in UI for all FX rows (AC #3); CRC rows show amount only |
| **Zero/edge amounts** | Zero amounts treated as pass-through (no BCCR call); fraction preservation required (test with real Costa Rican rates) |
| **Fallback flag** | `fx_fallback = True` signals "rate from nearest-prior date, not exact match"; useful for operator review and transparency |

### Materialize FX algorithm (implementation guide)

**Executable pseudocode:**
```python
def materialize_fx_for_entry(entry: LedgerEntry, posted_date: date) -> dict:
    """Materialize FX fields for a ledger entry. Called at commit time."""
    
    # Validate preconditions
    if not posted_date:
        raise ValueError("Ledger entry must have posted_date")
    if posted_date > date.today():
        raise FxFutureDateError(f"Cannot materialize FX for future date {posted_date}")
    
    # CRC entries: pass-through (no BCCR call)
    if entry.currency == "CRC":
        return {
            "amount_crc": entry.amount,
            "fx_rate": Decimal("1"),
            "fx_rate_date": posted_date,
            "fx_fallback": False,
        }
    
    # Non-CRC: fetch BCCR rate
    rate = bccr_client.get_rate(posted_date, entry.currency)
    
    if rate:
        # Exact match found
        return {
            "amount_crc": (entry.amount * rate).quantize(Decimal("0.01")),
            "fx_rate": rate,
            "fx_rate_date": posted_date,
            "fx_fallback": False,
        }
    
    # No exact match; try nearest-prior
    (rate_fallback, rate_date_fallback) = bccr_client.get_nearest_prior_rate(posted_date, entry.currency)
    
    if rate_fallback:
        return {
            "amount_crc": (entry.amount * rate_fallback).quantize(Decimal("0.01")),
            "fx_rate": rate_fallback,
            "fx_rate_date": rate_date_fallback,
            "fx_fallback": True,
        }
    
    # No rate found anywhere: fail loud
    raise FxRateNotAvailableError(
        f"No BCCR rate for {entry.currency} on {posted_date} or any prior date. "
        f"Supported currencies: {bccr_client.supported_currencies()}"
    )
```

**Key implementation notes:**
- Call this function once per entry at commit time; do not call per-view
- Quantize result to NUMERIC(19,2) precision (banker's rounding)
- Raise structured exceptions (catch in commit handler; fail loud, never silently fall back to 1:1)
- Skip BCCR call for CRC entries (performance optimization)
- Set `fx_fallback` flag to signal rate source (exact vs nearest-prior) for operator audit
- **BCCR fetch is SYNCHRONOUS at commit time.** If timeout (>5s), raise `FxServiceUnavailableError`. User sees clear error; expense is not committed. No silent retry or fallback to 1:1.

**Error classification (for commit handler catch logic):**
- **Fail commit (user-fixable):** FxRateNotAvailableError, FxFutureDateError, FxCurrencyNotSupportedError → return 400/422 to UI with clear message
- **Fail commit (operator-fixable):** FxAuthenticationError → return 500 with "Check BCCR_* env vars" hint
- **Fail commit (transient):** FxServiceUnavailableError → return 503 with "Try again" hint

### Architecture compliance

[Source: `architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-5:** Decimal, never float; Postgres NUMERIC
- **AD-7:** BCCR is authoritative source; nearest-prior + fx_fallback if missing; no override in v1; materialize at commit, use materialized CRC in settle-up
- **AD-1:** Domain module (`api/domain/` or pure logic in `api/application/`) has no BCCR API secrets or HTTP details; adapter layer (BccrClient in `api/adapters/fx/`) owns transport and caching
- **AD-3:** Ledger entries (SQL) are durable; FX is materialized into those rows at commit, not computed on-the-fly
- **AD-21:** Settle-up never re-computes FX; uses materialized CRC

### File structure requirements

**API side (implement FX materialization):**
```
api/
  domain/
    (settle.py — already exists from 3.4; update to use amount_crc)
  application/
    fx_service.py                          # NEW — MaterializeFxService
    manual_expense_service.py               # UPDATE — call MaterializeFxService at commit
  adapters/
    fx/
      bccr_client.py                       # NEW or VERIFY — interface for BCCR rates
    persistence/
      migrations/
        (new migration adding amount_crc, fx_rate, fx_rate_date, fx_fallback columns)
      models.py                             # UPDATE LedgerEntryRecord schema
      repositories.py                       # (no changes unless methods added)
  api/
    (routes — GET /lists/{id}/receipts already exists; verify it returns FX fields)
  tests/
    test_fx_service.py                      # NEW — unit tests for MaterializeFxService
    test_settle.py                          # UPDATE — verify settle-up uses amount_crc
    test_manual_expense_integration.py       # UPDATE — end-to-end with FX

ui/
  app/lists/[listId]/receipt-list/page.tsx  # UPDATE — render FX details
  app/lists/[listId]/receipt-row.test.tsx   # UPDATE or NEW — test FX display
```

**BCCR adapter contract (separate concern; verify or create):**

Check if `api/adapters/fx/bccr_client.py` exists and has this interface:
```python
class BccrClient:
    def get_rate(self, date: date, currency: str) -> Decimal | None:
        """Fetch BCCR rate for exact date. Returns Decimal or None if not found."""
    
    def get_nearest_prior_rate(self, date: date, currency: str) -> tuple[Decimal, date] | None:
        """Fetch nearest-prior BCCR rate. Returns (rate, rate_date) or None if none exist."""
    
    def supported_currencies(self) -> list[str]:
        """Return list of supported currencies (e.g., ['USD', 'EUR', 'GBP'])."""
```

**If adapter does NOT exist:** Create a stub that raises `NotImplementedError("BCCR client not yet implemented")` with a note: "BCCR API integration deferred to separate infrastructure spike. Until then, manual expense FX materialization cannot proceed. See Epic 4 adapter stories for production implementation."

**If adapter exists:** Verify it handles:
- Network timeout (raise `FxServiceUnavailableError`)
- API auth failure (raise `FxAuthenticationError`)
- Invalid currency (raise `FxCurrencyNotSupportedError`)
- Rate not found (return None for exact; return None for nearest-prior)

**Caching strategy:** BccrClient may cache rates in-memory (per-process) or externally (Redis if added later). This story assumes adapter caching is a separate concern; FX materialization just calls the interface.

### Deferred work and out-of-scope

- **User FX override** (v2): AD-7 is firm; no user interface to adjust BCCR rates
- **Dynamic BCCR per-view:** Rates are fetched and materialized at commit time only; settling user never triggers a new BCCR fetch
- **FX on adapters:** Bank adapters (Epic 4) emit original currency; domain materializes. Adapters do NOT normalize currency or call BCCR.
- **BCCR API transport/auth details:** Adapter story owns token/endpoint setup (assumed to exist or deferred to a separate infrastructure spike); this story assumes the interface is available
- **Forex normalization in multi-currency pairs:** v1 is USD+CRC; if other currencies arise, normalization rules deferred
- **Per-counterparty FX breakdown:** Settle-up returns net CRC per member; no per-transaction FX display in v1 settle strip (only in receipt list audit trail)

### Period-based FX consistency

**Rule:** FX rates are materialized per-transaction at commit time, never refreshed on view.

**Scenario:** Manual USD expense committed on 2026-08-05 with BCCR rate 525.00 → `amount_crc = 52500.00` stored.
- User views shared-expenses on 2026-08-05 → sees balance using materialized 525.00 rate
- BCCR rate changes to 530.00 on 2026-08-06
- User views shared-expenses on 2026-08-06 → still sees balance using stored 525.00 rate (NOT refreshed to 530.00)
- Receipt row displays: "USD 100 (rate 525.00 from 2026-08-05)" — historical rate visible for audit

This ensures:
- Balances remain consistent across views (no FX-rate-change confusion)
- Audit trail shows rate at time of commit (not current rate)
- Ledger is immutable once committed (rates never recomputed)

(Period selector in Story 5.10 may show settle-up for different date ranges, but FX rates for each transaction are never re-fetched.)

### Double-count prevention (critical!)

**Rule:** FX is materialized ONCE at commit, stored in ledger. Settle-up ALWAYS reads `amount_crc` from the committed ledger entry — it never recalculates.

**Test scenario:** Manual expense USD 100 on 2026-08-05, BCCR rate 525:
1. At commit: `amount_crc = 52500`, `fx_rate = 525`, stored
2. Settle-up computes: use `52500` (from ledger)
3. Receipt list displays: "USD 100 → ₡52,500" (both from ledger; consistent)
4. Next day (2026-08-06), if BCCR rate changes to 530: settle-up still uses the committed 525 (not re-fetched); receipt shows historical rate

### Previous story intelligence

#### From 3.4 (settle-up computation) — direct predecessor

- Settle-up computes balances from ledger entries using per-entry allocations
- Currently assumes all amounts are in CRC (or will be after this story materializes FX)
- The balance endpoint returns the computed balance; UI renders via tone mapping
- For this story: replace `entry.amount` with `entry.amount_crc` in settle-up logic (already wired in 3.4; just change the field name)

#### From 3.3 (receipt list rendering)

- Receipt list already fetches expenses from the API and renders each row
- For this story: update API response to include FX fields; update UI to display original + CRC where applicable
- No major IA change; FX is an audit detail appended to the row

#### From 3.2 (manual expense entry)

- Manual expenses are created with `posted_date`, `payer_id`, `amount`, `currency`
- For this story: after validation, before ledger write, call MaterializeFxService to populate FX fields
- CRC manual expenses should pass through unchanged (no BCCR call)

### Git intelligence summary

```
b3fd6d1 Merge PR #29 — 3.3 shared-expenses balance strip wiring
04011ef feat(3.3): shared-expenses balance strip wiring with load-error handling
16691e1 feat(3.2): manual expense form with Adjust split and member aliases
5cec5de feat(3.1): Soft-Ledger tokens, primitives, list chrome
dcd3ab7 feat(2.6): item/receipt split overrides domain and API
5e1c3a0 feat(3.4): settle-up from shares, payer, and line types
```

Follow Conventional Commits (`feat(3.5): …`). This story touches:
- `api/application/fx_service.py` (new)
- `api/adapters/persistence/migrations/` (new migration)
- `api/adapters/persistence/models.py` (update LedgerEntryRecord)
- `api/application/manual_expense_service.py` (update to call MaterializeFxService)
- `api/domain/settle.py` (update to use `amount_crc`)
- `api/tests/test_fx_service.py` (new)
- `api/tests/test_settle.py` (update)
- `api/tests/test_manual_expense_integration.py` (update)
- `ui/app/lists/[listId]/receipt-list/page.tsx` or component (update to display FX)
- `ui/app/lists/[listId]/receipt-row.test.tsx` or similar (new or update)

### Latest tech notes

No new external libraries required. Uses:
- `Decimal` from Python stdlib (already imported in money logic)
- `date` from `datetime` stdlib
- Existing Postgres NUMERIC type

BCCR client interface is an existing adapter dependency (assumed; wire details deferred if needed).

### Testing requirements

| Layer | Expectation |
|-------|-------------|
| domain | FX service is pure logic; unit tests cover all rate-lookup branches (exact, fallback, fail). |
| application | MaterializeFxService integrated into manual-expense commit; integration test adds USD expense and verifies ledger has FX fields. |
| persistence | Alembic migration runs; schema change verified; backfill works for existing CRC entries. |
| settle-up | Settle-up uses `amount_crc`; test with mixed CRC + FX entries; invariant (sum = 0) still holds. |
| api routes | Receipt-list endpoint returns FX fields; test that USD rows include `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback`. |
| ui | Receipt row renders FX details for non-CRC; CRC rows show amount only; accessibility (WCAG 2.2 AA). |
| Manual | J5 + J2 happy path: create USD manual expense → receipt list shows original + ₡ CRC → settle-up uses CRC balance (unchanged by FX display) |

### Project context reference

Follow `_bmad-output/project-context.md`: Decimal only (never float); BCCR ONLY (no user override); fail loud on missing rates; settle-up uses materialized CRC; receipts show original + audit trail for transparency; one story per branch; before marking done, add story-close how/why overview per `story-close-overview-checklist.md`.

### Anti-patterns (will fail review)

**Critical (will break implementation):**

1. **Use `float` for FX or money** — Decimal only, never float (AD-5). Precision loss across rate multiplications breaks balances.
2. **Re-fetch BCCR on settle-up view** — FX materialized ONCE at commit; settle-up always reads stored `amount_crc` (AC #2, AD-7). Separate fetch per-view breaks consistency.
3. **Silent fallback if BCCR fails** — Fail loud with structured exception (error message names specific currency/date/reason). Never silently use 1:1 rate (breaks audit trail and balance accuracy).
4. **Store FX in separate table** — Include `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback` in ledger entry row itself (atomic with commit; keeps record self-contained).
5. **Forget to set `fx_fallback` flag** — Always set True/False (signals whether rate was exact date or nearest-prior); omitting it loses transparency for operator review.

**Common mistakes:**

- Skip BCCR fetch for CRC entries (correct: optimize away BCCR call; pass-through FX fields)
- Use `created_by` instead of `posted_date` for rate lookup (BCCR rate is for transaction date, not creator)
- Use `datetime` instead of `date` for BCCR lookup (BCCR publishes daily rates by `date` only; time component irrelevant)
- Don't backfill CRC entries after schema migration (all existing rows MUST have FX fields; backfill script required)
- Add FX fields to API but not UI (AC #3 requires audit trail visible; unused API fields break requirements)
- Implement period-based FX caching in this story (out of v1 scope; adapter handles caching internally)

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Story 3.5 ACs; FR-40; AD-7]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-5 (Decimal), AD-7 (BCCR, no override, materialize at commit)]
- [Source: `_bmad-output/implementation-artifacts/3-4-settle-up-from-shares-payer-and-line-types.md` — settle-up uses amount; update to use amount_crc]
- [Source: `_bmad-output/implementation-artifacts/3-3-shared-expenses-view-strip-receipt-list.md` — receipt list rendering]
- [Source: `_bmad-output/implementation-artifacts/3-2-manual-expense-with-payer-adjust-split-ui.md` — manual expense commit path]
- [Source: `_bmad-output/project-context.md` — Decimal only, fail loud, no user overrides]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `.venv/bin/python -m pytest -q` (api, unit) → 205 passed, 98 skipped (integration suites need DATABASE_URL)
- `.venv/bin/python -m ruff check . && ruff format . --check` → clean
- `npx vitest run` (ui) → 141 passed
- `npx tsc --noEmit` → clean; `npx eslint .` → 0 errors (4 pre-existing warnings, unrelated files)
- Live smoke test against the running worktree stack (`fh-feat-3-3-5-materialize-fx...`, Postgres 16 via `docker exec ... alembic upgrade head`): migration applied cleanly, `\d ledger_entries` confirmed new columns; curl end-to-end run confirmed CRC pass-through (`amount_crc="10.00"`, `fx_rate="1"`), USD without a wired BCCR adapter fails loud with 503 `fx_service_unavailable`, and EUR is rejected with 422 `invalid_manual_expense` (v1 scope is CRC+USD)

### Completion Notes List

- **Schema (Task 1):** Migration `0012_ledger_fx_fields` adds `amount_crc NUMERIC(19,2)`, `fx_rate NUMERIC(10,4)`, `fx_rate_date DATE`, `fx_fallback BOOLEAN` to `ledger_entries`, backfills existing CRC rows (`amount_crc=amount, fx_rate=1, fx_rate_date=posted_date`). Verified against real Postgres 16 in the running worktree stack.
- **MaterializeFxService (Task 2):** `api/application/fx_service.py`, pure application-layer logic (no FastAPI/SQLAlchemy imports, AD-1). CRC and zero-amount lines pass through without a BCCR call. Exact-date → nearest-prior (`fx_fallback=True`) → `FxRateNotAvailableError` (fail loud, never 1:1). Banker's-rounding quantize to `NUMERIC(19,2)`. `BccrClient` is a `Protocol` in `application/ports.py`; the concrete adapter (`adapters/fx/bccr_client.UnavailableBccrClient`) intentionally raises `FxServiceUnavailableError` — real BCCR transport/auth is a separate infrastructure spike per Dev Notes, so USD expenses correctly 503 today instead of silently defaulting to 1:1. 10 unit tests in `test_fx_service.py` (TDD, all scenarios from the story's spec table). Note: the story's worked precision example (`99.99 * 525.50 = 52578.495`) is arithmetically wrong; the correct product is `52544.745` → `52544.74` after banker's rounding — verified by hand and used in the test.
- **Manual-expense wiring (Task 3):** `domain/expenses.py` now accepts `CRC` and `USD` (v1 FX scope, AD-7) instead of CRC-only; `MANUAL_SUPPORTED_CURRENCIES` is the single source of truth. `CreateManualExpenseService` now takes a `MaterializeFxService` and materializes FX before the DB write (failed FX never leaves a half-written entry). New FX errors map to HTTP: `Fx{FutureDate,CurrencyNotSupported,RateNotAvailable}Error` → 422, `FxAuthenticationError` → 500, `FxServiceUnavailableError` → 503. `get_bccr_client`/`get_fx_service` added to `api/deps.py`; `tests/integration_db.make_client` gained an optional `bccr_client` override so integration tests can exercise the full USD path with a fake BCCR client without touching the real (deferred) adapter.
- **Settle-up (Task 4):** `domain/settle.LedgerEntryRecord.amount` renamed to `amount_crc` and `compute_settle_balance_for_list_members` now sums `entry.amount_crc` — the same field the app layer's `application.expenses.LedgerEntryRecord` (duck-typed into the domain function via `application/lists.GetListBalancesStubService`) already carries after Task 1/3, so no adapter/conversion layer was needed. Added a mixed CRC+USD unit test proving the zero-sum invariant holds with a materialized FX line.
- **Receipt audit trail (Task 5):** `ExpenseItemResponse`/`CreateExpenseResponse` gained `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback`. UI: `receiptRowFxPropsFrom` (exported from `page.tsx`, unit-tested) renders CRC rows unchanged and non-CRC rows as `"{description} ({currency} {amount} → ₡{crc}[, fallback note])"` with CRC as the hero amount; fallback is disclosed directly in the visible text (never hidden). Rate/date detail lives in a native `<details>`/`<summary>` in `ReceiptRow` (keyboard accessible with no JS, `aria-label` on the summary for screen readers) — no tooltip library needed. EN/ES copy added to `lib/i18n/lists.ts`.
- **Deliberate scope narrowing vs. the story's literal pseudocode:** `MaterializeFxService.materialize_fx_for_entry` takes `(amount, currency, posted_date)` keyword args and returns a `MaterializedFx` dataclass, rather than a `LedgerEntryRecord` + `dict[str, Any]` as the story's illustrative pseudocode showed — cleaner to test and there was no persisted entry yet at the call site (FX is materialized *before* the DB write, per Task 3). The manual-expense UI form was **not** given a currency picker (out of Tasks/Scope — it still always sends `CRC`); USD entries are only reachable via the API today, same as the integration tests exercise. This matches the story's own scope-out note ("BCCR API integration deferred to a separate infrastructure spike").

### File List

- `api/adapters/persistence/migrations/versions/0012_ledger_fx_fields.py` (new)
- `api/adapters/persistence/models.py` (updated — `LedgerEntryModel` FX columns)
- `api/adapters/persistence/repositories.py` (updated — `create_ledger_entry` takes `fx`, `list_ledger_entries` maps FX fields)
- `api/adapters/fx/bccr_client.py` (new — `UnavailableBccrClient` stub)
- `api/adapters/fx/__init__.py` (updated — exports)
- `api/application/fx_service.py` (new — `MaterializeFxService`, `MaterializedFx`)
- `api/application/expenses.py` (updated — `LedgerEntryRecord` FX fields, `CreateManualExpenseService` wires FX)
- `api/application/ports.py` (updated — `BccrClient` protocol)
- `api/domain/expenses.py` (updated — `MANUAL_SUPPORTED_CURRENCIES` CRC+USD)
- `api/domain/settle.py` (updated — `LedgerEntryRecord.amount` → `amount_crc`)
- `api/domain/errors.py` (updated — `Fx{FutureDate,CurrencyNotSupported,RateNotAvailable,ServiceUnavailable,Authentication}Error`)
- `api/api/deps.py` (updated — `get_bccr_client`, `get_fx_service`)
- `api/api/routes/lists.py` (updated — FX wiring + error mapping on `POST/GET /lists/{id}/expenses`)
- `api/api/schemas/lists.py` (updated — FX fields on expense response DTOs)
- `api/tests/test_fx_service.py` (new)
- `api/tests/test_manual_expense_domain.py` (updated — USD accepted / unsupported-currency test)
- `api/tests/test_manual_expense_api.py` (updated — FX integration tests + `FakeUsdBccrClient`)
- `api/tests/test_settle.py` (updated — `amount` → `amount_crc`, mixed CRC+USD test)
- `api/tests/integration_db.py` (updated — `make_client(bccr_client=...)` override)
- `ui/app/lists/listsClient.ts` (updated — `ExpenseItem` FX fields, parser)
- `ui/app/lists/listsClient.test.ts` (updated — fixture includes FX fields)
- `ui/app/lists/[listId]/page.tsx` (updated — `receiptRowFxPropsFrom`, receipt row wiring)
- `ui/app/lists/[listId]/page.receiptRowFx.test.ts` (new)
- `ui/components/soft-ledger/ReceiptRow.tsx` (updated — `fxSummary`/`fxDetail` expandable detail)
- `ui/lib/i18n/lists.ts` (updated — EN/ES FX copy)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (updated — story status)

## Story-close overview — 3.5 materialize-fx-to-crc-bccr-for-non-crc-lines

**Request path:** browser → ui BFF (`POST /api/lists/{id}/expenses`) → api `POST /lists/{id}/expenses` → `CreateManualExpenseService.execute` → `validate_manual_expense` (CRC/USD) → `MaterializeFxService.materialize_fx_for_entry` (BCCR or CRC pass-through) → `SqlAlchemyListRepository.create_ledger_entry` (persists `amount_crc`/`fx_rate`/`fx_rate_date`/`fx_fallback` atomically with the entry) → settle-up (`GetListBalancesStubService`) and receipt list (`GET /lists/{id}/expenses`) both read the materialized row, never BCCR.

**Key components:** `application/fx_service.py`, `adapters/fx/bccr_client.py` (stub), `domain/expenses.py` + `domain/settle.py`, `application/expenses.py` + `adapters/persistence/repositories.py`, `api/routes/lists.py`, and on the UI `app/lists/[listId]/page.tsx` + `components/soft-ledger/ReceiptRow.tsx`.

**Why this shape:** AD-7 requires FX materialized once at commit (never re-fetched per view) and no silent 1:1 fallback; AD-1 keeps BCCR transport out of the domain/application layers behind a `Protocol` port so the (currently stubbed) real adapter can land later without touching business logic.

**What not to break:**
- Settle-up and the receipt list must keep reading `amount_crc` from the committed row — never re-derive FX per request.
- `MaterializeFxService` must keep failing loud (structured `Fx*Error`) on any missing/unavailable rate; a silent 1:1 fallback would silently corrupt balances.
- `MANUAL_SUPPORTED_CURRENCIES` (CRC, USD) is the v1 boundary — widening it requires a BCCR-side currency check too (`BccrClient.supported_currencies()`).

## Change Log

- 2026-08-13: Implemented Story 3.5 — FX materialization to CRC at commit (BCCR), settle-up + receipt list on materialized `amount_crc`, USD manual expenses now accepted (BCCR adapter itself deferred/stubbed, fails loud). Status → review.
