---
baseline_commit: 3a7066026faec831380b9d8101e5533c558cd91b
---

# Story 4.9: BAC credit real-statement compatibility fix

Status: review

> **Renumbered 2026-08-20: was Story 4.11.** Epic 4 was reordered so numeric order matches build
> order (Sprint Change Proposal 2026-08-20). This story's work shipped under the old number, so its
> branches and PRs still carry `4-11` in their names — that is expected, not a stale reference:
>
> - PR [#61](https://github.com/snsm-uptime/finance-dashboard/pull/61) — `fix/4/4-11-bac-credit-real-statement-compatibility-fix` (merged)
> - PR [#62](https://github.com/snsm-uptime/finance-dashboard/pull/62) — `fix/4/4-11-ignore-empty-fg-sections` (merged)
> - PR [#63](https://github.com/snsm-uptime/finance-dashboard/pull/63) — `fix/4/4-11-ignore-empty-fg-sections` (merged)
>
> Note the status above still reads `review` while all three PRs are merged — worth reconciling.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer maintaining the BAC credit adapter,
I want `BacCreditAdapter` to recognize real BAC statement sections and data rows instead of the synthetic-fixture-only pipe format,
so that real BAC credit uploads parse successfully instead of silently yielding zero rows.

## Acceptance Criteria

1. **Given** `BacCreditAdapter`'s declared `_SECTIONS`, **when** compared against a real BAC credit statement's printed section titles, **then** the title strings match real lettered headers (e.g. "A) Detalle de pago del periodo", "B) Detalle de compras del periodo") rather than invented text — `SectionCursor`'s mechanism is unchanged (AD-25).
2. **Given** a shared `domain/statement_row_extraction.py` module, **when** a statement line contains a date-shaped token and at least one amount-shaped token, **then** it is classified as a data row without requiring a delimiter — promoted from `statement_recon.py`'s proven `_has_date_token`/`_amount_tokens` logic (AD-28).
3. **Given** `BacCreditAdapter`'s colones/dólares dual-amount columns, **when** `AmountColumnRole` is declared for this product, **then** it declares `CURRENCY_VARIANT` and behavior is unchanged from today's `normalize_dual_column_amount` (FR-33, AD-28).
4. **Given** the updated adapter, **when** a real (non-fixture) BAC credit statement's text shape is parsed, **then** must-parse sections yield `CanonicalLine` rows instead of `candidate_row_count == 0`, and unmapped/malformed rows still fail loudly rather than silently dropping (FR-14, NFR-8).
5. **Given** CI's synthetic fixture gate, **when** the BAC credit fixture is regenerated, **then** it uses real section titles and real (non-pipe) row text shape — matching real `pdfplumber` extraction — with goldens updated and zero manual edits required for must-parse lines (FR-35, AD-11).
6. **Given** this story's scope, **when** a future bank/product needs `SIGN_VARIANT` (e.g. a BAC debit adapter), **then** that remains out of scope — this story implements only the `CURRENCY_VARIANT` path (see `ARCHITECTURE-SPINE.md` Deferred table).

## Tasks / Subtasks

- [x] **Task 1: Build `api/domain/statement_row_extraction.py`** (AC: #2, #3)
  - [x] Write domain tests first (red → green, mirrors `test_statement_layout_domain.py`'s style — plain string/primitive inputs, no PDF fixture)
  - [x] `is_data_row(line, *, requires_date=True)` — promote the date-token + amount-token regex classifier from `api/scripts/statement_recon.py`'s `_has_date_token`/`_amount_tokens`. Add the `requires_date` parameter (new this story, not in `statement_recon.py`): when `False`, an amount-shaped token alone is sufficient — needed because BAC credit's real "C) Detalle de intereses" section prints rows with **no date token at all** (description + two amounts only), discovered by inspecting real extracted text this session (2026-08-19; not previously known — the earlier `mapping.yaml` recon output only samples header lines and row counts, not full row shape). See Dev Notes.
  - [x] Extend the amount-token regex to accept an optional **trailing** minus (`"3,706.90-"`, not `"-3,706.90"`) — the real notation this same interest section uses for negative amounts. Confirm the corresponding fix in `parse_amount_field` (`api/adapters/bank/_shared.py:16-19`) below.
  - [x] Row-token extraction: given a recognized data-row line, return the date substring (or `None` when `requires_date=False`), the amount-shaped substring(s) found (1 or 2), and the remaining text as description — regex-only, no word x-position needed (this story stays entirely in AD-28's `CURRENCY_VARIANT` path; x-position resolution is `SIGN_VARIANT`-only and out of scope per AC #6).
  - [x] Declare `AmountColumnRole` (`CURRENCY_VARIANT` / `SIGN_VARIANT`) per AD-28's shared contract shape. This story only exercises `CURRENCY_VARIANT`; `SIGN_VARIANT` stays declared but unused — no adapter needs it yet.
  - [x] Pure domain module: no `pdfplumber` import (AD-1). All inputs are plain strings/primitives the adapter already extracted.

- [x] **Task 2: Fix `parse_amount_field`'s trailing-minus gap** (AC: #2)
  - [x] `api/adapters/bank/_shared.py:17-21` — `Decimal(value.replace(",", ""))` raises `InvalidOperation` on `"3,706.90-"` today (fails loud, not silently wrong — but still a gap this story must close, not just note). Strip a trailing `"-"` and negate, matching the interest section's real notation.

- [x] **Task 3: Correct `BacCreditAdapter._SECTIONS`** (AC: #1)
  - [x] Real titles confirmed against real extracted text this session (2026-08-19, structural facts only — no PII, never committed):
    - `"A) Detalle de pago del periodo"` → `LINE_TYPE_PAYMENT`, `SECTION_POLICY_MUST_PARSE` (replaces `"Detalle de pago"`)
    - `"B) Detalle de compras del periodo"` → `LINE_TYPE_PURCHASE`, `SECTION_POLICY_MUST_PARSE` (replaces `"Detalle de compras"`)
    - `"C) Detalle de intereses"` → `LINE_TYPE_INTEREST`, `SECTION_POLICY_MUST_PARSE`, **no date column** — its rows use `requires_date=False` from Task 1 (replaces `"Detalle de intereses"`, same text minus the letter prefix, but now also needs the no-date row-shape flag)
    - `"D) Detalle de otros cargos"` → `LINE_TYPE_FEE`, `SECTION_POLICY_MUST_PARSE` (replaces `"Otros cargos"`)
    - `"E) Detalle de productos y servicios de elección voluntaria"` → `LINE_TYPE_VOLUNTARY_SERVICE`, `SECTION_POLICY_BEST_EFFORT` (current title is `"Productos y servicios de elección voluntaria"` — this adds both the letter prefix **and** the missing `"Detalle de "`, not just the prefix)
  - [x] **Open item, not blocking:** `"Saldo Anterior"` (`SECTION_POLICY_IGNORE`) and `"Otras líneas de financiamiento"` (`LINE_TYPE_INSTALLMENT_SCHEDULE`, `SECTION_POLICY_MUST_PARSE`) were **not** confirmed against real text this session — only the pages containing sections A–G were inspected, not the statement's opening balance-summary page. If a real statement is available locally (operator's gitignored `bank_data/`), verify these two titles the same way before assuming they're correct; if not available, leave them as currently declared and flag as unverified — a wrong title on a `MUST_PARSE`/`IGNORE` section fails loud (`unmapped`, raises) rather than silently dropping data, so this is a safe, non-blocking gap (NFR-8), not a defect to invent a fix for without evidence.
  - [x] **Explicitly out of scope, do not implement:** the real statement also shows `"F) Cargos por gestión evidenciable de cobro"` and `"G) Otras notas de crédito"` sections, not declared in `_SECTIONS` at all today. Both showed zero transactions in the one real statement checked this session, so there's no evidence yet of their real row shape or correct `line_type`/policy. Leaving them undeclared is safe — a future month with real data there fails loud rather than silently dropping (NFR-8) — a future story should add them once real evidence exists, per this project's Rule-of-Three convention for extending adapters (see `docs/bank-statement-parsing-playbook.md`).

- [x] **Task 4: Wire `BacCreditAdapter.parse()` onto the new row classifier** (AC: #2, #3, #4)
  - [x] Replace the `"|" not in line` check (`adapter.py:154`) with `domain.statement_row_extraction.is_data_row(...)`, passing `requires_date=False` only for the interest section's rows (Task 1/3).
  - [x] For a no-date interest row, assign `posted_date` directly from the statement's own reference date — **build this now, it does not exist yet.** Grep confirms zero call sites anywhere in `api/` pass `reference_date` to `parse_statement_date` today; no adapter reads a PDF's `/CreationDate`. Extract it via `pdfplumber`'s `doc.metadata["CreationDate"]` (raw PDF date string, `"D:YYYYMMDD..."` — parse that format directly), then set `posted_date = reference_date.isoformat()` for interest rows **directly** — do **not** route these through `parse_statement_date`: that function requires both a `%d` and `%b` token to be present (statement_dates.py:66-67, raises otherwise) and its `reference_date` parameter only fills in a missing *year* on an otherwise-present date, which is a different operation from "no date printed at all." **This is this story's resolution, confirmed by the user 2026-08-19** — not a general AD-28 change; scoped to this adapter's interest section only.
  - [x] Real purchase/payment/fee rows print a literal currency-code token directly before the amount (e.g. `"CRC 12,850.00"`) — use this as the direct `(currency, amount)` signal where present. The interest section's rows instead print two blank-separated amounts with no currency tag (e.g. `"3,577.10 0.00"`) — for those, fall back to the existing `normalize_dual_column_amount` prefer-nonzero/prefer-CRC rule, unchanged (FR-33). Both shapes are the `CURRENCY_VARIANT` case per AD-28 — this is adapter-level extraction detail, not a new architecture concept.
  - [x] Declare `AmountColumnRole.CURRENCY_VARIANT` for `BacCreditAdapter`/`bac_credit`.
  - [x] Preserve existing fail-loud behavior: a data row under an unmapped section must still raise `InvalidCanonicalLineError`, exactly as today.

- [x] **Task 5: Regenerate synthetic fixture + goldens** (AC: #5)
  - [x] Update `api/scripts/generate_bac_fixture.py` to emit real (non-pipe) row shapes per section — reference/date/description/place/currency/amount for purchase-like sections; description + two blank-separated amounts (no date) for the interest section — and the corrected real titles from Task 3.
  - [x] Regenerate `api/tests/fixtures/pdf/bac_credit_synthetic.pdf`; update `bac_credit_synthetic_goldens.py` to match.
  - [x] Run `test_bac_credit_fixture_acceptance.py` and `test_bac_adapter.py` against the new fixture — zero manual edits required on must-parse lines (FR-35).

- [x] **Task 6: Full regression pass** (AC: all)
  - [x] Run the full `api` pytest suite (existing BAC/statement-layout tests + new `statement_row_extraction` tests). Confirm no change to commit/dedup/list logic — this story stays inside `adapters/bank/bac_credit/` and the one new `domain/` module (AD-1 boundary untouched).
  - [x] If the operator has a real BAC credit PDF locally (`bank_data/`, gitignored, never committed), a manual smoke-test upload is encouraged but is **not** a merge gate — CI only gates on the synthetic fixture (project-context.md: "operator real PDFs never in repo/CI, never block merge").

## Dev Notes

- **Root cause this story fixes:** `BacCreditAdapter.parse()` (`api/adapters/bank/bac_credit/adapter.py:154`) currently gates on `"|" not in line` — an artifact of `generate_bac_fixture.py`'s pipe-delimited synthetic format. Real `pdfplumber`-extracted text never contains a literal `"|"`, so every real line falls through to header handling and no row is ever classified as data — a real upload silently reaches `STATEMENT_STATUS_STAGED` with `candidate_row_count == 0` instead of raising. `_SECTIONS` (`adapter.py:57-72`) also declares invented title strings that don't exact-match real lettered headers, which `SectionCursor.see_header_line()` (`api/domain/statement_layout.py:52-73`) requires (exact string lookup, no prefix tolerance).
- **Architecture contract this story implements against:** AD-25 (Section header contract) and AD-28 (Real-text row recognition + amount-column role), both in `ARCHITECTURE-SPINE.md` (`_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`). AD-28 is brand new this session (2026-08-19) — read it in full; it specifies the shared row classifier, the `AmountColumnRole` enum, and the fail-loud validation rule this story's Task 1 implements.
- **Playbook:** `docs/bank-statement-parsing-playbook.md`'s "Known gap" section describes exactly this story's scope (it was written anticipating this fix, before this story existed). It is also now auto-loaded as a persistent fact on the Winston/architect persona (`_bmad/custom/bmad-agent-architect.toml`) for future reference.
- **New findings this story session that aren't yet in the spine or playbook** (both resolved with the user 2026-08-19, scoped to this adapter, not a spine change):
  1. AD-28's row-recognition rule ("date-shaped token AND amount-shaped token") does not hold for BAC credit's real interest section — those rows have no date token at all. Resolution: a per-section `requires_date` flag (Task 1), and no-date rows get `posted_date` assigned directly from the statement's PDF `/CreationDate` (Task 4) — this is new plumbing this story builds, not a reuse of an existing mechanism (no adapter reads PDF metadata today), and it bypasses `parse_statement_date` entirely rather than going through AD-26's `%y`-fallback path, which only handles a missing year on an otherwise-present date.
  2. Real interest-section amounts use trailing-minus negative notation (`"3,706.90-"`) — `parse_amount_field` doesn't handle this today (Task 2).
- **Existing code to read completely before touching (per this project's own story-authoring standard):**
  - `api/adapters/bank/bac_credit/adapter.py` — the adapter being fixed, all of it (`_SECTIONS`, `detect()`, `split()`, `parse()`, `_signed_amount`).
  - `api/domain/statement_layout.py` — `SectionSpec`, `SectionCursor`, `detect_statement_boundaries` (AD-25/27, unchanged by this story — do not modify).
  - `api/domain/statement_dates.py` — `parse_statement_date`, the existing `reference_date` fallback mechanism Task 4 reuses.
  - `api/domain/canonical_line.py` — `CanonicalLine`, `normalize_dual_column_amount` (FR-33, unchanged — reused, not modified), `validate_canonical_line`.
  - `api/adapters/bank/_shared.py` — `parse_amount_field` (Task 2's target), `sniff_content_marker`.
  - `api/scripts/statement_recon.py` — `_has_date_token`, `_amount_tokens`, `_word_x_range` (the source logic Task 1 promotes; `_word_x_range` is **not** needed by this story — that's the `SIGN_VARIANT`/geometry path, out of scope per AC #6).
  - `api/scripts/generate_bac_fixture.py` and `api/tests/fixtures/pdf/bac_credit_synthetic_goldens.py` — both currently model the old invented-title, pipe-delimited format; Task 5 retires that shape.
- **Testing standard (project-context.md, non-negotiable):** parsers/domain get red → green TDD. `domain/statement_row_extraction.py`'s tests should mirror `test_statement_layout_domain.py`'s style — plain string inputs, no PDF, no `pdfplumber`. Money assertions use `Decimal`, never `float`. CI gates only on the synthetic fixture + goldens; real PDFs never enter the repo or CI and never block merge.
- **No previous story file exists for this epic** (`4-1` through `4-10` were implemented directly from `epics.md`, never materialized as individual `create-story` context files) — there is no prior-story intelligence section to draw on. Recent relevant commits: `1e7c0e3` (Story 4.7 bulk review) and `94d852b` (Story 4.7 code-review fixes) show this project's established pattern for addressing code-review findings as a follow-up commit rather than amending — follow the same convention if review findings come back on this story.

### Project Structure Notes

- All changes stay inside `api/adapters/bank/bac_credit/`, `api/adapters/bank/_shared.py`, one new file `api/domain/statement_row_extraction.py`, `api/scripts/generate_bac_fixture.py`, and `api/tests/fixtures/pdf/`. No `ui/`, no persistence, no API route changes — matches AD-1's adapter boundary (bank adapters emit `CanonicalLine` only).
- No new external dependency — reuses `pdfplumber` (already pinned) and Python's `re`/`decimal` stdlib, same as `statement_recon.py`.

### References

- [Source: ARCHITECTURE-SPINE.md#AD-25 — Section header contract]
- [Source: ARCHITECTURE-SPINE.md#AD-28 — Real-text row recognition + amount-column role]
- [Source: docs/bank-statement-parsing-playbook.md#Known gap: the first real application of AD-28]
- [Source: prd.md#FR-14, #FR-31, #FR-32, #FR-33, #FR-35, #NFR-8]
- [Source: api/adapters/bank/bac_credit/adapter.py:57-72, :154]
- [Source: api/adapters/bank/_shared.py:17-21]
- [Source: api/scripts/statement_recon.py — `_has_date_token`, `_amount_tokens`]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-19.md — this story's trigger/impact analysis]

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.6

### Debug Log References

- Real BAC credit PDFs in gitignored `bank_data/` have empty pdfplumber metadata (no `/CreationDate`). `split()` via pypdfium2 also writes a fresh CreationDate onto each chunk. Interest `posted_date` therefore prefers the printed `Fecha de emisión:` line, then falls back to `/CreationDate`.
- Local smoke (counts only, not a merge gate): one January statement parsed 56 rows (payment/purchase/interest/voluntary_service). Other months fail loud on undeclared `G) Otras notas de crédito` once a date+amount-shaped line appears after that header — matching this story's explicit F/G out-of-scope / NFR-8 choice, not a silent zero-row regression.

### Completion Notes List

- Task 1: Added `api/domain/statement_row_extraction.py` (`is_data_row`, `extract_row_tokens`, `AmountColumnRole`) with red→green domain tests. Amount regex accepts trailing minus; `requires_date=False` covers interest rows; amount pattern is overridable (AD-28).
- Task 2: `parse_amount_field` strips a trailing `-` and negates (`"3,706.90-"` → `Decimal("-3706.90")`).
- Task 3: `_SECTIONS` now uses real lettered titles A–E. `"Saldo Anterior"` and `"Otras líneas de financiamiento"` left as declared and still unverified (not present on the inspected January statement). F/G not declared.
- Task 4: `parse()` uses `is_data_row` instead of `"|"`. Currency-tag `(CRC|USD)` when present; otherwise `normalize_dual_column_amount`. Interest rows take `posted_date` from statement reference date (printed issuance, else CreationDate) without calling `parse_statement_date`. Column-header / preamble lines are skipped so they do not unmap A–E. Lettered unknown sections still raise. `amount_column_role = CURRENCY_VARIANT`.
- Task 5: Synthetic + acceptance-bar fixtures/goldens regenerated to lettered titles and non-pipe row shapes, including `Fecha de emisión:31-ENE-26` so interest dates stay stable after `split()`.
- Task 6: Full api suite `441 passed, 155 skipped`. Ruff check/format clean. No persistence/UI/commit-path changes.

### File List

- api/domain/statement_row_extraction.py
- api/tests/test_statement_row_extraction_domain.py
- api/adapters/bank/_shared.py
- api/tests/test_bank_shared.py
- api/adapters/bank/bac_credit/adapter.py
- api/tests/test_bac_adapter.py
- api/scripts/generate_bac_fixture.py
- api/tests/fixtures/pdf/bac_credit_synthetic.pdf
- api/tests/fixtures/pdf/bac_credit_synthetic_goldens.py
- api/tests/fixtures/pdf/bac_credit_acceptance_bar.pdf
- api/tests/fixtures/pdf/bac_credit_acceptance_bar_goldens.py
- _bmad-output/implementation-artifacts/4-9-bac-credit-real-statement-compatibility-fix.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-08-20: BAC credit adapter parses real (non-pipe) statement text via shared AD-28 row classifier; lettered section titles; trailing-minus amounts; fixture/goldens regenerated.
