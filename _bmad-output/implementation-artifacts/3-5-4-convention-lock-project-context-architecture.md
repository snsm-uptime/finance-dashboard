---
baseline_commit: 8edcd12cf7c12d2c29d638d0de04abe071d27f41
---

# Story 3.5.4: Convention lock — project-context + architecture stack

**Status:** done

## Story

As a maintainer,
I want agent/project rules to mandate Tailwind-first + SCSS-custom,
So that Epic 4+ stories do not reintroduce CSS Modules.

## Acceptance Criteria

1. **Given** `ARCHITECTURE-SPINE.md` (Stack table)
   **When** reviewed/updated
   **Then** the stack table lists Tailwind CSS v4 + Sass for `ui`

2. **Given** `ARCHITECTURE-SPINE.md` (AD list)
   **When** reviewed/updated
   **Then** AD-23 documents the styling delivery convention (Tailwind-first, SCSS-custom-only, forbidden list)

3. **Given** `project-context.md`
   **When** reviewed/updated
   **Then** its UI rules explicitly forbid new CSS Modules and kit/template themes

4. **Given** `epics.md` (Epic 4 section)
   **When** reviewed/updated
   **Then** Epic 4's story prep notes reference Epic 3.5 (demo gate) as a prerequisite

## Tasks / Subtasks

- [x] Task 1: Verify AC #1 — stack table (AC: #1)
  - [x] Open `ARCHITECTURE-SPINE.md`, confirm the `## Stack` table (header ~line 242, rows ~260-261) has rows: `Tailwind CSS (\`ui\`) | 4.x (...)` and `Sass (\`ui\`) | 1.x (...)`
  - [x] Confirm no conflicting/duplicate stack entries elsewhere in the doc
- [x] Task 2: Verify AC #2 — AD-23 completeness (AC: #2)
  - [x] Confirm AD-23 (~line 213) states: Binds / Prevents / Rule / Forbidden list, and references AD-12 (look ownership) correctly
  - [x] Confirm the `Consistency Conventions` table (~line 235) has a `UI styling` row pointing to AD-23
- [x] Task 3: Verify AC #3 — project-context.md UI rules (AC: #3)
  - [x] Confirm `project-context.md` TypeScript/React section has the "no new `*.module.css`" rule and the post-Epic-3.5 "do not reintroduce CSS Modules" rule
  - [x] Confirm the "UI footguns" section bans kit default/purple theme and pill primary CTAs
  - [x] Confirm the "Source of truth order" section is unambiguous about spine/project-context winning over README/mocks
- [x] Task 4: Verify AC #4 — Epic 4 prerequisite note (AC: #4)
  - [x] Confirm `epics.md` under `## Epic 4: Statement upload & review` (both the Epic List summary entry and the full Epic 4 section header) states "Do not start Epic 4 until Epic 3.5 demo gate passes"
- [x] Task 5: Close any gaps found in Tasks 1–4 (AC: all)
  - [x] If any AC is not fully satisfied by current doc text, make the minimal edit needed — do not restructure unrelated sections
  - [x] Do not weaken or duplicate existing AD-23 language; prefer one canonical statement per rule
  - [x] It's fine to state CSS Modules have been removed from `ui/` — Story 3.5.3 merged to `main` and this is now factually true (see Dev Notes)
- [x] Task 6: Story-close overview (required before `done`)
  - [x] Add the 4-section overview (Request path / Key components / Why this shape / What not to break) to Completion Notes per `story-close-overview-checklist.md`
  - [x] Update File List with every file actually touched (may be empty if Task 5 found no gaps — state that explicitly)

### Review Findings

