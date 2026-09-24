---
title: 'Real BCCR FX client (replace UnavailableBccrClient stub)'
type: 'feature'
created: '2026-09-24'
status: 'done'
review_loop_iteration: 1
context: []
baseline_commit: '2d72c0c1cbe63045834237eac381b43e607ebe49'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `UnavailableBccrClient` (`api/adapters/fx/bccr_client.py`) always raises `FxServiceUnavailableError`, so any non-CRC (USD) ledger line — manual entry or import commit — fails FX materialization with a 503 instead of converting to CRC.

**Approach:** Implement a real `BccrClient` using the `bccr` PyPI package's `SW.descargar_indicador(318, ...)` (USD venta/sell reference rate) for live lookups, wrapped by a small Postgres-backed cache adapter (per `(rate_date, currency)`) so repeat commits on the same date don't re-hit BCCR. Wire it into `deps.py` in place of `UnavailableBccrClient`.

## Boundaries & Constraints

**Always:**
- Implement exactly the `BccrClient` Protocol (`api/application/ports.py:144-160`): `get_rate`, `get_nearest_prior_rate`, `supported_currencies` — no extra methods relied on by callers.
- USD indicator code is **318** (venta/sell), CRC pass-through unchanged (`MaterializeFxService` already skips BCCR for CRC/zero amounts).
- Cache hit (exact `rate_date`) short-circuits without calling `bccr`. Cache miss calls `bccr`, persists the result, then returns it.
- `get_nearest_prior_rate` also uses the cache first; on miss, query `bccr` for a bounded lookback window (30 days) walking backward from `rate_date`, persist whatever is found, return `(rate, actual_date)`. No result within the window → `None` (service layer turns this into `FxRateNotAvailableError`).
- Any `bccr`/network failure (exception, non-200, `None` return) → adapter raises `FxServiceUnavailableError` with a clear message — never returns a fabricated/1:1 rate.
- New Alembic migration `0042_*` for the cache table (`fx_rate_cache`: `rate_date DATE`, `currency VARCHAR(3)`, `rate NUMERIC`, unique on `(rate_date, currency)`) — SQLAlchemy model in `adapters/persistence/models.py`, alongside existing conventions (see `DescriptionAliasModel`).
- Add `bccr` to `api/pyproject.toml` via `uv add bccr` (pulls in pandas/numpy — accepted tradeoff per user decision).
- Real BCCR calls are never exercised in CI/tests — cache + client are unit-tested against a fake/stubbed `bccr.SW`, per `project-context.md` ("never live BCCR in CI").

**Ask First:**
- If the `bccr` package's `descargar_indicador` return shape (pandas Series) doesn't map cleanly to a single `Decimal` for a given date (e.g. multiple rows, unexpected NaNs) — halt and confirm handling instead of guessing.

**Never:**
- No DB session in the raw BCCR-transport class — only the caching wrapper touches Postgres, matching the adapters/persistence split (transport in `adapters/fx`, persistence via `adapters/persistence/models.py`).
- No new env vars / secrets (bundled public token per user decision) — do not add BCCR credentials config.
- Do not change `MaterializeFxService` or the `BccrClient` Protocol — this story only supplies a real implementation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Exact-date cache hit | `fx_rate_cache` has a row for (2026-01-06, USD) | `get_rate` returns cached `Decimal`, no `bccr` call | N/A |
| Exact-date cache miss, BCCR has it | No cache row; `bccr` returns a value for that date | `get_rate` persists + returns the `Decimal` | N/A |
| Exact-date miss, no BCCR data (weekend) | `bccr` returns empty/None for that date | `get_rate` returns `None` (no cache write) | Caller falls back to `get_nearest_prior_rate` |
| Nearest-prior within window | No exact rate; a rate exists 2 days earlier | Returns `(rate, that_date)`, persists it under the *actual* found date | N/A |
| Nearest-prior exceeds 30-day window | No rate in the whole window | Returns `None` | `MaterializeFxService` raises `FxRateNotAvailableError` |
| BCCR/network failure | `bccr` call raises or errors | `FxServiceUnavailableError` raised, nothing cached | Propagates as HTTP 503 (existing route mapping) |

