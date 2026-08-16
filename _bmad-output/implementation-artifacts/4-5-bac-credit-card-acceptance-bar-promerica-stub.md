---
baseline_commit: 0557bcba977df04e09263a7d0c4a86899d5ed8a2
---

# Story 4.5: BAC credit-card acceptance bar + Promerica stub

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator shipping v1 parsing,
I want a synthetic BAC credit-card fixture as the exit bar and a Promerica stub proving extension,
So that CI gates real parsing quality without core forks.

## Acceptance Criteria

1. **Given** the synthetic BAC credit-card fixture (known geometry) and golden expected rows, **when** the supported BAC credit product import runs in CI, **then** every must-parse line persists with required `CanonicalLine` fields and zero manual edits. (FR-35, AD-11)
2. **Given** the Promerica stub (or contract-test adapter), **when** contract tests run, **then** it exercises multi-statement extension without modifying core import, dedup, or list logic. (FR-36) **And** real Promerica parsing remains out of scope.
3. **Given** repository fixtures, **when** committed, **then** they are synthetic/anonymized only — no real statements or PII. (NFR-2)

## Hard Prerequisite — Story 4.4 must land first

This story consumes the `CanonicalLine` domain type, the `BankAdapter` application port, `run_detection`, and the `BacCreditAdapter` — **all of it built in Story 4.4** (`4-4-adapter-contract-canonicalline-bac-normalize.md`), which was `backlog` (zero code, `api/adapters/bank/` held only an empty `__init__.py`) at the time this story file was written. **Do not start this story until 4.4 is `done` and merged.** If you are running this story and 4.4's files (`api/domain/canonical.py`, `api/adapters/bank/bac_credit.py`, `api/application/import_pipeline.py`) do not exist yet, HALT and run 4.4 first — this story is not self-sufficient; re-deriving the contract here instead of reusing 4.4's would fork the adapter contract FR-31 explicitly forbids forking.

## Scope Note (read before starting)

This story does **two independent things**, both pure `pytest`/`adapters` work — still no Import Session/Statement persistence, no upload routes, no UI (Story 4.6 owns that):

