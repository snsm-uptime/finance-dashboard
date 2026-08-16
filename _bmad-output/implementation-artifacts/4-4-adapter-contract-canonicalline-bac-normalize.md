# Story 4.4: Adapter contract + CanonicalLine + BAC normalize

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer extending bank support,
I want a pluggable detect → split → parse → normalize contract emitting CanonicalLine,
so that new banks don't rewrite core import, dedup, or list logic.

## Acceptance Criteria

1. **Given** an adapter package, **when** it is registered, **then** it declares `{bank, product_id, account_kind}` and plugs into detect → split → parse → normalize without modifying core import/dedup/list logic. (FR-31)
2. **Given** detection, **when** override → filename → content strategies run, **then** the first confident match wins; unknown or ambiguous detection fails loudly with a clear error — no silent mis-association. (FR-14, NFR-8)
3. **Given** must-parse ledger lines, **when** an adapter emits rows, **then** each row is a `CanonicalLine`: `posted_date` (ISO-8601), signed `amount`, ISO 4217 `currency`, `product_id`, `line_type`, `external_ref` when provided, `normalized_description`, `provenance`. Line-type taxonomy includes at least the PRD set (purchase, payment, interest, fee, voluntary_service, credit_note, installment_schedule, balance_forward, other); section policies are `must_parse` / `best_effort` / `ignore`; unmapped sections quarantine (collected, not silently dropped). (FR-32, AD-16)
4. **Given** dual CRC/USD columns, **when** amounts are normalized, **then** a single `(currency, amount)` results — prefer nonzero; if both nonzero, prefer CRC. (FR-33)
5. **Given** commit time, **when** identity is computed, **then** domain alone computes canonical identity (primary: stable `external_ref`; fallback: `(product_id, posted_date, currency, amount, normalized_description, line_type, statement_period_id)`) — adapters do not emit authoritative dedup keys, only an optional `ref_quality` hint (`stable` / `derived` / `absent`). (FR-34, AD-18)
6. **Given** the BAC credit-card product, **when** a synthetic BAC statement fixture is parsed through the full detect → split → parse → normalize path, **then** it proves the contract end-to-end (dual-column normalize, line-type mapping, section policy, multi-statement split) against real adapter code — not just types. This is a proving fixture only; the official CI acceptance-bar / golden-row exit gate (zero manual edits, FR-35) is Story 4.5's job, not this story's. (Epic 4 summary: "BAC credit-card acceptance + Promerica stub"; NFR-11)

## Scope Note (read before starting)