</frozen-after-approval>

## Code Map

- `api/adapters/fx/bccr_client.py` — replace stub body; add `BccrSwClient` (raw transport via `bccr` package) and `CachedBccrClient` (wraps it + Postgres cache)
- `api/application/ports.py:144-160` — `BccrClient` Protocol (reference only, unchanged)
- `api/application/fx_service.py` — `MaterializeFxService` (reference only, unchanged; confirms error/fallback contract)
- `api/adapters/persistence/models.py` — add `FxRateCacheModel` (pattern: `DescriptionAliasModel`)
- `api/adapters/persistence/migrations/versions/0042_fx_rate_cache.py` — new migration
- `api/api/deps.py:58-64` — `get_bccr_client` now builds `CachedBccrClient(BccrSwClient(), db)`; needs a `Session` dependency like `get_session_store`
- `api/pyproject.toml` — add `bccr` dependency
- `api/tests/test_fx_service.py` — reference for existing `FakeBccrClient` contract shape (unchanged)
- `api/tests/test_bccr_client.py` — new test file for the real adapter (stub `bccr.SW`, use a real/test Postgres session per project convention)

## Tasks & Acceptance

**Execution:**
- [x] `api/pyproject.toml` -- `uv add bccr` -- pulls in the chosen BCCR transport package
- [x] `api/adapters/persistence/models.py` -- add `FxRateCacheModel` (`fx_rate_cache`, unique `(rate_date, currency)`) -- persisted cache backing store
- [x] `api/adapters/persistence/migrations/versions/0042_fx_rate_cache.py` -- create `fx_rate_cache` table -- Alembic-only schema change per project-context.md
- [x] `api/adapters/fx/bccr_client.py` -- add `BccrSwClient` (calls `bccr.SW.descargar_indicador(318, ...)`, converts to `Decimal`, raises `FxServiceUnavailableError` on failure) and `CachedBccrClient` (Session-backed cache wrapper implementing the full `BccrClient` protocol, delegating to `BccrSwClient` on miss) -- real FX source + AC #6 caching
- [x] `api/api/deps.py` -- update `get_bccr_client` to take `db: Session = Depends(get_db)` and return `CachedBccrClient(BccrSwClient(), db)` -- wires the real client into production
- [x] `api/tests/test_bccr_client.py` -- unit tests for `BccrSwClient` (stub `bccr.SW`) and `CachedBccrClient` (fake delegate + real test-DB session) covering the I/O matrix -- red→green per Testing Rules
- [x] `api/tests/test_manual_expense_api.py`, `api/tests/test_import_sessions_integration.py` -- add `client_without_bccr` fixture (explicit `UnavailableBccrClient` override) and repoint the two "BCCR unwired" 503 tests to it, since the app default is no longer the stub

**Acceptance Criteria:**
- Given a USD ledger line dated today with no cached rate, when `MaterializeFxService.materialize_fx_for_entry` runs, then it calls BCCR once, persists the rate, and returns a materialized `amount_crc`.
- Given two USD lines on the same date committed in separate requests, when both are materialized, then only one BCCR network call occurs total (second reads the cache row written by the first).
- Given BCCR is unreachable, when a USD line is materialized, then the request fails with `FxServiceUnavailableError` (→ HTTP 503) and no partial/incorrect cache row is written.

## Design Notes

`CachedBccrClient` composition (not inheritance) keeps `BccrSwClient` DB-free and independently testable:

