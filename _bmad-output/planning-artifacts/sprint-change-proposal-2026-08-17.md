---
date: 2026-08-17
trigger_story: 4-4-adapter-contract-canonicalline-bac-normalize
status: approved
scope: minor
---

# Sprint Change Proposal — 2026-08-17

## 1. Issue Summary

Story 4.4 (`4-4-adapter-contract-canonicalline-bac-normalize`) is `done` and merged. Stories 4.5, 4.6, and 4.7 were all drafted before (or, in 4.5's case, partially in parallel with) 4.4's real implementation, using best-guess file names, method names, and port shapes. 4.4's actual delivered code — including a code-review pass that added new architecture decisions AD-25/26/27 — diverges from those guesses in ways ranging from cosmetic (renames) to structural (a port that was never built).

This surfaced when `dev-story` was invoked on Story 4.5: its "Hard Prerequisite" section named files (`api/domain/canonical.py`, `api/adapters/bank/bac_credit.py`, `api/application/import_pipeline.py`, `run_detection`) that don't exist under those names in the real, merged 4.4 code. A full validation pass across 4.5, 4.6, and 4.7 followed.

**Category:** Technical limitation discovered during implementation — sequential dependent stories drafted ahead of a prerequisite's real output. Not a stakeholder-driven requirement change, not a strategic pivot.

**Evidence:**
- Real file tree (`api/domain/canonical_line.py`, `api/application/bank_adapters.py`, `api/adapters/bank/bac_credit/adapter.py`) vs. names referenced in 4.5/4.6/4.7.
- 4.4's Dev Agent Record / File List / Review Findings (story file, lines 189–269).
- `ARCHITECTURE-SPINE.md` AD-25/26/27, marked `[ADOPTED]` during 4.4's 2026-08-17 code-review pass.
- Commit `dd12ecd` (TODO note) → `docs/bank-statement-parsing-agent-setup.md`, describing a new agent-assisted, real-data design-session process for future bank adapters.
- `api/tests/fixtures/pdf/bac_credit_synthetic.pdf` + `bac_credit_synthetic_goldens.py` already committed by 4.4 — a direct filename collision with what 4.5's Task 2.3 originally specified.
- `api/adapters/bank/__init__.py` contains no `ADAPTERS` list (4.4 deliberately scoped out building a caller/registry) — contradicts 4.5 Task 3.5's "append to `ADAPTERS`" assumption.

## 2. Impact Analysis

**Epic Impact:** None. Epic 4 (Statement upload & review) is still completable exactly as planned; story sequencing (4.4→4.5→4.6→4.7→4.8→4.9) is unchanged. This is story-file-level drift, not epic-level.

**Story Impact:**
- **4.5** (`ready-for-dev`): naming/method drift throughout Dev Notes and Tasks 1–3, plus three real content gaps — fixture-filename collision with 4.4's own committed proving fixture, a missing `ADAPTERS` registry that Task 3.5 assumed already existed, and no mention of the new AD-25/26/27 shared contract the Promerica stub must now use. Also carries two incorrect cross-references to "Story 4.4 Task 9" / "Task 7.4" (4.4 has only 6 tasks).
- **4.6** (`ready-for-dev`): drafted intentionally ahead of 4.4 as a "head start," with its own guessed `ImportPipeline` port and `NoAdaptersRegisteredPipeline` stub. 4.4 built no multi-adapter orchestrator — only `detect_bank_adapter()` (picks one adapter) plus that adapter's own `.split()`/`.parse()`. The composition 4.6's port promises (loop over adapters, split, parse each chunk, wrap per-chunk failures) doesn't exist and needs designing. This is a structural redraft, not a rename.
- **4.7** (`ready-for-dev`): already explicitly gated (its own "Prerequisites gap" section) on 4.4+4.5+4.6 all being `done` before re-verification. Since 4.6 needs a redraft first, 4.7 cannot be meaningfully re-verified yet.

**Artifact Conflicts:**
- PRD: none — FR-31–36's abstract language (`{bank, product_id, account_kind}`) doesn't mandate 4.5/4.6's guessed property/type names; 4.4's actual naming choices are a legitimate implementation, not a PRD violation.
- Architecture: none needed in the spine itself — AD-25/26/27 are already correctly `[ADOPTED]`. The gap was that 4.5/4.6's story text didn't reference them.
- UX: none — this drift is entirely backend/adapter-layer.
- Other: `sprint-status.yaml` needs no structural change (no epics/stories added, removed, or reordered).

## 3. Recommended Approach

**Selected: Option 1 (Direct Adjustment), hybrid scope.**

- Fully reconcile Story 4.5's Dev Notes and Tasks against 4.4's real code now, so `dev-story` can run on 4.5 immediately after this proposal.
- Add a short pointer note to 4.6 and 4.7 (not a full redraft) referencing this proposal, so a future reader/agent knows validation happened and what's still open — 4.6's actual port redesign is deferred to when it's next picked up, consistent with its own "re-validate before starting" instruction.
- No PRD/epic/MVP change (Option 3 not viable — nothing about scope changed) and no rollback (Option 2 not viable — 4.4 is correct and done, nothing to revert).

**Rationale:** Effort is low (documentation-stage correction; no code has been written against the wrong assumptions yet) and risk is low (nothing to undo). Redrafting 4.6 fully right now would be premature — it isn't the next story being picked up, and its real design work deserves its own focused pass rather than being rushed inside this proposal.

**Also decided during this pass:** the Promerica stub in Story 4.5 (Task 3) stays trivial/synthetic as originally scoped. A *real* Promerica adapter — built via the agent-assisted, real-data design-session process described in `docs/bank-statement-parsing-agent-setup.md` — is confirmed out of scope for 4.5 and deferred to a future story, gated on real Promerica statement samples existing (per PRD) and Promerica support being prioritized. Separately, Story 4.5's Task 2 (BAC acceptance-bar fixture) gained a new validation step: running `api/scripts/statement_recon.py` against a real BAC statement in local `bank_data/` before authoring the fixture's content, to sanity-check the sign convention and section layout the fixture is about to encode as CI ground truth — this directly closes an item 4.4's own Review Findings deferred to this story.

## 4. Detailed Change Proposals

All changes below were applied directly to the story files (Direct Adjustment, minor scope).

### Story 4.5 — six proposals, all approved and applied

1. **Hard Prerequisite + Scope Note** — replaced placeholder file/method names (`canonical.py`→`canonical_line.py`, `import_pipeline.py`/`run_detection`→`bank_adapters.py`/`detect_bank_adapter`, `bac_credit.py`→`bac_credit/adapter.py`, `.parse_statement()`/`StatementSlice`→`.parse()`/`list[bytes]`, `bank`→`bank_id`); corrected "4.4 Task 9" → "4.4 Task 5"; clarified 4.4's fixture is already committed (not throwaway).
2. **Task 1.1** — verification list updated to real module/function names; added AD-25/26/27 modules to the prerequisite check.
3. **Task 2 (2.1, 2.3, 2.5)** — resolved the now-moot PDF-generation-library approval gate (reuse `fpdf2`/`generate_bac_fixture.py`); flagged the fixture-filename collision with 4.4's committed fixture and required a distinct name; fixed method names in the acceptance test description.
4. **Task 3 (3.1, 3.3, 3.4, 3.5, 3.6)** — fixed `bank_id` naming, `.parse()`/`list[bytes]` shapes; added the AD-25/26/27 requirement to `split()`/`parse()`; corrected the false assumption that `ADAPTERS` already exists (must be created fresh, registering both `BacCreditAdapter` and `PromericaStubAdapter`); fixed `detect_bank_adapter()` references.
5. **New Dev Notes subsection "AD-25/26/27 — shared section/date/boundary contract"** — documents the two new ADs and records the "real Promerica adapter is future work" decision; also fixed stale references in the adjacent "entirely additive" paragraph.
6. **References section** — added AD-25/26/27, `docs/bank-statement-parsing-agent-setup.md`, and this proposal document as sources.

Also folded in during the session (not originally numbered as separate proposals, added per explicit user request):
- **Task 2.1a (new)** — run `statement_recon.py` against real local BAC data to validate the sign convention and section layout before authoring the fixture, without deriving the fixture from real data (NFR-2 preserved).
- **Task 3.7** — added a note confirming the real Promerica adapter is deferred future work, not triggered by finishing the stub.
- **Task 2.2** — fixed "Story 4.4 Task 7.4" (nonexistent) → correct reference to 4.4's Dev Notes "BAC credit baseline section map."

### Story 4.6 — pointer note only

Added a note before the Scope Note section: 4.4 is done, but 4.6's `ImportPipeline` port doesn't match what 4.4 actually built and needs a real redraft (not a rename) before `dev-story` runs on it. Points to this proposal for the full analysis.

### Story 4.7 — pointer note only

Added a note before "Prerequisites gap": 4.6 needs its redraft first; 4.7's own Task 0 gate (4.4+4.5+4.6 all `done`) isn't met yet. Points to this proposal.

## 5. Implementation Handoff

**Scope classification: Minor.**

- **Story 4.5:** ready for `dev-story` now — hand off to the Developer agent (Amelia) directly. No further PM/Architect involvement needed; all corrections are already applied to the story file.
- **Story 4.6:** not ready for `dev-story`. Needs a real redraft (Task 2's port design) once picked up — recommend running `create-story` again or a manual Dev Notes rewrite at that time, per the story's own instruction and this proposal's Section 3.
- **Story 4.7:** untouched beyond the pointer note. Revisit only after 4.6 is `done` for real, per its own Task 0 gate.
- **Real Promerica adapter (future, unscheduled):** when real Promerica statement samples exist and Promerica support is prioritized, run the process in `docs/bank-statement-parsing-agent-setup.md` (architect design session → tech-writer playbook → per-bank brainstorm loop) before implementing, then create it as its own story via `bmad-create-story`.

**Success criteria:** `dev-story` on Story 4.5 runs without hitting missing-file/wrong-name HALTs; the release-gate fixture lands under a filename distinct from 4.4's; the Promerica stub uses `SectionSpec`/`parse_statement_date`/`detect_statement_boundaries` rather than reimplementing them.
