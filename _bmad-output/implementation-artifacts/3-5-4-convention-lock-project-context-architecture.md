---
baseline_commit: 8edcd12cf7c12d2c29d638d0de04abe071d27f41
---

# Story 3.5.4: Convention lock — project-context + architecture stack

**Status:** ready-for-dev

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

- [ ] Task 1: Verify AC #1 — stack table (AC: #1)
  - [ ] Open `ARCHITECTURE-SPINE.md`, confirm the `## Stack` table (~line 260) has rows: `Tailwind CSS (\`ui\`) | 4.x (...)` and `Sass (\`ui\`) | 1.x (...)`
  - [ ] Confirm no conflicting/duplicate stack entries elsewhere in the doc
- [ ] Task 2: Verify AC #2 — AD-23 completeness (AC: #2)
  - [ ] Confirm AD-23 (~line 213) states: Binds / Prevents / Rule / Forbidden list, and references AD-12 (look ownership) correctly
  - [ ] Confirm the `Consistency Conventions` table (~line 235) has a `UI styling` row pointing to AD-23
- [ ] Task 3: Verify AC #3 — project-context.md UI rules (AC: #3)
  - [ ] Confirm `project-context.md` TypeScript/React section has the "no new `*.module.css`" rule and the post-Epic-3.5 "do not reintroduce CSS Modules" rule
  - [ ] Confirm the "UI footguns" section bans kit default/purple theme and pill primary CTAs
  - [ ] Confirm the "Source of truth order" section is unambiguous about spine/project-context winning over README/mocks
- [ ] Task 4: Verify AC #4 — Epic 4 prerequisite note (AC: #4)
  - [ ] Confirm `epics.md` under `## Epic 4: Statement upload & review` (both the Epic List summary entry and the full Epic 4 section header) states "Do not start Epic 4 until Epic 3.5 demo gate passes"
- [ ] Task 5: Close any gaps found in Tasks 1–4 (AC: all)
  - [ ] If any AC is not fully satisfied by current doc text, make the minimal edit needed — do not restructure unrelated sections
  - [ ] Do not weaken or duplicate existing AD-23 language; prefer one canonical statement per rule
  - [ ] Do not claim CSS Modules are already removed from `ui/` anywhere in these docs — Story 3.5.3 has not landed yet (see Dev Notes)
- [ ] Task 6: Story-close overview (required before `done`)
  - [ ] Add the 4-section overview (Request path / Key components / Why this shape / What not to break) to Completion Notes per `story-close-overview-checklist.md`
  - [ ] Update File List with every file actually touched (may be empty if Task 5 found no gaps — state that explicitly)

## Dev Notes

### This is a verification-first story, not a greenfield-authoring one

All four ACs already appear satisfied in the current docs — they were pre-applied by `sprint-change-proposal-2026-08-10.md` (status: "Applied") ahead of the Epic 3.5 code migration:

- AD-23 already exists at `ARCHITECTURE-SPINE.md:213-217` with Binds/Prevents/Rule/Forbidden.
- Stack table already lists `Tailwind CSS (ui) | 4.x` and `Sass (ui) | 1.x` at `ARCHITECTURE-SPINE.md:260-261`.
- `Consistency Conventions` table already has a `UI styling` row citing AD-23 at `ARCHITECTURE-SPINE.md:235`.
- `project-context.md` already has "no new `*.module.css`" (line 96) and "After Epic 3.5: do not reintroduce CSS Modules; prefer Tailwind; SCSS modules for custom only (AD-23)" (line 213), plus the "UI footguns" ban list (lines 209-213).
- `epics.md` already has "Sequencing note: Do not start Epic 4 until Epic 3.5 demo gate passes" both in the Epic List summary (line 296) and the full Epic 4 section header (line 951).

**Implication for the dev agent:** don't rewrite these sections from scratch. Read each cited location, confirm it literally satisfies its AC, and only edit where there's an actual gap (e.g., wording ambiguity, a missing cross-reference, or drift introduced by later edits). If everything checks out, this story's main deliverable is the verification record in Completion Notes — say so plainly, don't manufacture busywork edits to look productive.

### Known open item: don't accidentally assert Epic 3.5 is complete

- Story 3.5.3 (`3-5-3-migrate-lists-auth-account-surfaces`) is still `backlog` in `sprint-status.yaml` — no story file exists for it yet.
- 12 `*.module.css` files still exist under `ui/` (`ui/app/page.module.css`, `ui/components/AccountNavLink.module.css`, `ui/components/AccountMenu.module.css`, `ui/app/lists/ListDetailMobileActions.module.css`, `ui/app/lists/lists.module.css`, `ui/app/lists/ManualExpenseForm.module.css`, `ui/app/lists/TemporalNavigation.module.css`, `ui/app/lists/PercentageSplitTrack.module.css`, `ui/app/lists/Sheet.module.css`, `ui/app/signup/signup.module.css`, `ui/components/FormIconSubmit/FormIconSubmit.module.css`, `ui/components/IconButton/IconButton.module.css`).
- This story's ACs are about the **written rules**, not the current codebase state, so they don't require 3.5.3 to be done first. But when touching any doc text, do not phrase it as if CSS Modules have already been removed from `ui/` — that claim belongs to the Epic 3.5 demo gate (which is not yet met) and to Story 3.5.3's own completion notes, not this story's.
- Story 3.5.2 (`3-5-2-migrate-soft-ledger-primitives-tailwind`) is `review`, not yet `done`.

### Scope boundaries

- **In scope:** `ARCHITECTURE-SPINE.md`, `project-context.md`, `epics.md` (docs only).
- **Out of scope:** any `ui/` code changes, any `.module.css` migration/removal — that's Story 3.5.3's job.
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

**Story 3.5.2 (review, not yet done):** All 9 Soft-Ledger primitives migrated to Tailwind; 9 `.module.css` files deleted; AD-12/AD-23 compliance verified in that story's own completion notes. Confirms AD-23 is already being enforced in practice, which is consistent with this story finding the doc-side rules already correct.

**Story 3.5.1 (done):** Installed Tailwind v4 + Sass + Warm Balance `@theme` bridge in `ui/app/globals.css`; no `tailwind.config.js` (v4 uses `@import "tailwindcss"` + `@theme`).

### Git Intelligence

- Recent doc-only story commits use `docs(<epic>): <summary>` commit messages (e.g. `docs(1): land membership ACL enforcement sketch for Story 1.5.4`, `docs(1): add invite verify-gate contract for Stories 2.3/2.4`) — follow that convention here, e.g. `docs(3.5): convention lock for project-context + architecture stack`.
- Branch per AD-13 (`<type>/<epic>/<us-id>`), one story per branch: `docs/3-5/3-5-4-convention-lock-project-context-architecture`.

### Testing Requirements

- None (docs-only change; no `ui/`, `api/`, or test files touched). Do not run `npm test`/`pytest` for this story — there's nothing new to exercise.
- Validation is a manual read-through against the four AC line references above, not automated tests.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
