---
date: '2026-08-25'
user_name: Sebas
project_name: finance-helper
trigger: Epic 4 completion — row-level review rework made Epic 5's quarantine model redundant
mode: incremental
scope_classification: minor
status: approved
---

# Sprint Change Proposal — 2026-08-25

## 1. Issue Summary

Epic 4 shipped with a substantial rework partway through (Stories 4.9–4.16, renumbered from an original 4.9–4.16 draft on 2026-08-20 and amended again 2026-08-21). The row-level review model — introduced in Story 4.10 — replaced Story 4.8's statement-level individual review with per-transaction routing: each parsed row is independently assigned, deleted, or undone before a Save-gated `ImportReviewSheet` finalizes the session (Story 4.13.1).

Epic 5 ("Import resilience") was planned before this rework, against the *old* statement-level model. Its early stories (5.1–5.4) assume a statement can be **partially committed**: successfully-parsed rows import while unparsed rows are stored as a durable "quarantine" on the Statement, to be hand-fixed later against the rendered PDF (FR-26, FR-27), with balance disclosure (FR-43) wired off that quarantine state.

Now that Epic 4 is complete, the trigger is: **quarantine is redundant**. Rows that parse already resolve independently through the row-level pipeline before Save — there is no "partial statement" state left for quarantine to hold. Confirmed with the user: only whole-statement parse failures remain a distinct case, and the only action needed for those is **dismiss** (statement or file) — no accept-with-quarantine, no hand-fix UI.

## 2. Impact Analysis

### Epic Impact

- **Epic 4** (trigger epic): already shipped as-built; nothing reopened.
- **Epic 5** (only remaining planned epic): stories 5.2–5.4 required rework; 5.5–5.10 required renumbering and light AC alignment to Story 4.10's batch-grain change; no other epic is affected, no new epic is needed.

### Story Impact (Epic 5, backlog — nothing started)

| Old | New | Change |
|---|---|---|
| 5.1 Parse failure → comparison | 5.1 (unchanged) | Minor: drop forward-reference to quarantine, now references dismiss only |
| 5.2 Accept with quarantine or dismiss | 5.2 Dismiss failed statement or file | Full rewrite — quarantine branch removed |
| 5.3 Hand-edit unresolved rows against PDF | — | **Cut.** No unresolved-row bucket exists to hand-fix |
| 5.4 Wire incomplete-balance disclosure | 5.7 | Moved later in sequence + retriggered off same-price conflicts only (was: quarantine or same-price conflicts) |
| 5.5 Reassign statement to another list | 5.3 | Renumbered; AC updated for Story 4.10 batch grain (statement may now span multiple batches); quarantine-specific Given block dropped |
| 5.6 Roll back an import batch | 5.4 | Renumbered; AC updated for Story 4.10 batch grain (one batch = one commit action); quarantine-specific Given block dropped |
| 5.7 Same-price conflict review | 5.5 | Renumbered; internal story references updated |
| 5.8 Alias + hand-fixed re-upload conflict | 5.6 | Renumbered; "hand-fixed" reworded to "manual entry" (was FR-27-specific language) |
| 5.9 Settle-up simplify | 5.8 | Renumbered; dropped an unreachable "incomplete from quarantine only" branch; internal reference updated |
| 5.10 Statement-cycle period selector | 5.9 | Renumbered only |

### Artifact Conflicts

