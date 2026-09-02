# Sprint Change Proposal — 2026-09-01

**Trigger:** Product rethink of budgets (Epic 6, Stories 6.3–6.5 — already shipped/merged to `main`).

## 1. Issue Summary

Epic 6's budgets (Stories 6.3–6.5, `done` in `sprint-status.yaml`) are **list-scoped**: a `Budget` row belongs to exactly one `list_id`, `budget_rules` are similarly list-scoped, and attribution reads a single list's `ledger_entries`. AD-29 explicitly restricted this to solo lists ("Budgets are list-scoped... UI is solo-only in Epic 6... Shared-list budgets later than Epic 6").

The product owner (Sebas) wants budgets to become a **standalone, personal entity**: each budget is owned by the user who created it (not a list), selects **one or more source lists** (any list the owner belongs to, solo or shared) to pull spend from, keeps regex-style rule matching as-is, and adds a UI distinction — history lines attributed by a rule show a **"Rule"** badge; manually assigned lines show none.

This is a genuine architectural pivot on already-shipped functionality, not a bug fix — `budgets.list_id` and `budget_rules.list_id` (both NOT NULL FKs, migrations `0032`/`0033`) need to be replaced with an owner + multi-list-source model.

## 2. Impact Analysis

**Epic impact:** Epic 6 Stories 6.3–6.5 are superseded (not deleted — historical record of what shipped stays intact, per user preference to avoid rewriting completed-epic history). A new **Epic 7: budgets as a standalone entity** carries the redesign as Stories 7.1–7.3.

**Story impact:**
- New: Story 7.1 (standalone budget list + create, owner-only ACL, source-list picker), 7.2 (cross-list budget detail), 7.3 (cross-list attribution + "Rule" badge).
- Superseded-note only, text unchanged: Story 6.3 (Budget list), 6.4 (Budget detail), 6.5 (Budget attribution).
- Unaffected: Stories 6.1 (mode switch) and 6.2 (spend by origin) — individual-list chrome is independent of the budget rework.

**Artifact conflicts:**
- **PRD** (`prd.md`): FR-48, FR-49, FR-50 reworded — budgets no longer "solo Budgets tab"; now an owner-scoped entity with an explicit source-list concept and a "Rule" badge requirement.
- **Architecture** (`ARCHITECTURE-SPINE.md`): AD-29 loses its budget-ownership clause (kept: individual-list membership-count chrome rule). New **AD-30** defines the standalone-entity model: `budgets.owner_user_id` (replacing `list_id`), new `budget_source_lists` join table, `budget_rules.list_id` dropped, attribution scans the union of source lists' `ledger_entries`, ACL is owner-only.
- **Migration**: new Alembic revision (`0034_budgets_standalone_entity`, depends on `0033_budget_attribution`) — add/backfill `budgets.owner_user_id` from `lists.owner_id` via the old `list_id`, drop `budgets.list_id`; create `budget_source_lists` and backfill one row per existing budget from its old `list_id`; drop `budget_rules.list_id`.
- **API**: routes move from list-nested (`/lists/{list_id}/budgets/...`) to standalone (`/budgets`, `/budgets/{id}`); every `application/budgets.py` service's `AuthorizeListAccessService` call is replaced with an owner check (`budget.owner_user_id == actor_user_id`).
- **UI**: `BudgetsPanel` moves from `ui/app/lists/[listId]/budgets/` to a new top-level `/budgets` route with primary-nav entry; create/edit form gains a multi-select source-list picker; budget detail history rendering adds the "Rule" badge (data already exists via `BudgetHistoryLine.attributed_via`, just not surfaced).
- **UX** (`EXPERIENCE.md`): IA table row for solo list detail and the "Budgets tab / detail" component reference both updated to describe the standalone surface instead of embedded-in-solo-list.
- **Domain** (`domain/budget_attribution.py`): `compute_attributed_entries` needs to scan entries from multiple lists (currently one `list_id` per call site).
- **Testing**: full retest across domain/application/persistence/API/UI layers for budgets; existing pending local diff (`test_budget_attribution_domain.py`, `BUDGET_ASSIGNABLE_LINE_TYPES` extraction) is compatible groundwork, not a conflict.

**Technical impact:** one new migration with backfill logic (not purely additive — two column drops); new ACL model (owner-only replaces list-membership ACL for this one entity, a first in this codebase); route restructuring.

## 3. Recommended Approach