```python
class CachedBccrClient:
    def __init__(self, delegate: BccrClient, db: Session): ...
    def get_rate(self, rate_date, currency):
        if cached := self._lookup(rate_date, currency):
            return cached
        rate = self._delegate.get_rate(rate_date, currency)
        if rate is not None:
            self._store(rate_date, currency, rate)
        return rate
```

`get_nearest_prior_rate`'s 30-day window walks backward day-by-day against the **cache only** (cheap DB reads, no network), stopping at first hit. A full cache miss across the whole window falls back to **one** batched call to `delegate.get_nearest_prior_rate` (not 30 individual `get_rate` calls) — avoids hammering BCCR with sequential per-day requests on a cold cache (e.g. materializing on the Monday after a holiday weekend).

## Spec Change Log

- **Finding (review, patch):** the first implementation had `CachedBccrClient.get_nearest_prior_rate` call `self.get_rate()` per day in the window, making up to 31 sequential BCCR network calls on a cold cache and leaving `BccrSwClient.get_nearest_prior_rate`'s batched path dead/unreachable code.
- **Amendment:** walk the **cache** day-by-day first; only call the delegate's batched `get_nearest_prior_rate` once, on a full cache miss.
- **Avoids:** N sequential network round-trips per materialization when the cache is cold across the lookback window.
- **KEEP:** the cache-hit short-circuit in `get_rate` and the `_store`-under-actual-found-date behavior are unchanged and correct — preserve as-is.

## Verification

**Commands:**
- `cd api && uv run pytest tests/test_bccr_client.py tests/test_fx_service.py -q` -- expected: all pass, no real network calls made
- `cd api && uv run alembic upgrade head` (against worktree Postgres) -- expected: `fx_rate_cache` table created cleanly
- `cd api && uv run ruff check .` -- expected: clean

## Suggested Review Order

**Real BCCR transport**

- Entry point — raw HTTP-via-package transport; indicator 318 verified live against BCCR (317 is actually "compra", not venta).
  [`bccr_client.py:56`](../../api/adapters/fx/bccr_client.py#L56)

- `IndexError` from the third-party package is the verified signal for "no data in range" (confirmed against the live API), not a transport failure.
  [`bccr_client.py:87`](../../api/adapters/fx/bccr_client.py#L87)

- Rejects NaN and duplicate-date rows explicitly instead of letting them silently become a fabricated `Decimal` (review finding, patched).
  [`bccr_client.py:102`](../../api/adapters/fx/bccr_client.py#L102)

**Postgres-backed cache**

- Cache-hit short-circuit avoids re-hitting BCCR for a date already materialized once.
  [`bccr_client.py:128`](../../api/adapters/fx/bccr_client.py#L128)

- Nearest-prior walks the cache only, then makes exactly one batched delegate call on a full miss — not one BCCR call per day (review finding, patched; see Spec Change Log).
  [`bccr_client.py:138`](../../api/adapters/fx/bccr_client.py#L138)

- Concurrent-write race is a no-op via the unique constraint, matching the existing `DescriptionAliasModel` repository pattern.
  [`bccr_client.py:159`](../../api/adapters/fx/bccr_client.py#L159)

**Schema & wiring**

- New cache table; precision matches the existing `fx_rate` convention (`Numeric(10, 4)`) after review.
  [`models.py:449`](../../api/adapters/persistence/models.py#L449)

- `deps.py` now injects a DB session and swaps in the real client — this is the only production behavior change outside `adapters/fx`.
  [`deps.py:58`](../../api/api/deps.py#L58)

**Tests**

- Unit coverage for the transport (stubbed `bccr.SW`) and cache (real Postgres via `db_session`), including the review-driven NaN/duplicate/import-failure cases.
  [`test_bccr_client.py:1`](../../api/tests/test_bccr_client.py#L1)

- Two pre-existing "BCCR unwired" 503 tests now use an explicit `client_without_bccr` fixture, since the app default is no longer the stub.
  [`test_manual_expense_api.py:44`](../../api/tests/test_manual_expense_api.py#L44)