This story builds the **adapter contract + one concrete adapter proving it** — not the import pipeline that will call it. No Import Session/Batch persistence, no upload endpoint, no review UI, no commit/dedup wiring exist yet (Stories 4.6–4.9). `compute_canonical_identity` (AC #5) is a pure domain function defined and unit-tested here; it is not wired into any commit path in this story — that wiring happens when Story 4.9 builds the actual commit. Do not build upload/review/commit code here.

The Promerica stub (FR-36) is explicitly **Story 4.5**, not this one — do not build it here. Likewise the official BAC "zero manual edits" CI acceptance-bar golden test (FR-35) is Story 4.5's job; this story's BAC fixture only needs to exercise the contract's moving parts (dual-column, line-type mapping, section policy, multi-statement split), not achieve full statement coverage.

No database migration is needed — this story adds no persisted tables/columns (CanonicalLine is an in-memory staging shape; persistence for it begins in Story 4.6).

**Dependency decision — raise before starting Task 5:** `pdfplumber==0.11.10` is an expected new dependency (pinned in `ARCHITECTURE-SPINE.md`'s Stack table and `stack-options.md` specifically for BAC adapters — add it to `api/pyproject.toml` `dependencies`, not `dev`). However, **no PDF-generation library is currently a project dependency**, and one is needed to author the synthetic BAC fixture (Task 5.4). Per this project's dev-story rule ("new dependencies require user approval"), **stop and ask the user** whether to add a PDF-generation library (e.g. `reportlab` or `fpdf2`, as a `dev` dependency) or to hand-author/commit a static PDF fixture without one — before proceeding with Task 5.4. Do not silently pick one.

## Tasks / Subtasks

- [ ] Task 1: Domain — line-type taxonomy consolidation + CanonicalLine + section policy (AC: #3)
  - [ ] 1.1 New `api/domain/line_types.py`: define `LINE_TYPE_PURCHASE = "purchase"`, `LINE_TYPE_PAYMENT = "payment"`, `LINE_TYPE_INTEREST = "interest"`, `LINE_TYPE_FEE = "fee"`, `LINE_TYPE_VOLUNTARY_SERVICE = "voluntary_service"`, `LINE_TYPE_CREDIT_NOTE = "credit_note"`, `LINE_TYPE_INSTALLMENT_SCHEDULE = "installment_schedule"`, `LINE_TYPE_BALANCE_FORWARD = "balance_forward"`, `LINE_TYPE_OTHER = "other"`, `LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL = "classified_purchase_reversal"` (this last one already exists as a bare string literal in `domain/settle.py`'s `INCLUDED_LINE_TYPES` — promote it to a named constant here, source of truth). `LINE_TYPES = frozenset({...all ten...})`.
  - [ ] 1.2 `api/domain/expenses.py`: replace the local `LINE_TYPE_PURCHASE = "purchase"` (line 15) with `from domain.line_types import LINE_TYPE_PURCHASE` — behavior-preserving, single source of truth. Do not touch anything else in this file.
  - [ ] 1.3 `api/domain/settle.py`: replace `INCLUDED_LINE_TYPES = frozenset({"purchase", "classified_purchase_reversal"})` (line 20) with `frozenset({LINE_TYPE_PURCHASE, LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL})` imported from `domain.line_types` — behavior-preserving. Run `api/tests/test_settle.py` after this change to confirm no regression (value is identical, just named).
  - [ ] 1.4 New `api/domain/canonical_line.py`: `SECTION_POLICY_MUST_PARSE = "must_parse"`, `SECTION_POLICY_BEST_EFFORT = "best_effort"`, `SECTION_POLICY_IGNORE = "ignore"`, `SECTION_POLICIES = frozenset({...})`. `REF_QUALITY_STABLE = "stable"`, `REF_QUALITY_DERIVED = "derived"`, `REF_QUALITY_ABSENT = "absent"`, `REF_QUALITIES = frozenset({...})`. `CanonicalLine` frozen/slots dataclass (mirror `ManualExpenseDraft`'s shape in `domain/expenses.py`): `posted_date: str`, `amount: Decimal`, `currency: str`, `product_id: str`, `line_type: str`, `normalized_description: str`, `provenance: str = PROVENANCE_PARSER` (import from `domain.expenses`, do not redefine), `external_ref: str | None = None`, `ref_quality: str | None = None`. Add a small `validate_canonical_line(line: CanonicalLine) -> None` (or a constructing function `build_canonical_line(...)`) that raises `InvalidCanonicalLineError` if `line_type not in LINE_TYPES`, `ref_quality is not None and ref_quality not in REF_QUALITIES`, or `currency` is not a 3-letter uppercase code — this is the guard that turns a malformed adapter row into a fail-loud error rather than a silent bad row (AC #3 "unmapped sections quarantine rather than silent drop" — this is the validation an adapter's `parse()` runs per-row before returning).
  - [ ] 1.5 `api/domain/errors.py`: add `InvalidCanonicalLineError(DomainError)` (`MESSAGE = "Statement row failed contract validation."`, `CODE = "invalid_canonical_line"`, same `__init__(self, detail=None)` shape as `InvalidCardRoutingModeError`).
  - [ ] 1.6 New `api/tests/test_canonical_line_domain.py`: construct valid `CanonicalLine` instances for a few `line_type`s; assert `validate_canonical_line` passes. Assert it raises `InvalidCanonicalLineError` for: unknown `line_type`, unknown `ref_quality`, malformed `currency` (e.g. `"crc"` lowercase or `"C"` too short). Assert `LINE_TYPES` contains all ten PRD-named types.
  - [ ] 1.7 Run `api/tests/test_settle.py` and `api/tests/test_manual_expense_domain.py` (existing suites touched by 1.2/1.3) to confirm zero regressions from the constant consolidation.

- [ ] Task 2: Domain — dual-column amount normalization (AC: #4)
  - [ ] 2.1 `api/domain/canonical_line.py`: add `normalize_dual_column_amount(crc_amount: Decimal, usd_amount: Decimal) -> tuple[str, Decimal]`. Rule (project-context.md "Must-cover edges" — verbatim): prefer nonzero column; if both nonzero, prefer CRC. Returns `("CRC", crc_amount)` when only CRC is nonzero or both are nonzero; `("USD", usd_amount)` when only USD is nonzero; when both are zero, return `("CRC", Decimal("0"))` (deterministic, documented — the caller's section-policy decides whether a zero-amount row is kept/ignored, this function only picks the currency).
  - [ ] 2.2 `api/tests/test_canonical_line_domain.py`: table-driven cases — CRC nonzero/USD zero → CRC; USD nonzero/CRC zero → USD; both nonzero → CRC (the must-cover edge); both zero → `("CRC", Decimal("0"))`. Assert all amounts stay `Decimal` (never `float`) per project-context.md AD-5.

- [ ] Task 3: Domain — canonical identity computation (AC: #5, AD-18)
  - [ ] 3.1 `api/domain/canonical_line.py`: add `compute_canonical_identity(line: CanonicalLine, *, statement_period_id: str) -> tuple`. If `line.ref_quality == REF_QUALITY_STABLE and line.external_ref`: return `("ref", line.external_ref)`. Else: return `("fallback", line.product_id, line.posted_date, line.currency, line.amount, line.normalized_description, line.line_type, statement_period_id)`. The leading `"ref"`/`"fallback"` discriminator prevents an `external_ref` string value from ever colliding with a fallback tuple's shape.
  - [ ] 3.2 `api/tests/test_canonical_line_domain.py`: `ref_quality="stable"` + `external_ref` set → identity is `("ref", <that ref>)`, independent of other fields. `ref_quality="derived"` or `"absent"` or `None`, or `external_ref=None` → identity is the fallback tuple. Two `CanonicalLine`s with identical fallback-relevant fields (same product/date/currency/amount/description/line_type) and the same `statement_period_id` → identical identity tuples (determinism — this is what makes FR-34 "re-import never duplicates" possible once Story 4.9 wires commit).

- [ ] Task 4: Application — `BankAdapter` protocol + detect registry (AC: #1, #2)
  - [ ] 4.1 New `api/application/bank_adapters.py`. `class BankAdapter(Protocol)`: properties `bank_id: str`, `product_id: str`, `account_kind: str`; methods `def detect(self, *, filename: str, content_sample: bytes) -> bool` (does this adapter recognize the file by filename pattern and/or a content sniff — implementation decides how, contract only asks for a yes/no); `def split(self, pdf_bytes: bytes) -> list[bytes]` (one element per statement found; single-statement input returns a 1-element list); `def parse(self, statement_bytes: bytes) -> list[CanonicalLine]` (raises `InvalidCanonicalLineError` — from Task 1.5 — on any row it cannot validate; must-parse sections that don't match anything the adapter recognizes must raise, not silently skip).
  - [ ] 4.2 `api/domain/errors.py`: add `UnknownBankAdapterError(DomainError)` (`MESSAGE = "Could not identify the bank or product for this file."`, `CODE = "unknown_bank_adapter"`, no-arg `__init__` like `CardNotFoundError`) and `AmbiguousBankAdapterError(DomainError)` (`MESSAGE = "Multiple banks matched this file — cannot detect automatically."`, `CODE = "ambiguous_bank_adapter"`, no-arg `__init__`).
  - [ ] 4.3 `api/application/bank_adapters.py`: `def detect_bank_adapter(adapters: list[BankAdapter], *, override: str | None, filename: str, content_sample: bytes) -> BankAdapter`. Priority order (AC #2, FR-14): (a) if `override` given, return the adapter whose `bank_id == override`; raise `UnknownBankAdapterError` if none matches (an explicit override that doesn't exist is still a clear failure, not a silent fallback to auto-detect); (b) else call `.detect(filename=filename, content_sample=b"")` on every adapter — if exactly one returns `True` by filename alone, return it; if more than one, raise `AmbiguousBankAdapterError`; if zero, fall through; (c) call `.detect(filename=filename, content_sample=content_sample)` on every adapter (content-inclusive) — exactly one `True` wins, zero raises `UnknownBankAdapterError`, more than one raises `AmbiguousBankAdapterError`. (Note: a single `detect()` method covers both filename-only and content-inclusive passes; the registry function calls it twice with different args rather than the adapter having two separate methods — keeps the adapter contract in Task 4.1 to three methods, not four.)
  - [ ] 4.4 New `api/tests/test_bank_adapters_application.py`: build 2–3 minimal fake `BankAdapter` implementations (plain classes, no pdfplumber) with different `detect()` behaviors. Cases: override matching a registered `bank_id` wins even when filename/content would pick a different adapter; override not matching any adapter → `UnknownBankAdapterError`; unambiguous filename match wins without needing content; two adapters both match filename → `AmbiguousBankAdapterError`; no filename match but exactly one matches content → that one wins; no match at any stage → `UnknownBankAdapterError`.

- [ ] Task 5: Adapter — BAC credit-card package proving the contract (AC: #1, #3, #4, #6)
  - [ ] 5.1 `api/pyproject.toml`: add `"pdfplumber==0.11.10"` to `[project].dependencies` (pinned version per `ARCHITECTURE-SPINE.md` Stack table / `stack-options.md`).
  - [ ] 5.2 New `api/adapters/bank/bac_credit/__init__.py` + `api/adapters/bank/bac_credit/adapter.py`: `class BacCreditAdapter` implementing the `BankAdapter` protocol from Task 4.1 — `bank_id = "bac"`, `product_id = "bac_credit"`, `account_kind = "credit"`. `detect()`: filename check (case-insensitive substring match, e.g. `"bac"` in the filename) when `content_sample` is empty; when `content_sample` is provided, additionally/instead sniff for a known BAC statement header string extracted via pdfplumber from the first page (exact marker string to be finalized once the fixture in 5.4 exists — document the chosen marker in a code comment).
  - [ ] 5.3 `BacCreditAdapter.split()`: locate statement boundaries via a repeating per-statement header/account marker (BAC multi-card PDFs bundle N per-card statements — NFR-12 references "a typical single multi-card BAC PDF"); return one PDF-byte-chunk per detected statement. A single-statement PDF returns a 1-element list — do not special-case single vs multi in the caller.
  - [ ] 5.4 **Before this subtask, resolve the dependency decision in the Scope Note above.** Author the synthetic fixture at `api/tests/fixtures/pdf/bac_credit_synthetic.pdf` (or a small multi-file set if that's easier to construct) with known geometry: at least two statements (proves `split()`), a transaction table with both a CRC and a USD column on at least one row (proves dual-column normalize), rows covering at least three distinct `line_type`s (e.g. purchase, payment, fee), and one row in a section the adapter does not recognize (proves the must_parse/best_effort/ignore section-policy path — AC #3's "unmapped sections quarantine rather than silent drop"). No real statement data, no PII (NFR-2) — every value invented.
  - [ ] 5.5 Hand-author expected output alongside the fixture (e.g. `api/tests/fixtures/pdf/bac_credit_synthetic.goldens.py` or `.json` — developer's call on format, follow whatever is easiest to assert against in pytest) listing the expected `CanonicalLine` rows per statement chunk. This becomes the seed Story 4.5 upgrades into the official CI acceptance-bar golden test — keep it minimal and correct, not exhaustive.
  - [ ] 5.6 `BacCreditAdapter.parse()`: extract the transaction table via pdfplumber, map each row to a `CanonicalLine` using `normalize_dual_column_amount` (Task 2.1) for the CRC/USD columns and a small local description/section keyword lookup to assign `line_type`; call `validate_canonical_line` (Task 1.4) on each row before returning; raise `InvalidCanonicalLineError` (or a more specific parse error if useful, subclassing it) rather than silently dropping a row from an unmapped section.
  - [ ] 5.7 New `api/tests/test_bac_adapter.py`: `detect()` returns `True` on a filename containing "bac", `False` otherwise; `detect()` with content sniffing recognizes the fixture's header when the filename is generic; `split()` on the fixture returns the expected number of statement chunks; `parse()` on each chunk matches the goldens file row-for-row (`Decimal` equality throughout — never compare via `float`); the deliberately-unmapped section in the fixture raises rather than silently vanishing; parsing the same fixture twice yields identical `CanonicalLine` sequences (determinism, sets up FR-34 idempotent re-import for Story 4.9).

- [ ] Task 6: Story-close overview (required before `done` — see Dev Notes)

## Dev Notes

### Why line-type constants get consolidated into `domain/line_types.py` (Task 1.1–1.3)

`domain/expenses.py` already defines `LINE_TYPE_PURCHASE = "purchase"`, and `domain/settle.py` already hardcodes `frozenset({"purchase", "classified_purchase_reversal"})` as bare string literals. This story needs the **full** FR-32 taxonomy (nine types plus the settle-side "classified_purchase_reversal"). Adding a third, adapter-side copy of `"purchase"` would create three sources of truth for the same string — exactly the kind of duplicate-functionality/reinvention this workflow exists to prevent. Tasks 1.1–1.3 hoist the constants to one module and repoint the two existing call sites at it; this is a small, behavior-preserving refactor, not a rewrite — do not touch unrelated code in `expenses.py`/`settle.py` beyond the two named lines.

### Hexagonal placement (AD-1)

- `domain/line_types.py`, `domain/canonical_line.py`: pure — no FastAPI/SQLAlchemy/pdfplumber imports. `CanonicalLine`'s `provenance` default reuses `PROVENANCE_PARSER` from `domain/expenses.py` (already defined there since Story 3.2/4.2) — import it, do not redefine.
- `application/bank_adapters.py`: the `BankAdapter` Protocol and `detect_bank_adapter()` registry function — this is a use-case (detect which adapter applies), not a bank-specific implementation. Depends on `domain.canonical_line.CanonicalLine` only.
- `adapters/bank/bac_credit/`: the first concrete adapter. Per AD-1/AD-16, it returns normalized `CanonicalLine` rows to the application layer and does nothing else — it MUST NOT commit, touch lists/membership, or call other adapters. It has zero knowledge of Import Session/Batch (those don't exist yet).
- No changes to `api/api/routes/*`, `api/adapters/persistence/*`, or `ui/` in this story — there is no HTTP surface or persisted state for any of this yet.

### Section policy & fail-loud (AC #2, #3; NFR-8)

`must_parse` rows that don't validate (Task 1.4's `validate_canonical_line`) must raise, not be dropped — that failure becomes visible parse failure/quarantine handling starting in Epic 5, but the *raise* itself is this story's job. `best_effort` and `ignore` policy handling (deciding which sections of a statement get which policy) lives inside each adapter's `parse()` — this story does not need a generic "section policy engine," just the three named policy constants (Task 1.4) and the BAC adapter's own internal application of them (Task 5.6).

### Files you will modify (read fully before editing)

- `api/domain/expenses.py` — one-line import swap only (Task 1.2). Do not touch `ManualExpenseDraft`, `validate_manual_expense`, or origin logic.
- `api/domain/settle.py` — one-line constant swap only (Task 1.3). Do not touch `compute_settle_balances` or any allocation math.
- `api/pyproject.toml` — add one dependency line (Task 5.1). Do not change existing pins.

### What NOT to build (explicit scope fences)

- No Import Session/Statement/Batch persistence, no Alembic migration, no API routes, no UI — those begin at Story 4.6.
- No Promerica stub (FR-36) — that's Story 4.5.
- No official CI acceptance-bar / golden-row exit test claiming "zero manual edits" (FR-35) — that's Story 4.5; this story's BAC fixture only needs to prove the contract's parts work, not full statement coverage.
- Do not wire `compute_canonical_identity` into any commit/dedup code path — no such path exists yet (Story 4.9). It's a pure, unit-tested function only in this story.

### Testing Requirements (project-context "Discipline" + "Layers" + "Must-cover edges")

- Domain: red → green TDD (parsers/domain rule, AD-15) — `test_canonical_line_domain.py` is new; `test_settle.py`/`test_manual_expense_domain.py` must show zero regressions after the Task 1.2/1.3 refactor.
- Contract layer: `test_bank_adapters_application.py` (fake adapters, no pdfplumber, no DB) covers the override → filename → content priority and both failure modes (unknown/ambiguous).
- Adapter layer: `test_bac_adapter.py` runs against the real synthetic fixture via pdfplumber — this is the "Contract: CanonicalLine + fail-loud detect" layer from project-context.md.
- Must-cover edges explicitly required by project-context.md and reflected in the tasks above: dual-column prefer-nonzero / both-nonzero→CRC (Task 2.2); multi-statement split where the contract must support N>1 (Task 5.7); money assertions use `Decimal`, never `float`, throughout.
- No Postgres/integration-layer tests in this story (nothing is persisted yet) — do not add `DATABASE_URL`-gated tests here.
- Fixtures: synthetic only, no PII, per NFR-2/AD-11 — `api/tests/fixtures/pdf/bac_credit_synthetic.pdf` plus its goldens file.

### Story-close overview (required before `done`)

Per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`, paste the four-section template (Request path / Key components / Why this shape / What not to break) into Completion Notes before marking this story `done` — see `4-3-card-routing-mode-review-default-list.md`'s Completion Notes for the expected format. "Request path" for this story is a code path (adapter registry → adapter), not an HTTP request path — describe it as such.

### Previous Story Intelligence (4.1–4.3)

- **4.1** (`register-and-match-cards-by-iban`) established the `domain/cards.py` + `application/cards.py` + `adapters/persistence/cards.py` split this story's `domain/canonical_line.py` + `application/bank_adapters.py` + `adapters/bank/bac_credit/` mirrors — pure validation in domain, Protocol + orchestration in application, concrete implementation in the adapter package.
- **4.2** (`manual-origin-card-cash-blank-no-origin-filter`) is where `PROVENANCE_HAND`/`PROVENANCE_PARSER` and `ORIGIN_KIND_*` were added to `domain/expenses.py` — confirms `domain/expenses.py` is the existing home for shared ledger-row vocabulary; this story's line-type consolidation (Task 1) follows that same pattern rather than inventing a parallel one.
- **4.3** (`card-routing-mode-review-default-list`) is the most recent story and sets three conventions this story follows: (a) a **Scope Note** section immediately after Acceptance Criteria, spelling out what the story does and does not build, because the surrounding pipeline stories don't exist yet — same situation here, one story earlier in the pipeline; (b) error classes follow the exact `MESSAGE`/`CODE`/`__init__(self, detail=None)` shape shown in `domain/errors.py` (`InvalidCardRoutingModeError`, `CardNotFoundError`) — Tasks 1.5 and 4.2 copy this shape; (c) 4.3's own dev-story run hit a Docker/pytest ergonomics issue (prod image has no pytest; `db` healthcheck interval stalls `docker compose run`) — worked around via `docker compose build api` then `docker run --network <worktree>_internal -v ./api/tests:/app/tests <image> pytest -q`. This story adds a new dependency (Task 5.1) — expect to rebuild the api image (not just remount tests) before running `test_bac_adapter.py`, and confirm `pdfplumber` actually lands in the built image, not just `pyproject.toml`.
- 4.3 also flagged (Dev Notes) that FK-based `ON DELETE SET NULL` gaps are "not a bug to fix in this story" pattern — same spirit applies here: this story does not need to solve problems that belong to later pipeline stories (upload UX, quarantine UX, dedup wiring) even where the domain function it defines (`compute_canonical_identity`) will eventually feed them.

### Git Intelligence Summary

Recent commits (`9a8b8d2`, `b5d658` `c7b9042`, `7eb298c`) all follow Conventional Commits aligned with branch type (`feat(cards): ...`, `fix(expenses): ...`), each ending with a `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer, and each is a single squash-merge PR per story (branch `feat/4/4-3-...` → PR → merge commit). Follow the same branch naming (`feat/4/4-4-adapter-contract-canonicalline-bac-normalize`, already checked out per the current worktree) and commit-message convention. No repo-wide formatting/lint step is skipped — 4.2's `d8a7e11 style: apply pre-push formatter output` shows a pre-push hook runs `ruff format`; let it run rather than hand-formatting.

### Project Structure Notes

- Alignment: this story adds exactly two new domain modules (`line_types.py`, `canonical_line.py`), one new application module (`bank_adapters.py`), and one new adapter package (`adapters/bank/bac_credit/`) — all inside the existing hex layout, no new top-level directories.
- No conflicts detected between `epics.md`'s ACs for 4.4 and `project-context.md`/`ARCHITECTURE-SPINE.md` — AC #6 (BAC proving fixture) is this story's own addition beyond `epics.md`'s literal AC text, justified above and scope-fenced against Story 4.5's stricter FR-35 exit bar so the two stories don't duplicate work.
- `api/adapters/bank/__init__.py` already exists (empty, from repo scaffold) — Task 5.2 adds a `bac_credit/` subpackage under it, first real content in that directory.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4: Adapter contract + CanonicalLine + BAC normalize] (lines 1024–1051) — story statement, ACs #1–#5 verbatim.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4: Statement upload & review] (lines 945–951) — "adapters (BAC credit-card acceptance + Promerica stub)"; FR-35/FR-36 assigned to Story 4.5 per the FR Coverage Map (lines 251–253), not 4.4.
- [Source: _bmad-output/planning-artifacts/epics.md#Requirements Inventory] — FR-14 (line 46), FR-31 (80), FR-32 (82), FR-33 (84), FR-34 (86), FR-35 (88), FR-36 (90), NFR-2 (114), NFR-8 (126), NFR-11 (132).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-1] (line 51) — dependency shortlist, bank-adapter boundaries.
- [Source: .../ARCHITECTURE-SPINE.md#AD-11] (line 136) — synthetic fixtures + goldens, no real PII.
- [Source: .../ARCHITECTURE-SPINE.md#AD-16] (line 170) — CanonicalLine field set.
- [Source: .../ARCHITECTURE-SPINE.md#AD-18] (line 182) — dedup identity authority, fallback tuple shape, `ref_quality` hint.
- [Source: .../ARCHITECTURE-SPINE.md#Stack] (line 281) — `pdfplumber` pinned `0.11.x`.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md] (lines 91, 154, 211, 255) — pdfplumber selected/pinned `0.11.10`, `bac_tools` BAC prior art reference.
- [Source: api/domain/expenses.py] — `ManualExpenseDraft` dataclass shape mirrored by `CanonicalLine`; existing `PROVENANCE_HAND`/`PROVENANCE_PARSER`/`LINE_TYPE_PURCHASE`.
- [Source: api/domain/settle.py] (line 20) — `INCLUDED_LINE_TYPES` literal this story promotes to named constants.
- [Source: api/domain/errors.py] (lines 296–344) — exact `DomainError` subclass shape (`MESSAGE`/`CODE`/`__init__`) all new error classes in this story follow.
- [Source: api/application/cards.py, api/domain/cards.py] — Story 4.1's domain/application/adapter split, the structural precedent this story's bank-adapter split mirrors.
- [Source: _bmad-output/implementation-artifacts/4-3-card-routing-mode-review-default-list.md] — Scope Note convention, error-class shape, Docker/pytest ergonomics workaround, commit/branch conventions.
- [Source: _bmad-output/project-context.md] — money/Decimal, dual-column rule, testing layers/discipline, fixture tiers, fail-loud detect, generic vocabulary/no-PII (all cited inline above where applied).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