- [x] [Review][Patch] Completion Notes cite the wrong line for the "kit default/purple theme" ban — says `project-context.md:211`, actual line is `212` [_bmad-output/project-context.md:212]
- [x] [Review][Patch] File List says "None" but the diff modifies two files (this story file, `sprint-status.yaml`) — repo convention (see Stories 1.5.2, 1.5.4) lists bookkeeping files in File List too [_bmad-output/implementation-artifacts/3-5-4-convention-lock-project-context-architecture.md]
- [x] [Review][Patch] Completion Notes assert the branch is synced with `main` (includes commit `fbdadac`) but don't record the verification command/output — add one line documenting the check performed for future auditability [_bmad-output/implementation-artifacts/3-5-4-convention-lock-project-context-architecture.md]
- [x] [Review][Defer] `## Story-close overview` heading breaks the Dev Agent Record outline (sits between two `###` subsections at the same `##` level) — pre-existing pattern, also present in Story 1.5.2; fixing it here would deviate from established repo convention [_bmad-output/implementation-artifacts/3-5-4-convention-lock-project-context-architecture.md:144] — deferred, pre-existing repo-wide pattern
- [x] [Review][Defer] Story 3.5.3's own file has 3 disagreeing status signals (header "review", Completion Status "in-progress", sprint-status.yaml "done") — pre-existing drift in a different story's file, out of scope for 3.5.4's diff [_bmad-output/implementation-artifacts/3-5-3-migrate-lists-auth-account-surfaces.md:7,285] — deferred, belongs to Story 3.5.3, not this diff
- [x] [Review][Defer] Task 5's prior explicit constraint ("do not claim CSS Modules removed") was replaced wholesale rather than marked superseded — this rewrite predates the current dev session (already staged before work began) [_bmad-output/implementation-artifacts/3-5-4-convention-lock-project-context-architecture.md] — deferred, pre-existing edit not authored in this dev pass
- [x] [Review][Defer] AD-23 "enforced end-to-end" claim relies on a file-count proxy (0 `.module.css` / 10 `.module.scss`) without auditing whether the 10 `.module.scss` files are genuinely custom-only — explicitly out of scope for this docs-only story per its own Scope Boundaries [ui/**/*.module.scss] — deferred, out of scope (no `ui/` code review in this story)
- [x] [Review][Defer] Sibling story 3-5-2 remains `review` (not `done`) while 3-5-4 flips to `review`; `epic-3-5-retrospective` still `optional` — epic-level gate bookkeeping, out of scope for 3.5.4 [_bmad-output/implementation-artifacts/sprint-status.yaml] — deferred, epic-level bookkeeping outside this story's scope

## Dev Notes

### This is a verification-first story, not a greenfield-authoring one

All four ACs already appear satisfied in the current docs — they were pre-applied by `sprint-change-proposal-2026-08-10.md` (status: "Applied") ahead of the Epic 3.5 code migration:

- AD-23 already exists at `ARCHITECTURE-SPINE.md:213-217` with Binds/Prevents/Rule/Forbidden.
- Stack table already lists `Tailwind CSS (ui) | 4.x` and `Sass (ui) | 1.x` at `ARCHITECTURE-SPINE.md:260-261`.
- `Consistency Conventions` table already has a `UI styling` row citing AD-23 at `ARCHITECTURE-SPINE.md:235`.
- `project-context.md` already has "no new `*.module.css`" (line 96) and "After Epic 3.5: do not reintroduce CSS Modules; prefer Tailwind; SCSS modules for custom only (AD-23)" (line 213), plus the "UI footguns" ban list (lines 209-213).
- `epics.md` already has "Sequencing note: Do not start Epic 4 until Epic 3.5 demo gate passes" both in the Epic List summary (line 296) and the full Epic 4 section header (line 951).

**Implication for the dev agent:** don't rewrite these sections from scratch. Read each cited location, confirm it literally satisfies its AC, and only edit where there's an actual gap (e.g., wording ambiguity, a missing cross-reference, or drift introduced by later edits). If everything checks out, this story's main deliverable is the verification record in Completion Notes — say so plainly, don't manufacture busywork edits to look productive.

### Current codebase state (verify at start — this changes fast in this epic)