**Direct Adjustment (Option 1)** via a new Epic 7 that supersedes Epic 6's budget-specific stories in place (text preserved, marked superseded) rather than rewritten or rolled back.

- Effort: **High** — schema migration + backfill, new ACL path, route move, UI surface move, full retest.
- Risk: **Medium** — the migration drops two NOT NULL FK columns after backfill; must be reversible and tested against a non-trivial fixture (a budget with rules, some manual assignments, from a shared list) before merge. ACL bug risk (owner-only leak) is the other main risk surface — worth explicit test coverage for "non-owner with access to a source list cannot see the budget."
- Rollback/MVP-reduction options were both rejected as not applicable — the shipped code isn't wrong, it's being intentionally redesigned, and FR-48/49 stay in MVP scope, just reshaped.

**User design decisions locked in during this session:**
1. Source lists: any list the owner belongs to (solo or shared).
2. ACL: owner-only read/write (not list-membership-based).
3. UI location: new top-level `/budgets` route.
4. Epic 6 history preserved as-is; new Epic 7 carries the rework.

## 4. Detailed Change Proposals

### PRD (`prd.md`)

- **FR-48**: "Solo Budgets tab..." → "Budgets tab... independent of any single list. Each budget selects one or more lists (from any list the user belongs to) as its spend sources..."
- **FR-49**: adds "History lines attributed by a matching rule show a 'Rule' badge; manually assigned lines show no badge," drops "Shared-list budgets/dashboards are later than Epic 6."
- **FR-50**: reworded — budgets are independent of list membership count, unaffected by a list gaining a second member.

### Epics (`epics.md`)

- Superseded notes appended after Stories 6.3, 6.4, 6.5 (text unchanged), pointing to Epic 7.
- New **Epic 7: budgets as a standalone entity** appended at end of file, with Stories 7.1 (standalone list + create), 7.2 (cross-list detail), 7.3 (cross-list attribution + Rule badge) — full ACs as drafted and approved in this session.

### Architecture (`ARCHITECTURE-SPINE.md`)

- AD-29: budget-ownership clause removed (kept: membership-count chrome rule), points to AD-30.
- New **AD-30 — budgets as a standalone owner-scoped entity (post-v1) [ADOPTED]**: `owner_user_id`, `budget_source_lists` join table, dropped `budget_rules.list_id`, owner-only ACL, existing `attributed_via` surfaced as "Rule" badge.
- Migration plan: new revision `0034_budgets_standalone_entity` (add+backfill `owner_user_id`, drop `budgets.list_id`; new `budget_source_lists` table + backfill; drop `budget_rules.list_id`); documented lossy-downgrade limitation for budgets with >1 source list.

### UX (`EXPERIENCE.md`)

- IA table row (line 29) and component reference row (line 78) updated: Budgets tab moves from "solo list detail" to a standalone owner-only `/budgets` surface with a source-list picker and "Rule" badge; line 41's "shared-list budgets later" note removed (now in scope via Epic 7).

## 5. Implementation Handoff

**Scope classification: Major** — new data model (`owner_user_id`, `budget_source_lists`), ACL model change (owner-only, first of its kind), schema migration with backfill/column-drop, route restructuring, and UI surface relocation.

**Routed to:** Product Manager / Solution Architect for final sign-off on AD-30 and the migration plan, then handoff to Developer agent for Story 7.1 → 7.2 → 7.3 implementation in that order (7.1's migration is a prerequisite for 7.2/7.3).

**Responsibilities:**
- PM/Architect: confirm AD-30 and PRD FR-48/49/50 wording are final; confirm no other artifact references list-scoped budgets were missed.
- Developer (Amelia): implement `0034_budgets_standalone_entity` migration + backfill test, then Stories 7.1–7.3 per this session's ACs, one story per branch (`feat/7/7-1-...` etc.), following the existing worktree/story-close-overview conventions.
- Update `sprint-status.yaml`: add `epic-7: backlog` with `7-1-standalone-budget-list-create`, `7-2-cross-list-budget-detail`, `7-3-cross-list-attribution-rule-badge` (all `backlog`) once this proposal is approved.

**Success criteria:** a budget can source lines from ≥2 lists (mixed solo/shared) with combined history; rule-matched lines show "Rule", manual lines don't; a non-owner with source-list access cannot see or edit the budget; `budgets`/`budget_rules` no longer have a `list_id` column; existing budgets survive the migration with their original list as sole source list.
