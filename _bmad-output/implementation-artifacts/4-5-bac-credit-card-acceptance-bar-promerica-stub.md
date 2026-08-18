---
baseline_commit: 0557bcba977df04e09263a7d0c4a86899d5ed8a2
---

# Story 4.5: BAC credit-card acceptance bar + Promerica stub

Status: done

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

This story consumes the `CanonicalLine` domain type, the `BankAdapter` application port, `detect_bank_adapter`, and the `BacCreditAdapter` — **all of it built in Story 4.4** (`4-4-adapter-contract-canonicalline-bac-normalize.md`), now `done` and merged.

**Correct-course note (2026-08-17, see `sprint-change-proposal-2026-08-17.md`):** this story was drafted before 4.4 landed and used placeholder names that don't match the real, `done` implementation. Reconciled here:
- `api/domain/canonical_line.py` (not `canonical.py`)
- `api/application/bank_adapters.py` (not `import_pipeline.py`) — function is `detect_bank_adapter()` (not `run_detection`)
- `api/adapters/bank/bac_credit/adapter.py` (a package, not a single `bac_credit.py` file)
- `BankAdapter.split(pdf_bytes) -> list[bytes]` and `.parse(statement_bytes) -> list[CanonicalLine]` — no `.parse_statement()` method, no `StatementSlice` type
- `BankAdapter`'s bank-identity property is `bank_id`, not `bank`
- 4.4's own code-review pass added **AD-25/26/27** (shared section/date/boundary contract) — see new Dev Notes subsection below
- 4.4's BAC fixture/task-work is **Task 5** (not Task 9 as referenced elsewhere in this story's original text — 4.4's final task numbering has only 6 tasks)

If you are running this story and these files do not exist, HALT and run 4.4 first.

## Scope Note (read before starting)

This story does **two independent things**, both pure `pytest`/`adapters` work — still no Import Session/Statement persistence, no upload routes, no UI (Story 4.6 owns that):