- **PRD (`prd.md`):** FR-26 reworded (dismiss-only); FR-27 removed from v1 (superseded, amendment note retained); FR-28 reworded ("hand-fixed row" → "previously-resolved manual entry"); FR-43 reworded (trigger source: same-price conflicts only); NFR-6 reworded to match FR-43. All edits follow the existing amendment convention (strikethrough/superseded text retained, not deleted) — see `prd.md` FR-26/27/28/43 and NFR-6.
- **Architecture (`ARCHITECTURE-SPINE.md`):** AD-3 amended (drop "no unresolved quarantine" as a PDF-delete condition; dismissal now releases the PDF immediately); AD-4 amended (internal story reference 5.6 → 5.4); AD-17 retired (quarantine ownership decision no longer applies); the capability reference table's "Quarantine + incomplete disclosure | AD-17" row updated to "Incomplete disclosure (same-price conflicts) | AD-10".
- **UX (DESIGN.md / EXPERIENCE.md):** Not directly edited in this pass — UX-DR12 (parse comparison actions) and UX-DR8 (incomplete disclosure) both already read compatibly with dismiss-only / same-price-only wording; flagged for the UX spine owner to confirm no quarantine-specific mockup language survives when Stories 5.1/5.2/5.7 are actually implemented.
- **`project-context.md`:** contains "Quarantine durable on Statement..." and AD-3's old retain-until-resolved clause under its "Always" rules. Not edited in this pass (it's a generated dev-facing digest, not a planning artifact) — flagged for update at dev-story time for Stories 5.1–5.2 and 5.7, or via a `bmad-generate-project-context` refresh.
- **`sprint-status.yaml`:** Epic 5 block rewritten to the new 9-story list, all `backlog` — no story files existed yet for Epic 5, so no file renames were needed (unlike Epic 4's mid-flight renumber, which required renaming `4-*.md` implementation-artifact files).

### MVP Impact

None. This is a simplification, not a scope cut — no user-facing capability is lost. "Hand-fix a quarantined row" is replaced by "dismiss and re-upload, or use manual expense entry (FR-21) if you want to capture it by hand." The MVP demo gates (J3 + J7) are unaffected; only their story numbers shifted.

## 3. Recommended Approach

**Option 1: Direct Adjustment** — selected and applied.

- Effort: **Low** (documentation/planning-artifact edits only; zero implementation code exists for Epic 5).
- Risk: **Low** (nothing built, nothing to roll back; Epic 4's shipped code is untouched).
- Rollback (Option 2) was not applicable — there is no Epic 5 code to revert.
- MVP review (Option 3) was not needed — scope and demo gates hold.

## 4. Detailed Change Proposals

All edits below were applied directly (incremental mode, approved by user turn-by-turn during this session):

1. **`epics.md`** — Epic 5 header note + "Scope change (2026-08-25)" annotation; Story 5.1 minor edit; Story 5.2 full rewrite (dismiss-only); old Story 5.3 cut; Stories 5.5–5.10 renumbered to 5.3–5.9 with AC updates (batch-grain alignment for reassign/rollback, internal reference fixes, quarantine-only branch removed from simplify); old Story 5.4 moved to new position 5.7 and rewritten to trigger off same-price conflicts only; embedded FR-26/27/28/43 text and FR Coverage Map rows updated to match.
2. **`prd.md`** — FR-26, FR-27 (removed), FR-28, FR-43, NFR-6 amended with superseded-text-retained convention.
3. **`ARCHITECTURE-SPINE.md`** — AD-3 amended, AD-4 amended (reference fix), AD-17 retired, capability table row updated.
4. **`sprint-status.yaml`** — Epic 5 story-key block rewritten to the new 9-story sequence.

## 5. Implementation Handoff

**Scope classification: Minor.** This was a planning-artifact-only correction with no implementation code affected — no rollback, no in-flight story to reconcile. All edits have already been applied directly during this Correct Course session.

**Deliverables:**
- This Sprint Change Proposal (source of record for the rationale).
- Updated `epics.md`, `prd.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml` (already written).

**Next steps / follow-ups (not blocking):**
- When Stories 5.1, 5.2, or 5.7 are picked up for `dev-story`, refresh `project-context.md`'s quarantine-referencing "Always" rules and AD-3 clause to match.
- Confirm with the UX spine owner (`DESIGN.md`/`EXPERIENCE.md`) that no quarantine-specific mockup/copy survives before Story 5.1/5.2 UI work starts.
- `prd.md`'s remaining narrative "Consequences"/journey prose (outside the FR/NFR list itself — e.g. lines describing J3/J7 flows) still contains scene-setting quarantine language in a few places; the authoritative FR-26/27/28/43, NFR-6, the "Parse failure and correction" section header/description, and the executive-summary bullet were all reworded in this pass, but a full prose sweep was out of scope here. Low priority — reword opportunistically or in a follow-up pass before Epic 5 story creation.
- Completed Epic 1–4 story bodies (e.g. Stories 4.6, 4.12, 3.6) still reference "unresolved quarantine" in forward-looking AC text. Left untouched deliberately, matching this project's existing convention of not retroactively editing `done` story files (see epics.md's 2026-08-20 renumbering note: "completed story files... were deliberately left as written").
- No PM/Architect escalation needed — proceed straight to `create-story` for Story 5.1 whenever Epic 5 work begins.

## 6. Success Criteria

- Epic 5's story sequence (5.1–5.9) is internally consistent — no dangling references to old numbering or to quarantine/hand-fix.
- PRD, architecture, and sprint-status reflect the same reworked model with no contradicting artifact.
- A future `create-story` or `dev-story` run against Epic 5 finds a coherent, unambiguous spec with no leftover quarantine assumptions.