- Story 3.5.3 (`3-5-3-migrate-lists-auth-account-surfaces`) **merged to `main`** (PR #41, commit `fbdadac`) and `sprint-status.yaml` now shows it `done`. Its own story file header still says `Status: review` — that's stale; trust `sprint-status.yaml` as source of truth per this repo's convention.
- As of `main`, **0** `*.module.css` files remain under `ui/` (verified via `find ui -iname "*.module.css"`) — the Epic 3.5 demo gate's "CSS Modules removed from ui/" condition is now factually true in code. 10 `*.module.scss` files exist (custom-styles-only, per AD-23) — that's expected and compliant, not a gap.
- Story 3.5.2 (`3-5-2-migrate-soft-ledger-primitives-tailwind`) is `review` in `sprint-status.yaml`, not yet `done`, even though its code (PR #39, commit `8edcd12`) is already merged to `main` — the formal code-review/close-out step is what's outstanding, not the code itself.
- Re-run `find ui -iname "*.module.css"` yourself before writing anything — don't trust this snapshot blindly if time has passed since this story was drafted.

### Scope boundaries

- **In scope:** `ARCHITECTURE-SPINE.md`, `project-context.md`, `epics.md` (docs only).
- **Out of scope:** any `ui/` code changes — CSS Module migration/removal was Story 3.5.3's job and is already done.
- No new product FRs, no test files, no `ui/` build/lint/typecheck run needed (nothing in `ui/` changes).

### File Structure

- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`
- `_bmad-output/project-context.md`
- `_bmad-output/planning-artifacts/epics.md`

### Project Structure Notes

- No conflicts with unified project structure — this story touches planning/context docs only, not `api/` or `ui/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5.4: Convention lock — project-context + architecture stack] (lines 930-943)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4: Statement upload & review] (lines 292-296, 945-951)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-23 — UI styling delivery] (lines 213-217)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#Consistency Conventions] (line 235)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#Stack] (lines 260-261)
- [Source: _bmad-output/project-context.md#TypeScript / React (ui/)] (lines 86-98)
- [Source: _bmad-output/project-context.md#UI footguns (spines win)] (lines 209-213)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-10.md] — origin of AD-23; confirms these doc changes were "Applied" pre-emptively ahead of the Epic 3.5 code migration
- [Source: _bmad-output/implementation-artifacts/story-close-overview-checklist.md] — required before marking `done`

### Previous Story Intelligence

**Story 3.5.2 (code merged, `review` in sprint-status):** All 9 Soft-Ledger primitives migrated to Tailwind; 9 `.module.css` files deleted; AD-12/AD-23 compliance verified in that story's own completion notes.

**Story 3.5.3 (done, merged):** Migrated the remaining 12 `.module.css` files (lists/auth/account/signup) to Tailwind + `.module.scss` for custom cases. This is what took `ui/` to 0 `.module.css` files. Confirms AD-23 is already being enforced in practice end-to-end, which is consistent with this story finding the doc-side rules already correct.

**Story 3.5.1 (done):** Installed Tailwind v4 + Sass + Warm Balance `@theme` bridge in `ui/app/globals.css`; no `tailwind.config.js` (v4 uses `@import "tailwindcss"` + `@theme`).

### Git Intelligence

- Recent doc-only story commits use `docs(<epic>): <summary>` commit messages (e.g. `docs(1): land membership ACL enforcement sketch for Story 1.5.4`, `docs(1): add invite verify-gate contract for Stories 2.3/2.4`) — follow that convention here, e.g. `docs(3.5): convention lock for project-context + architecture stack`.
- **A worktree/branch for this story already exists** — do not create a new one. Work in `/Users/sebastiansotom/Documents/github/personal/finance-dashboard-wt-3-5-4-convention-architecture` on branch `feat/3-5/3-5-4-convention-lock-project-context-architecture` (matches the `feat/3-5/...` pattern used by 3.5.1–3.5.3, not a `docs/` prefix — the branch was already cut before this story file existed).
- **That branch is stale**: it was cut from commit `8edcd12` (right after 3.5.2 merged), so it does **not** include Story 3.5.3's merge (`fbdadac`). Sync it with `main` (merge or rebase) before starting work, or the "0 `.module.css` files remain" fact above won't hold in that worktree yet.

### Testing Requirements

- None (docs-only change; no `ui/`, `api/`, or test files touched). Do not run `npm test`/`pytest` for this story — there's nothing new to exercise.
- Validation is a manual read-through against the four AC line references above, not automated tests.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via `bmad-dev-story` workflow.

### Debug Log References

None — verification-only story, no code executed or debugged.

### Completion Notes List

**Verification result: all four ACs were already satisfied by the current doc text — no edits were needed.**

- **AC #1 (Stack table):** `ARCHITECTURE-SPINE.md:260-261` lists `Tailwind CSS (\`ui\`) | 4.x (...)` and `Sass (\`ui\`) | 1.x (...)` under `## Stack` (header at line 242). Grepped the whole doc for `Tailwind|Sass|module.css|module.scss` — the only other mentions (line 147 AD-12 addendum, line 217 AD-23 rule, line 235 Consistency Conventions row) are consistent with the stack table, no conflicting/duplicate entries found.
- **AC #2 (AD-23 completeness):** `ARCHITECTURE-SPINE.md:213-218` — AD-23 has Binds/Prevents/Rule/Forbidden and correctly cross-references AD-12 ("Warm Balance / Soft-Ledger tokens remain authoritative... (AD-12 still binds look)"). `Consistency Conventions` table has a `UI styling` row at line 235 pointing to AD-23.
- **AC #3 (project-context.md UI rules):** TypeScript/React section (line 96) states "no new `*.module.css`"; UI footguns section (line 213) states "After Epic 3.5: do not reintroduce CSS Modules; prefer Tailwind; SCSS modules for custom only (AD-23)" and (line 212) bans "kit default/purple theme · pill primary CTAs". Source of truth order section (lines 265-270) unambiguously ranks `ARCHITECTURE-SPINE.md` + `project-context.md` above `prd.md`/`epics.md` and README/research notes.
- **AC #4 (Epic 4 prerequisite note):** `epics.md` has "Do not start Epic 4 until Epic 3.5 demo gate passes" both in the Epic List summary (line 296) and the full Epic 4 section header (line 951). Story 3.5.4's own AC block (lines 936-943) also states this.
- Re-verified the codebase-state fact from Dev Notes at start of this session: `find ui -iname "*.module.css"` → 0 results; `find ui -iname "*.module.scss"` → 10 results. Matches Dev Notes exactly.
- Verified branch sync before trusting that codebase-state fact: `git status` showed "up to date with 'origin/main'" and `git log --oneline -5` showed commit `fbdadac` (Story 3.5.3's PR #41 merge) already in this branch's history — so the worktree was not the stale `8edcd12`-cut branch the Dev Notes warned about.
- No doc edits were made (Task 5 found no gaps to close).

## Story-close overview — 3-5-4-convention-lock-project-context-architecture

**Request path:**
N/A — this is a docs-only convention-lock story; no runtime request path is touched. (Verified planning docs read by humans/agents, not served by `ui`/`api`.)

**Key components:**
`ARCHITECTURE-SPINE.md` (Stack table, AD-23, Consistency Conventions), `_bmad-output/project-context.md` (TypeScript/React rules, UI footguns, Source of truth order), `_bmad-output/planning-artifacts/epics.md` (Epic 3.5 / Epic 4 sequencing notes, Story 3.5.4 AC block). All read-verified; none edited.

**Why this shape:**
`sprint-change-proposal-2026-08-10.md` pre-applied AD-23 and the related doc language ahead of the Epic 3.5 code migration (Stories 3.5.1–3.5.3), so this story's job was to confirm the written rules still hold post-merge rather than author them fresh (per this story's own Dev Notes).

**What not to break:**
- Do not add a second/competing stack table entry for Tailwind/Sass elsewhere in `ARCHITECTURE-SPINE.md`.
- Do not weaken AD-23's "Forbidden: new `*.module.css`" language or its AD-12 cross-reference.
- Keep `project-context.md`'s "Source of truth order" (spine + project-context > SPEC/DESIGN/EXPERIENCE > PRD/epics > README/mocks) intact — later stories rely on this ranking to resolve doc conflicts.
- Keep the "Do not start Epic 4 until Epic 3.5 demo gate passes" sequencing note in both `epics.md` locations (Epic List summary line 296 and Epic 4 section header line 951) in sync if either is ever edited.

### File List

No target docs required edits (Tasks 1-4 found all four ACs already satisfied; Task 5 confirmed no gaps to close). Files touched by this story's own bookkeeping:

- `_bmad-output/implementation-artifacts/3-5-4-convention-lock-project-context-architecture.md` (UPDATE — status/tasks/record/review)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — story → review)

## Change Log

- 2026-08-12: Story implemented via `bmad-dev-story` — verified all four ACs against `ARCHITECTURE-SPINE.md`, `project-context.md`, and `epics.md`; all already satisfied (pre-applied by `sprint-change-proposal-2026-08-10.md`); no doc edits needed; status → review
- 2026-08-12: Code review (3-layer: Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 3 low-severity patches applied (line-citation fix, File List correction, added branch-sync verification note); 5 low-severity items deferred (pre-existing/out-of-scope, logged in `deferred-work.md`); 7 dismissed as noise; status → done