1. **The v1 parsing acceptance bar** (AC #1): a committed, synthetic, known-geometry BAC credit-card PDF fixture + a golden expected-rows file, run through Story 4.4's full pipeline (`run_detection` → `BacCreditAdapter.split()` → `.parse_statement()`) in CI, asserting the parsed `CanonicalLine`s exactly match the golden rows with **zero manual edits**. This is the "real" fixture — bigger and more complete than Story 4.4's own throwaway TDD fixture (4.4 Task 9), and unlike that one, **this one is committed to the repo** (it's the release gate).
2. **A Promerica stub adapter** (AC #2): a second `BankAdapter` implementation that does **not** do real Promerica parsing (out of scope — PRD: "Real Promerica parsing is out of scope until samples exist") but proves the contract extends — registering it in `adapters/bank/__init__.py`'s `ADAPTERS` list is the **only** change required to "add a bank," and its contract tests exercise the multi-statement path.

These two halves can be built in either order but both are needed for the story to be done.

## Tasks / Subtasks

- [ ] Task 1: Confirm Story 4.4 prerequisite is in place (AC: #1, #2)
  - [ ] 1.1 Verify `api/domain/canonical.py` (`CanonicalLine`, taxonomy, `normalize_dual_amount`, `compute_canonical_identity`), `api/application/ports.py`/`import_pipeline.py` (`BankAdapter` Protocol, `run_detection`), and `api/adapters/bank/bac_credit.py` (`BacCreditAdapter`) all exist and their Story 4.4 tests pass. If not, stop and complete Story 4.4 first (see Hard Prerequisite above).

- [ ] Task 2: The synthetic BAC credit-card release-gate fixture (AC: #1, #3)
  - [ ] 2.1 **Read Story 4.4's Dev Notes "The fixture-geometry question is genuinely open at the architecture level" before starting.** There is no real BAC statement in this repo (`bank_data/` is gitignored/empty here) to extract-and-anonymize from, and `project-context.md` warns against treating a text-extract→rebuild PDF as layout-faithful — so this fixture, like Story 4.4's smaller one, must be **authored directly with a controlled text layer** (known coordinates/columns), not derived from a real sample. If Story 4.4 already added and got approval for a PDF-generation library (e.g. `reportlab`) for its own Task 9 fixture, reuse the same library/approach here rather than introducing a second one. If 4.4's fixture was instead built by some other in-memory/`conftest.py` mechanism that doesn't scale to a full multi-section committed fixture, you may need a real PDF-writing library now — if so, this is a new dependency and requires user approval before adding it (same HALT rule as 4.4 Task 9.1).
  - [ ] 2.2 Build the fixture PDF covering **every** row of the BAC credit baseline table from Story 4.4 Task 7.4 (reproduced here for convenience — do not diverge from it): `Detalle de compras` (purchase, must_parse), `Detalle de pago` (payment, must_parse), `Detalle de intereses` (interest, must_parse), `Otros cargos` (fee, must_parse), `Productos y servicios de elección voluntaria` (voluntary_service, best_effort), `Otras líneas de financiamiento` (installment_schedule, must_parse), `Saldo Anterior` (balance_forward, ignore). Include at least: one dual-CRC/USD-nonzero row (proving FR-33's CRC-wins rule end-to-end), one CRC-only and one USD-only row, one negative/credit-note-shaped row if your Task-4.4 sign convention supports it, and a Spanish `DD-MMM-YY` date in each must-parse section.
  - [ ] 2.3 Commit the fixture under `api/tests/fixtures/pdf/` (the directory `project-context.md` already designates for this — `.gitkeep` currently the only file there). Name it descriptively and genericaly, e.g. `bac_credit_synthetic.pdf` — **no personal names, no real card labels** (NFR-2, generic vocabulary — project-context "Naming & secrets").
  - [ ] 2.4 Author the golden expected-rows file alongside it (e.g. `api/tests/fixtures/pdf/bac_credit_synthetic.golden.json` or `.py` — developer's call on format, keep it diffable/reviewable) listing every expected `CanonicalLine` (all fields) the fixture should produce, in the section table's order, **excluding** the `Saldo Anterior` row (policy is `ignore` — no `CanonicalLine` at all for it) and **including** the `voluntary_service` row only if your fixture's content is clean enough to parse (if you deliberately want to exercise the best-effort/quarantine path too, add a second, separately-asserted malformed row and expect it in a `quarantined` list, not the golden `lines` list).
  - [ ] 2.5 `api/tests/test_bac_credit_fixture_acceptance.py` (new file — this is the CI release-gate test, keep it separate from Story 4.4's smaller `test_bac_credit_adapter.py`): load the fixture, run it through `run_detection` (content-signature path, not override) → `BacCreditAdapter.split()` (expect exactly 1 slice for a single-cardholder fixture) → `.parse_statement()`, and assert the resulting `lines` list equals the golden file **exactly** (every `CanonicalLine` field, not a subset) with **zero manual edits** — i.e. the test asserts equality directly against the golden data, not against a hand-adjusted expectation. This test is what "zero manual edits" means operationally: if it doesn't pass on the first parse, the fixture/adapter has a real gap, not something to paper over in the test.
  - [ ] 2.6 Confirm this test runs as part of the existing `api` CI pytest suite (no new CI job/workflow file needed — `.github/workflows/ci.yml` already runs `api pytest` per AD-15; this is just another test file under `api/tests/`). If CI has any fixture-directory allowlist/gitignore rule beyond the general `bank_data/` exclusion, verify the new PDF under `api/tests/fixtures/pdf/` is not accidentally excluded.

- [ ] Task 3: Promerica stub adapter (AC: #2, #3)
  - [ ] 3.1 New `api/adapters/bank/promerica_stub.py`: `class PromericaStubAdapter` implementing the same `BankAdapter` Protocol from Story 4.4 — `bank = "promerica"`, `product_id = "promerica_stub"`, `account_kind = "credit"` (or `"other"` if you prefer signaling it's not a real product — developer's call, document the choice).
  - [ ] 3.2 `detect()`: a simple, clearly-fake signature (e.g. filename contains `"promerica"`) — this is a stub proving pluggability, not real bank detection; do not attempt real Promerica content-signature heuristics (PRD: real parsing is out of scope until samples exist).
  - [ ] 3.3 `split()`: this is the **multi-statement proof point** AC #2 requires — implement it against a small synthetic multi-section stub fixture (need not be a realistic bank layout; a minimal synthetic PDF with 2+ clearly-delimited "statement" markers is enough) returning N `StatementSlice`s, proving the contract's split step generalizes beyond BAC's single-adapter case.
  - [ ] 3.4 `parse_statement()`: emits a small number of canned/trivial `CanonicalLine`s per slice (`product_id="promerica_stub"`, `line_type` from the Story 4.4 taxonomy, obviously-synthetic amounts/descriptions) — enough to prove the full pipeline runs end-to-end for a second adapter, not a real parser.
  - [ ] 3.5 `api/adapters/bank/__init__.py`: append `PromericaStubAdapter()` to `ADAPTERS` — this is the concrete proof of FR-31/FR-36 "new banks don't rewrite core import" (Story 4.4's `run_detection`, `application/import_pipeline.py`, and `domain/canonical.py` must need **zero** edits for this addition; if you find yourself editing any of those three to accommodate the stub, that is a contract-design bug to flag, not silently work around).
  - [ ] 3.6 `api/tests/test_promerica_stub_adapter.py` (new file): contract tests — adapter is discoverable via `ADAPTERS`; `run_detection` picks it via filename signature without any change to `run_detection` itself; multi-statement `split()` returns >1 slice on the stub fixture and each slice parses independently; a statement in the same "session" failing does not prevent siblings from parsing (mirror the spirit of FR-15's multi-statement resilience, even though Import Session itself doesn't exist yet — this test proves it at the adapter-pipeline level: call `parse_statement()` on slice 2 after simulating slice 1 raising, and assert slice 2 still succeeds independently since each `parse_statement()` call is independent per Story 4.4's contract).
  - [ ] 3.7 Confirm the stub's own fixture (Task 3.3) is synthetic-only — same NFR-2 constraint as Task 2, no real Promerica statement exists to derive it from anyway.

## Dev Notes

### This story is entirely additive on top of Story 4.4 — read that story's Dev Notes first

Story 4.4 established the hexagonal boundaries (`domain/canonical.py` pure, `application` orchestrates, `adapters/bank/*` is the only place PDF libraries are imported), the taxonomy/section-policy constants, the dual-amount normalization rule, and the dedup identity function. This story does not re-derive any of that — it (a) exercises the existing `BacCreditAdapter` against a bigger, committed, CI-gating fixture, and (b) adds one more adapter (`PromericaStubAdapter`) to prove the contract generalizes. If anything about the existing contract seems insufficient to build the Promerica stub against (e.g. `StatementSlice`'s shape is too BAC-specific), that is a legitimate finding — flag it in Completion Notes rather than quietly special-casing Promerica in `run_detection` or `domain/canonical.py`.

### "Zero manual edits" (AC #1) is the whole point of this story

FR-35's exact phrase — "persists every must-parse line ... with zero manual edits" — means the acceptance test (Task 2.5) must pass by construction: build the fixture, run it through the real pipeline, and the golden file records whatever the pipeline actually produced (verified correct by inspection against the section-map/date/amount rules), not a value hand-tuned to make a flaky test pass. If Task 2's fixture doesn't cleanly parse on the first honest attempt, that's a signal to fix the adapter (Story 4.4 code) or the fixture's clarity — not to loosen the golden-row assertion.

### Fixture-geometry risk carries forward from Story 4.4

The `[OPEN — architecture]` fixture-geometry question (`stack-options.md` line 61, PRD Constraints) is this project's flagged highest technical risk, and this story's fixture is the one that actually gates CI/release (Story 4.4's was throwaway TDD scaffolding). Whatever PDF-authoring approach you use, document it clearly in Completion Notes — a future story or an architecture follow-up may need to revisit it once real BAC/Promerica samples are available for comparison (out of this story's scope, but worth leaving a clear trail).

### What NOT to build (explicit scope fences)

- No Import Session/Statement/Import Batch, no upload endpoint, no `ledger_entries` writes — still Story 4.6+ (same fence as Story 4.4).
- No real Promerica parsing — PRD is explicit this waits on real samples; the stub's fixture and parsed rows are intentionally trivial/synthetic.
- No debit-product or "eco"/"dolares"/"colones" BAC layout support — PRD scope explicitly marks those "provisional until fixture review" against real statements, which is out of v1's committed-fixture acceptance bar (only the one supported BAC credit product needs to clear this bar).
- No changes to `domain/canonical.py`, `application/import_pipeline.py`, or `application/ports.py` to special-case either adapter — if the Promerica stub needs the contract to change, that's a finding to report, not a change to make unilaterally without flagging it.

### Testing Requirements (project-context "Discipline" + "Fixtures" + "Layers")

- CI/release gate: **this story's own fixture** (Task 2) is exactly what project-context's "Fixtures — two-tier (AD-11)" rule describes: "CI/release gate: synthetic PDFs in `api/tests/fixtures/pdf/` + goldens." "BAC credit synthetic = exit bar" is this story, verbatim.
- "Promerica stub covers multi-statement" (project-context, same section) — Task 3.6 is that requirement.
- Money asserts use `Decimal`, never `float` (inherited from Story 4.4's `CanonicalLine.amount` type — nothing new to enforce here, just don't regress it).
- No Postgres/integration tier needed — same reasoning as Story 4.4, no persistence exists yet.

### Project Structure Notes

- New: `api/tests/fixtures/pdf/bac_credit_synthetic.pdf` (+ golden file), `api/tests/test_bac_credit_fixture_acceptance.py`, `api/adapters/bank/promerica_stub.py`, a small Promerica-stub test fixture, `api/tests/test_promerica_stub_adapter.py`.
- Modified: `api/adapters/bank/__init__.py` (`ADAPTERS` list gains `PromericaStubAdapter()`).
- No conflicts detected — this story only adds files/registrations, it does not modify Story 4.4's contract types.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5: BAC credit-card acceptance bar + Promerica stub] — ACs, story statement.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#FR-35, FR-36] (lines 655–671) — BAC acceptance bar, Promerica stub scope.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#NFR-2] (line 782) — no personal data in the repository; fixtures anonymized/synthetic.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#Acceptance and extension] (lines 278–282) — "zero manual edits" phrasing, two-tier test reality, Promerica out-of-scope framing.
- [Source: _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md#Constraints and commitments] (lines 866–876) — fixture anonymization risk `[OPEN — architecture]`, two-tier test reality, release-gate framing.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-11] — CI fixtures rule this story directly implements.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md] lines 61, 238 — open fixture-geometry risk, carried forward from Story 4.4.
- [Source: _bmad-output/implementation-artifacts/4-4-adapter-contract-canonicalline-bac-normalize.md] — **hard prerequisite**; `CanonicalLine`, taxonomy, `BankAdapter` port, `run_detection`, `BacCreditAdapter`, and the BAC section-policy table this story reuses verbatim.
- [Source: _bmad-output/project-context.md] — "Fixtures — two-tier (AD-11)" section (BAC credit synthetic = exit bar; Promerica stub covers multi-statement — this story's requirements verbatim), generic vocabulary/no PII, Decimal money, synthetic CI goldens gate release.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