1. **The v1 parsing acceptance bar** (AC #1): a committed, synthetic, known-geometry BAC credit-card PDF fixture + a golden expected-rows file, run through Story 4.4's full pipeline (`detect_bank_adapter()` → `BacCreditAdapter.split()` → `.parse()`) in CI, asserting the parsed `CanonicalLine`s exactly match the golden rows with **zero manual edits**. This is the "real," stricter fixture — bigger and more complete than Story 4.4's own proving fixture (4.4 **Task 5**, `bac_credit_synthetic.pdf` — already committed too, but scoped only to exercise the contract's moving parts, not full coverage). **This story's fixture needs its own filename** (see Task 2.3 correction below) — it does not replace 4.4's.
2. **A Promerica stub adapter** (AC #2): a second `BankAdapter` implementation that does **not** do real Promerica parsing (out of scope — PRD: "Real Promerica parsing is out of scope until samples exist") but proves the contract extends — registering it in `adapters/bank/__init__.py`'s `ADAPTERS` list is the **only** change required to "add a bank," and its contract tests exercise the multi-statement path.

These two halves can be built in either order but both are needed for the story to be done.

## Tasks / Subtasks

- [x] Task 1: Confirm Story 4.4 prerequisite is in place (AC: #1, #2)
  - [x] 1.1 Verify `api/domain/canonical_line.py` (`CanonicalLine`, taxonomy, `normalize_dual_column_amount`, `compute_canonical_identity`), `api/application/bank_adapters.py` (`BankAdapter` Protocol, `detect_bank_adapter`), and `api/adapters/bank/bac_credit/adapter.py` (`BacCreditAdapter`) all exist and their Story 4.4 tests (`api/tests/test_bac_adapter.py`, `test_canonical_line_domain.py`, `test_bank_adapters_application.py`) pass. Also confirm `api/domain/statement_layout.py` and `api/domain/statement_dates.py` exist (AD-25/26/27, added in 4.4's code-review pass — this story's Promerica stub must use them, see Dev Notes). If not, stop and complete Story 4.4 first (see Hard Prerequisite above).

- [x] Task 2: The synthetic BAC credit-card release-gate fixture (AC: #1, #3)
  - [x] 2.1 **Correct-course update (2026-08-17):** this dependency question is resolved — Story 4.4 (Task 5.4) added `fpdf2==2.8.5` (dev dependency, already approved) and built `api/scripts/generate_bac_fixture.py` to author its own controlled-text-layer fixture. Reuse that same library/script for this story's bigger fixture (extend the script rather than writing a second generator) — no new dependency approval needed. `bank_data/` is gitignored (never committed) — per `docs/bank-statement-parsing-agent-setup.md` it now holds real BAC statements locally, but this fixture, like 4.4's, must still be authored directly with a controlled text layer, not derived from a real sample (NFR-2).
  - [x] 2.1a **New (correct-course addition, 2026-08-17):** before authoring the fixture's content (2.2), run `api/scripts/statement_recon.py` against a real BAC credit-card statement in your local `bank_data/` to sanity-check two things the fixture is about to encode as ground truth: (a) the sign convention 4.4 established (purchases/fees/interest/installment_schedule/voluntary_service positive; payments/credit_notes negative) — 4.4's own Review Findings explicitly deferred validating this against real data to this story; (b) the section/column layout you're about to hand-author. This does **not** change the fixture's synthetic/authored nature (NFR-2) — it only confirms the values you're about to invent aren't quietly wrong. If real data contradicts the established sign convention, flag it in Completion Notes rather than silently changing it (see 4.4's "What not to break").
  - [x] 2.2 Build the fixture PDF covering **every** row of the BAC credit baseline section map (authoritative source: Story 4.4's Dev Notes "BAC credit baseline section map," reproduced here for convenience — **correct-course fix:** this was previously cited as "Task 7.4," which doesn't exist; 4.4 has only 6 tasks — do not diverge from the section map regardless): `Detalle de compras` (purchase, must_parse), `Detalle de pago` (payment, must_parse), `Detalle de intereses` (interest, must_parse), `Otros cargos` (fee, must_parse), `Productos y servicios de elección voluntaria` (voluntary_service, best_effort), `Otras líneas de financiamiento` (installment_schedule, must_parse), `Saldo Anterior` (balance_forward, ignore). Include at least: one dual-CRC/USD-nonzero row (proving FR-33's CRC-wins rule end-to-end), one CRC-only and one USD-only row, one negative/credit-note-shaped row if your Task-4.4 sign convention supports it, and a Spanish `DD-MMM-YY` date in each must-parse section.
  - [x] 2.3 **Correct-course note (2026-08-17):** `api/tests/fixtures/pdf/` is no longer empty — Story 4.4 already committed its own smaller *proving* fixture there at `bac_credit_synthetic.pdf` + `bac_credit_synthetic_goldens.py`, consumed by 4.4's own `api/tests/test_bac_adapter.py`. **Do not overwrite it.** Commit this story's bigger, stricter release-gate fixture under a distinct name, e.g. `bac_credit_acceptance_bar.pdf` (+ matching golden file name) — **no personal names, no real card labels** (NFR-2, generic vocabulary — project-context "Naming & secrets").
  - [x] 2.4 Author the golden expected-rows file alongside it (e.g. `api/tests/fixtures/pdf/bac_credit_synthetic.golden.json` or `.py` — developer's call on format, keep it diffable/reviewable) listing every expected `CanonicalLine` (all fields) the fixture should produce, in the section table's order, **excluding** the `Saldo Anterior` row (policy is `ignore` — no `CanonicalLine` at all for it) and **including** the `voluntary_service` row only if your fixture's content is clean enough to parse (if you deliberately want to exercise the best-effort/quarantine path too, add a second, separately-asserted malformed row and expect it in a `quarantined` list, not the golden `lines` list).
  - [x] 2.5 `api/tests/test_bac_credit_fixture_acceptance.py` (new file — this is the CI release-gate test, keep it separate from Story 4.4's smaller `test_bac_adapter.py`): load the fixture, run it through `detect_bank_adapter()` (content-signature path, not override) → `BacCreditAdapter.split()` (expect exactly 1 chunk for a single-cardholder fixture) → `.parse()`, and assert the resulting `list[CanonicalLine]` equals the golden file **exactly** (every field, not a subset) with **zero manual edits** — i.e. the test asserts equality directly against the golden data, not against a hand-adjusted expectation. This test is what "zero manual edits" means operationally: if it doesn't pass on the first parse, the fixture/adapter has a real gap, not something to paper over in the test.
  - [x] 2.6 Confirm this test runs as part of the existing `api` CI pytest suite (no new CI job/workflow file needed — `.github/workflows/ci.yml` already runs `api pytest` per AD-15; this is just another test file under `api/tests/`). If CI has any fixture-directory allowlist/gitignore rule beyond the general `bank_data/` exclusion, verify the new PDF under `api/tests/fixtures/pdf/` is not accidentally excluded.

- [x] Task 3: Promerica stub adapter (AC: #2, #3)
  - [x] 3.1 New `api/adapters/bank/promerica_stub.py`: `class PromericaStubAdapter` implementing the same `BankAdapter` Protocol from Story 4.4 (`api/application/bank_adapters.py`) — **correct-course fix:** the property is `bank_id`, not `bank`. `bank_id = "promerica"`, `product_id = "promerica_stub"`, `account_kind = "credit"` (or `"other"` if you prefer signaling it's not a real product — developer's call, document the choice).
  - [x] 3.2 `detect()`: a simple, clearly-fake signature (e.g. filename contains `"promerica"`) — this is a stub proving pluggability, not real bank detection; do not attempt real Promerica content-signature heuristics (PRD: real parsing is out of scope until samples exist).
  - [x] 3.3 `split()`: this is the **multi-statement proof point** AC #2 requires — implement it against a small synthetic multi-section stub fixture (need not be a realistic bank layout; a minimal synthetic PDF with 2+ clearly-delimited "statement" markers is enough) returning `list[bytes]` (**correct-course fix:** no `StatementSlice` type — 4.4's `BankAdapter.split()` returns raw byte chunks), proving the contract's split step generalizes beyond BAC's single-adapter case. **New requirement (AD-25/AD-27, added by 4.4's code-review pass after this story was drafted):** use the shared `domain.statement_layout.detect_statement_boundaries()` for boundary detection rather than a private marker search — see new Dev Notes subsection below.
  - [x] 3.4 `parse()` (**correct-course fix:** 4.4's actual method name, not `parse_statement()`): emits a small number of canned/trivial `CanonicalLine`s per slice (`product_id="promerica_stub"`, `line_type` from the Story 4.4 taxonomy, obviously-synthetic amounts/descriptions) — enough to prove the full pipeline runs end-to-end for a second adapter, not a real parser. **New requirement (AD-25/AD-26, added by 4.4's code-review pass after this story was drafted):** declare sections via `domain.statement_layout.SectionSpec`/`SectionCursor` and parse dates via `domain.statement_dates.parse_statement_date()` — same shared modules `BacCreditAdapter` uses — rather than a private section dict or hand-rolled date parsing. Call `validate_canonical_line` (from `domain.canonical_line`) on each row before returning, same as `BacCreditAdapter.parse()` does.
  - [x] 3.5 `api/adapters/bank/__init__.py`: **correct-course fix** — this file currently has no `ADAPTERS` list at all (just a docstring; Story 4.4 deliberately scoped out building a caller/registry). Create it fresh: `ADAPTERS: list[BankAdapter] = [BacCreditAdapter(), PromericaStubAdapter()]` — register **both** adapters here, this is the first place either one gets wired into a registry. This is the concrete proof of FR-31/FR-36 "new banks don't rewrite core import": Story 4.4's `detect_bank_adapter()` (`application/bank_adapters.py`) and `domain/canonical_line.py` must need **zero** edits for this addition; if you find yourself editing either to accommodate the stub, that is a contract-design bug to flag, not silently work around.
  - [x] 3.6 `api/tests/test_promerica_stub_adapter.py` (new file): contract tests — adapter is discoverable via `ADAPTERS`; `detect_bank_adapter()` (**correct-course fix:** not `run_detection`) picks it via filename signature without any change to `detect_bank_adapter()` itself; multi-statement `split()` returns >1 byte chunk on the stub fixture and each chunk parses independently; a statement in the same "session" failing does not prevent siblings from parsing (mirror the spirit of FR-15's multi-statement resilience, even though Import Session itself doesn't exist yet — this test proves it at the adapter-pipeline level: call `parse()` on chunk 2 after simulating chunk 1 raising, and assert chunk 2 still succeeds independently since each `parse()` call is independent per Story 4.4's contract).
  - [x] 3.7 Confirm the stub's own fixture (Task 3.3) is synthetic-only — same NFR-2 constraint as Task 2, no real Promerica statement exists to derive it from anyway. **Correct-course note (2026-08-17):** this also confirms scope — a *real* Promerica adapter (built via the agent-assisted design-session process in `docs/bank-statement-parsing-agent-setup.md`, grounded in real statements + `statement_recon.py`) is explicitly **future work**: it gets picked up as its own story once real Promerica statement samples exist and Promerica support is prioritized (per PRD, real Promerica parsing is out of scope until samples exist). Finishing this stub does not trigger or require that work.

## Dev Notes

### This story is entirely additive on top of Story 4.4 — read that story's Dev Notes first

Story 4.4 established the hexagonal boundaries (`domain/canonical_line.py` pure, `application` orchestrates, `adapters/bank/*` is the only place PDF libraries are imported), the taxonomy/section-policy constants, the dual-amount normalization rule, and the dedup identity function. This story does not re-derive any of that — it (a) exercises the existing `BacCreditAdapter` against a bigger, committed, CI-gating fixture, and (b) adds one more adapter (`PromericaStubAdapter`) to prove the contract generalizes. If anything about the existing contract seems insufficient to build the Promerica stub against (e.g. `split()`'s `list[bytes]` shape is too BAC-specific), that is a legitimate finding — flag it in Completion Notes rather than quietly special-casing Promerica in `detect_bank_adapter()` or `domain/canonical_line.py`.

### AD-25/26/27 — shared section/date/boundary contract (new since this story was drafted)

Story 4.4's code-review pass (2026-08-17) added three architecture decisions this story must follow, not re-derive:

- **AD-25** (`api/domain/statement_layout.py`): `SectionSpec`/`SectionCursor` — adapters declare their section vocabulary as a list of `SectionSpec(title, line_type, policy, column_header=None)` instead of a private title→policy dict; `SectionCursor` walks extracted lines against that list.
- **AD-26** (`api/domain/statement_dates.py`): `parse_statement_date(raw, *, date_format, reference_date=None)` — adapters declare a date-format token string (e.g. `"%d-%b-%y"` for BAC credit's `DD-MMM-YY`) resolved against a fixed Spanish-month table, never `datetime`/locale parsing.
- **AD-27** (`api/domain/statement_layout.py`): `detect_statement_boundaries(pages, *, marker)` — a shared priority chain (printed page-counter resetting to 1 > repeating marker > assume single statement) for `split()`.

`BacCreditAdapter` (4.4) already uses all three. The Promerica stub (Task 3) must use them too — even though its fixture/markers are trivial/synthetic, the *mechanism* (declare via `SectionSpec`, parse dates via `parse_statement_date`, detect boundaries via `detect_statement_boundaries`) is what actually proves FR-31/FR-36's "new banks plug into the existing contract" claim. A stub that hand-rolls its own section dict or date parsing instead would prove less than the AC requires.

**Real Promerica adapter is future work.** A real Promerica adapter — the kind that would surface genuinely new gaps in this contract — is out of this story's scope (PRD: real parsing waits on real samples) and, per `docs/bank-statement-parsing-agent-setup.md`, should be built via an agent-assisted design session grounded in real statements once those samples exist, as its own future story — not folded into this stub.

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
- [Source: _bmad-output/implementation-artifacts/4-4-adapter-contract-canonicalline-bac-normalize.md] — **hard prerequisite**; `CanonicalLine`, taxonomy, `BankAdapter` port, `detect_bank_adapter`, `BacCreditAdapter`, and the BAC section-policy table this story reuses verbatim.
- [Source: _bmad-output/project-context.md] — "Fixtures — two-tier (AD-11)" section (BAC credit synthetic = exit bar; Promerica stub covers multi-statement — this story's requirements verbatim), generic vocabulary/no PII, Decimal money, synthetic CI goldens gate release.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-25, #AD-26, #AD-27] — shared section-header, date-format, and statement-boundary contracts, added during Story 4.4's code-review pass after this story was originally drafted; the Promerica stub (Task 3) must use them.
- [Source: docs/bank-statement-parsing-agent-setup.md] — the agent-assisted, real-data design-session process for building a *real* bank/product adapter (Promerica or otherwise); explicitly out of this story's scope, referenced from Task 3.7 and the AD-25/26/27 Dev Notes subsection as where that future work belongs.
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-17.md] — the correct-course pass that reconciled this story's naming/assumptions against Story 4.4's actual `done` implementation.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `uv run pytest -q` (api): 345 passed, 121 skipped, 0 failed — full suite, no regressions.
- `uv run ruff check .` / `uv run ruff format --check .` (api): clean.

### Completion Notes List

- **Task 1** — verified all Story 4.4 prerequisite files exist (`domain/canonical_line.py`, `application/bank_adapters.py`, `adapters/bank/bac_credit/adapter.py`, `domain/statement_layout.py`, `domain/statement_dates.py`) and their 49 tests pass before starting.
- **Task 2** — extended `scripts/generate_bac_fixture.py` with `build_acceptance_bar_fixture()` (per 2.1, reusing the same script rather than a second generator). New single-statement, single-chunk fixture `bac_credit_acceptance_bar.pdf` covers every section of the BAC credit baseline map (including `Saldo Anterior`'s ignore policy) plus a dual-CRC/USD-nonzero row, a CRC-only row, a USD-only row, and the inherently-negative payment row. Golden file `bac_credit_acceptance_bar_goldens.py` was derived directly from the real pipeline's output (detect → split → parse), then verified correct by inspection against the section/date/amount rules — not hand-tuned. `test_bac_credit_fixture_acceptance.py` asserts exact equality, zero manual edits, and resolves via the content-signature detection path (generic filename), matching AC #1.
- **Task 2.1a finding (sign convention — confirmed, not contradicted):** recovered one real BAC credit statement (`BAC_CRED_ECO_jan.pdf`) locally into gitignored `bank_data/` from git history (the documented recovery path in `scripts/README.md`) and ran `statement_recon.py` against it. Real statement amounts print unsigned (no `-`/parentheses) in both the payment and purchase sections — the negative-for-payments convention Story 4.4 established is a software-level ledger-modeling choice, not something the real PDF's printed values contradict. Left un-committed, gitignored recon scratch output at `tests/fixtures/bank_recon/bac_recon_check/` (mapping.yaml/mock PDF) for reference; the real PDF itself was never staged/committed.
- **Task 2.1a finding (section-header text — real gap, flagged not silently fixed):** the same recon run shows real BAC credit statements print section headers as `A) Detalle de pago del periodo`, `B) Detalle de compras del periodo`, `C) Detalle de intereses`, `D) Detalle de otros cargos`, `E) Detalle de productos y servicios de elección voluntaria` — lettered prefixes and extra wording (`del periodo`, `Detalle de otros cargos` vs. the map's `Otros cargos`) that Story 4.4's `BacCreditAdapter._SECTIONS` and this story's own (correctly, per Task 2.2's "do not diverge from the section map regardless") reproduced section map do **not** match. `SectionCursor.see_header_line()` does an exact-string lookup, so a real BAC statement's actual headers would currently fall into the "unmapped" bucket and raise `InvalidCanonicalLineError` on every row. This story's fixture/golden test therefore proves the pipeline mechanism (detect → split → parse → validate) end-to-end correctly, but does **not** prove `BacCreditAdapter` would parse a real BAC statement's real header text — that gap pre-exists this story (inherited from 4.4's originally-invented section titles) and needs a follow-up (update `_SECTIONS` titles, likely with a prefix-tolerant or two-level-header-aware match per the `docs/bank-statement-parsing-agent-setup.md` "two-level headers" note) before this adapter is pointed at production data. Not fixed here: doing so would silently diverge from Task 2.2's explicit "authoritative source ... do not diverge from the section map regardless" instruction, and is exactly the kind of contract gap the Dev Notes say to flag rather than unilaterally patch.
- **Task 3** — new `adapters/bank/promerica_stub.py`: `PromericaStubAdapter` (`bank_id="promerica"`, `product_id="promerica_stub"`, `account_kind="other"` — chosen over `"credit"` to avoid implying a real Promerica credit-card contract exists). `detect()` uses a clearly-fake filename/content marker. `split()` uses the shared `detect_statement_boundaries()` (AD-27) against a synthetic 2-statement fixture (`promerica_stub_multi.pdf`, generated by new `scripts/generate_promerica_stub_fixture.py`), proving the multi-statement path generalizes beyond BAC. `parse()` declares its one trivial section via `SectionSpec`/`SectionCursor` (AD-25) and parses dates via `parse_statement_date()` (AD-26), calling `validate_canonical_line()` per row — same shared mechanism `BacCreditAdapter` uses, per the story's explicit requirement that a stub hand-rolling its own section dict/date parsing would prove less than AC #2 requires.
- `adapters/bank/__init__.py` gained its first `ADAPTERS` registry (`[BacCreditAdapter(), PromericaStubAdapter()]`) — confirmed **zero** edits were needed to `application/bank_adapters.py` or `domain/canonical_line.py` to register the second adapter, the concrete proof FR-31/FR-36 requires.
- `test_promerica_stub_adapter.py` covers: registry discoverability, filename detection, `detect_bank_adapter()` resolving the stub with no changes to that function, multi-statement `split()` (>1 chunk), independent per-chunk `parse()`, one statement's parse failure not affecting an independently-parsed sibling, and the unmapped-section fail-loud path.
- No changes were made to `domain/canonical_line.py`, `application/bank_adapters.py`, or `application/ports.py` — confirmed per the "What NOT to build" scope fence.
- Real Promerica parsing remains explicitly out of scope (stub only) — future work per `docs/bank-statement-parsing-agent-setup.md`, not triggered by this story.

### File List

- `api/adapters/bank/__init__.py` (modified — new `ADAPTERS` registry)
- `api/adapters/bank/promerica_stub.py` (new; modified in review — uses shared `_shared.py` helpers)
- `api/adapters/bank/_shared.py` (new in review — `parse_amount_field`/`sniff_content_marker` extracted from duplication between adapters)
- `api/adapters/bank/bac_credit/adapter.py` (modified in review — uses shared `_shared.py` helpers)
- `api/scripts/generate_bac_fixture.py` (modified — added `build_acceptance_bar_fixture()`)
- `api/scripts/generate_promerica_stub_fixture.py` (new)
- `api/tests/fixtures/pdf/bac_credit_acceptance_bar.pdf` (new)
- `api/tests/fixtures/pdf/bac_credit_acceptance_bar_goldens.py` (new)
- `api/tests/fixtures/pdf/promerica_stub_multi.pdf` (new)
- `api/tests/test_bac_credit_fixture_acceptance.py` (new)
- `api/tests/test_promerica_stub_adapter.py` (new)

### Review Findings

Reviewed via `bmad-code-review` (2026-08-17) against uncommitted changes on `feat/4/4-5-bac-credit-card-acceptance-bar-promerica-stub`, three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor — full mode against this story file). Acceptance Auditor found zero AC/spec violations (ran the new tests and cross-checked golden values against adapter logic directly). Remaining findings below.

- [x] [Review][Defer] Acceptance-bar release gate never proves compatibility with a real BAC statement's section-header text [api/adapters/bank/bac_credit/adapter.py:56-69] — deferred: real BAC credit statements print headers as `A) Detalle de pago del periodo`, `B) Detalle de compras del periodo`, etc. (lettered prefixes, extra wording), confirmed via `statement_recon.py` against real local data per this story's own Task 2.1a/Completion Notes. `SectionCursor.see_header_line()` does an exact-string match against `_SECTIONS`, so every row of a real BAC statement would currently fall into "unmapped" and raise `InvalidCanonicalLineError`. Reason for deferring: fixing requires diverging from Task 2.2's explicit "do not diverge from the section map" instruction — a scope decision beyond this story, not a quiet patch.
- [x] [Review][Defer] `last_split_boundary_method` mutable instance attribute is newly exposed to concurrent-request corruption [api/adapters/bank/promerica_stub.py:97, api/adapters/bank/bac_credit/adapter.py:131] — deferred: this story's new `ADAPTERS: list[BankAdapter] = [BacCreditAdapter(), PromericaStubAdapter()]` singleton registry (`api/adapters/bank/__init__.py:15`) is the first place these adapter instances become shared, long-lived objects, so a concurrent request touching two statements of the same bank could read another request's boundary-method value. Reason for deferring: no concurrent caller exists yet — Story 4.6's upload/import pipeline hasn't landed, so this isn't reachable in production yet.
- [x] [Review][Patch] Golden-equality test checks only 6 of `CanonicalLine`'s 9 fields [api/tests/test_bac_credit_fixture_acceptance.py:40-48] — fixed: `_line_to_dict()` now includes `provenance`, `external_ref`, `ref_quality`; goldens updated to assert all 9 fields.
- [x] [Review][Patch] `_parse_amount_field()` and `detect()`'s content-sniff logic are duplicated verbatim [api/adapters/bank/promerica_stub.py, api/adapters/bank/bac_credit/adapter.py] — fixed: extracted to new `api/adapters/bank/_shared.py` (`parse_amount_field`, `sniff_content_marker`), both adapters now call the shared helpers.
- [x] [Review][Patch] Promerica stub tests have coverage gaps vs. Task 3.6 [api/tests/test_promerica_stub_adapter.py] — fixed: `test_each_split_chunk_parses_independently` now asserts full row content (date/description/currency/line_type/amount) per chunk; `test_one_statement_parse_failure_does_not_prevent_siblings_from_parsing` now builds a real multi-page statement, calls `split()`, and calls `parse()` on the resulting chunks per Task 3.6's literal instruction.
- [x] [Review][Patch] No test pins `PromericaStubAdapter.account_kind == "other"` [api/adapters/bank/promerica_stub.py:58] — fixed: added `test_account_kind_is_other`.
- [x] [Review][Defer] Latent pdfium/PDF-handling edge cases in `promerica_stub.py` [api/adapters/bank/promerica_stub.py:99,128-132,154] — deferred, pre-existing: pdfplumber/pdfium page-count mismatch when slicing chunks, unguarded `pdfium.PdfDocument()` call, page-counter footer lines that would be misclassified as unmapped section headers during `parse()`, and a bare `assert line_type is not None` stripped under `-O`. All four replicate identical patterns already accepted in `api/adapters/bank/bac_credit/adapter.py` (Story 4.4, merged/done) and aren't exercised by either story's current fixtures.
- [x] [Review][Defer] Task 2.4's "quarantined list" concept has no equivalent in the real `BankAdapter.parse()` contract [_bmad-output/implementation-artifacts/4-5-bac-credit-card-acceptance-bar-promerica-stub.md, Task 2.4] — deferred, pre-existing: `parse()` is all-or-nothing (`list[CanonicalLine]` or raise), confirmed in `api/application/bank_adapters.py`; this stale reference predates this story and the 2026-08-17 correct-course pass missed it.
- [x] [Review][Defer] `SectionCursor` doesn't distinguish `best_effort` from `must_parse` behavior [api/domain/statement_layout.py:75-84] — deferred, pre-existing: only `ignore` is special-cased in `classify_data_row()`, so this story's "clean" `voluntary_service` (best_effort) fixture row doesn't exercise any policy-specific code path. Domain code untouched by this diff (Story 4.4).
- [x] [Review][Defer] `LINE_TYPE_CREDIT_NOTE` still has no section mapping, still carried forward [api/adapters/bank/bac_credit/adapter.py:56-69] — deferred, pre-existing: Story 4.4's own review explicitly tracked this gap "for Story 4.5," but this story's section map (per Task 2.2's "do not diverge") has no credit-note section either, so the BAC acceptance-bar fixture still doesn't exercise a `credit_note`-typed row. Unreachable via the current section map — carrying forward again, not resolved here.

Dismissed as noise (2): `sprint-change-proposal-2026-08-17.md` self-declaring `status: approved` in its own frontmatter (process/governance, not code); `sprint-status.yaml`'s cosmetic one-second `last_updated` bump.
