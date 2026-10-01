---
date: 2026-09-23
trigger: Sebas's real-world test of Story 4.9.2 (real Promerica credit-card adapter) against the actual `PROMERICA_CRED.pdf` statement, after commit 05cd0a0
scope: Direct Adjustment (Option 1)
---

# Sprint Change Proposal: Promerica real-statement parse failure (2026-09-23)

## 1. Issue Summary

Story 4.9.2 (real Promerica credit-card adapter) and Story 5.2.1 (manually enter a failed statement) are both marked `done`. Testing Story 4.9.2 against the actual real Promerica PDF (not the synthetic fixture) surfaced two distinct defects:

**Defect A — parser stops after the payment section.** Only the 3 "Detalle de pagos del periodo" rows (PAGO SINPE) are extracted. "Detalle de compras del periodo" is never parsed — not even its first real row, `PARQUEOS REAL CARIARI BELEN` (the same example row documented as real evidence in the story's own AC #2 / dev notes). Nothing gets committed to any list; the statement lands in parse-failure/quarantine after only 3 rows, consistent with `parse()`'s fail-loud path (`fail_parse`) firing on the transition into the compras section. The synthetic golden fixture and its regression tests did not catch this — the commit `05cd0a0` ("recognize every section's column sub-header lines") fixed a related but evidently incomplete gap.

**Defect B — manual-entry pre-fill uses the wrong row.** On the parse-failure comparison surface (FR-55 / Story 5.2.1), "add manually" opens pre-filled with the *first extracted* row (PAGO SINPE) instead of the *first row that actually failed to parse* (PARQUEOS REAL CARIARI BELEN) — the one the user actually needs to hand-enter.

Both are real defects in already-`done` stories, discovered via real data the synthetic fixtures don't fully replicate (per this project's own two-tier fixture convention — synthetic PDFs gate CI; operator-real PDFs are diagnostic-only, gitignored, never committed). No real PDF or its extracted text was available in this session to pin the exact root cause in `_SECTIONS`/`_KNOWN_BOILERPLATE_LINES` matching — diagnosis against the real PDF is deferred to implementation, per Sebas's choice.

## 2. Impact Analysis

### Epic Impact

None. Epic 4 (bank adapters) and Epic 5 (parse-failure handling) are unaffected in scope or sequencing — both defects are corrections to already-implemented, already-`done` stories, not a redefinition of either epic.

### Story Impact

- New story **4.9.3 — Fix Promerica real-statement parse failure and manual-entry pre-fill row**, added after 5.2.1 in sequence (touches code from both 4.9.2 and 5.2.1; kept as one story per Sebas's direction rather than split, since both were found together in the same real-statement test pass).
- No other stories change. 4.9.2 and 5.2.1 stay `done` — this is a bugfix story, not a reopen.

### Artifact Conflicts

- **PRD:** none. No new/changed FR — both are implementation defects against existing FR-36 (Promerica real parsing) and FR-55 (parse-failure manual entry), not new behavior.
- **Architecture:** none. No new AD; the fix stays inside `PromericaAdapter.parse()`'s existing section-boundary/boilerplate-recognition logic and `ParseComparisonPanel`/manual-entry pre-fill's existing row-selection logic.
- **UI/UX:** none. No layout or interaction pattern changes — Defect B is a data-selection bug (wrong row picked), not a UX redesign.

### Technical Impact

- `api/adapters/bank/promerica/adapter.py`: `_SECTIONS`, `_KNOWN_BOILERPLATE_LINES`, and/or the section-header/boilerplate-recognition logic in `parse()` need correction against fresh real extracted text for the "Detalle de compras del periodo" transition — root cause not yet pinned (no real PDF text available this session).
- Synthetic fixture / goldens (`api/tests/fixtures/pdf/promerica_synthetic.pdf`, `promerica_synthetic_goldens.py`) likely need a regression case that reproduces this exact transition, so it's covered by CI going forward (this project's synthetic-fixture-gates-release convention).
- Manual-entry pre-fill (`ParseComparisonPanel.tsx` / wherever `parse_evidence` row selection lives for Story 5.2.1's inline form) needs to select the first **failed** row, not the first **extracted** row.

## 3. Recommended Approach

**Direct Adjustment (Option 1).** Both defects are contained bug fixes against existing, working code — not a rollback candidate (the underlying architecture and both stories' core approach are sound) and not a PRD/MVP scope conflict.

- Effort: **Low-Medium** — Defect B is a small, well-scoped fix. Defect A's exact root cause is unknown without the real PDF's extracted text, so its effort depends on what's found once the developer re-extracts real text for the compras-section transition.
- Risk: **Low** — both are isolated to existing adapter/UI code with existing test suites to regress against.

## 4. Detailed Change Proposals

### Epics (`epics.md`)

**Added Story 4.9.3** (after Story 5.2.1, in Epic 4's sequence) — see `epics.md` for full text. Summary:

| Defect | Fix scope |
|---|---|
| A — compras section never parses against the real PDF | Developer re-extracts real text for the payment→compras transition from `bank_data/PROMERICA_CRED.pdf` (local, gitignored, not shared this session) and corrects `_SECTIONS`/boilerplate recognition in `PromericaAdapter.parse()` accordingly; adds a synthetic regression fixture/golden reproducing the fixed transition |
| B — manual-entry pre-fill picks the wrong row | Fix the parse-failure comparison surface's pre-fill row selection to use the first row from `parse_evidence` that actually failed, not the first row that was successfully extracted |

### Sprint tracking (`sprint-status.yaml`)

Added `4-9-3-fix-promerica-real-statement-parse-failure: ready-for-dev` under Epic 4, after `5-2-1-manually-enter-a-failed-statement`.

## 5. Implementation Handoff

**Scope classification: Minor.** Direct implementation by the Developer agent — no PO/DEV backlog reorg, no PM/Architect replan.

- **Next step:** create the dev-ready story file (`_bmad-output/implementation-artifacts/4-9-3-fix-promerica-real-statement-parse-failure.md`) via the normal `create-story` flow. Before touching `PromericaAdapter.parse()`, the developer must re-extract real text around the payment→compras transition from `bank_data/PROMERICA_CRED.pdf` (per this project's real-evidence-only convention — no invented section/boilerplate text) to pin Defect A's actual root cause.
- **Success criteria:** the real PDF's compras section (and everything after it) parses without a fail-loud stop; manual-entry pre-fill on the parse-failure surface opens on the first genuinely-failed row; existing `test_promerica_adapter.py` and Story 5.2.1's test suites stay green; new regression coverage added for both defects.
