---
baseline_commit: 24bf63c Merge pull request #8 from snsm-uptime/feat/2/2-1-create-and-rename-owned-lists
---

# Story 1.5.4: Membership ACL enforcement sketch

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a sketch of where membership ACL is enforced and what 2.1/2.2 must call,
so that list access checks are consistent before homepage and invite work continues.

## Acceptance Criteria

1. **Given** AD-19 membership rules  
   **When** the sketch is delivered  
   **Then** it names the enforcement layer (application vs route), the operations that must check membership, and what Stories 2.1/2.2 are expected to call

2. **And** full ACL product implementation remains in Epic 2 (especially 2.2) — this story is the contract sketch

## Tasks / Subtasks

- [ ] Task 0: Confirm scope and sources (AC: #1, #2)
  - [ ] Read Epic 1.5 / Story 1.5.4 in `epics.md`, sprint change proposal, and Epic 1 retro AI for membership ACL
  - [ ] Skim AD-19 (+ Epic 1.5 addendum) in `ARCHITECTURE-SPINE.md` and proposed AD-24 in `reviews/review-adversarial-divergence.md` (Pair 14)
  - [ ] Read as-built 2.1 list ACL fragments: `api/application/lists.py` (`RenameListService`), `api/api/routes/lists.py`, `api/domain/errors.py` (`NotListMemberError` / `NotListOwnerError`)
  - [ ] Read Story 2.2 file (`2-2-lists-homepage-membership-scoped-access.md`) — this sketch must lock what 2.2 already assumes so names/flow do not drift
  - [ ] Confirm this is **documentation / contract only** — no new ACL port code, routes, schema, migrations, or UI
  - [ ] If a living ACL sketch already exists and satisfies ACs: stop and report — do not invent a parallel doc

- [ ] Task 1: Membership ACL enforcement sketch (AC: #1)
  - [ ] Create durable artifact next to the spine: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md`
  - [ ] Add a one-line pointer from `ARCHITECTURE-SPINE.md` (AD-19) to that file — do not rewrite AD-19
  - [ ] Document the **canonical enforcement flow** (single choke path):
    1. Route gets `acting_user_id` only from `require_authenticated_user` (401 if missing)
    2. Application use-case calls **one** domain ACL port with `(acting_user_id, list_id, action)`
    3. Port evaluates membership; for owner-only actions also evaluates owner/role
    4. Persistence is actor-scoped **or** receives an ACL capability/token from that authorization result — **no bare `list_id`** on list-scoped reads/writes (proposed AD-24 practice)
    5. Route maps denial to established API error policy
  - [ ] Lock the **proposed stable interface** name: `authorize_list_access(acting_user_id, list_id, action)` (align with Story 2.2 wording — rename only if a stronger name is already in code; document either way)
  - [ ] Include an **action matrix** with two tiers:
    - **Member-sufficient:** `list_memberships` (homepage enum), `read_list`, `read_expenses`, `read_balances`, `write_expense`, `import_to_list`, `set_last_opened_list` (+ future peer settle participation)
    - **Owner-required:** `rename_list`, `invite_member`, `edit_default_split`
    - **Forbidden:** product-admin / global bypass; UI-only ACL as authority
  - [ ] Map **Story callers**:
    - **2.1 (as-built today):** create establishes owner membership (no ACL check needed to create); rename must go through owner authorization (today: ad-hoc in `RenameListService` — sketch marks this as the migration target for the shared port)
    - **2.2 (must implement against this contract):** membership listing, list detail, expenses/balances stubs, last-opened set + first-paint revalidation
    - **Later (name only):** 2.3 invite, 2.5 default split, 2.6 overrides, Epic 3/4 ledger + import — same port, new actions as needed
  - [ ] Document **error / disclosure policy**:
    - Unauthenticated → **401**
    - Authenticated non-member (and missing-list when anti-enumeration applies) → deny via `NotListMemberError` / `403` `not_list_member` (preserve 2.1 rename posture: missing list ≡ non-member for existence oracle)
    - Authenticated member who is not owner on owner-only action → `NotListOwnerError` / owner deny code (do not collapse into not-member)
    - If 2.2 chooses 404 for some reads: document and apply **consistently** — do not mix 403/404 per resource class without saying so
  - [ ] Document **as-built gap** honestly: 2.1 has membership-filtered `GET /lists` + ad-hoc rename checks; `get_list` / `update_list_name` still accept bare `list_id`; `deps.require_authenticated_user` docstring still says “membership ACL = Epic 2”. Sketch = target contract; **2.2 implements** the port — do not pretend compliance already exists
  - [ ] Include one scannable mermaid (or ASCII) of the choke path — not a novel
  - [ ] Cover **what not to break** (personal list = ordinary `List` + membership; peers for reads; no second ACL in Next/`proxy.ts`; auth session ≠ Import Session)

- [ ] Task 2: Hygiene + handoff (AC: #1, #2)
  - [ ] Link the sketch from this story’s Completion Notes / File List
  - [ ] Mark sprint `action_items` entry “Membership ACL enforcement sketch (contract only; impl in 2.2)” → `done` when the sketch lands
  - [ ] Do **not** mark sibling Epic 1.5 stories done; do **not** start implementing 2.2 on this branch; do **not** edit product list/ACL code beyond optional docstring pointer if useful (prefer docs-only)
  - [ ] Before marking this story `done`: paste story-close how/why overview per `story-close-overview-checklist.md`
  - [ ] Prefer Conventional Commit on branch `docs/1/1-5-4-membership-acl-enforcement-sketch`

## Dev Notes

### Epic context

Epic 1.5 = Auth spine hardening & Epic 2 prep (Correct Course / Epic 1 retro). Critical path **1.5.1 → 1.5.5** before Stories **2.2+**. This story closes the **authorization contract** gap so 2.2 does not invent a one-off ACL while invites/imports later invent a second.

| Sibling | Relationship to 1.5.4 |
|---------|----------------------|
| 1.2 / 2.1 | As-built `List` + `ListMembership` + create/rename — source of roles, errors, membership filter |
| 1.5.1 | Token claim — unrelated; no ACL work |
| 1.5.2 | Auth/mail map + story-close habit — **mirror its artifact pattern** (companion next to spine + spine pointer) |
| 1.5.3 | Invite verify-gate **contract** — orthogonal; do not write invite accept rules here |
| **1.5.4 (this)** | Membership ACL **enforcement sketch** (contract only) |
| 1.5.5 | Spine smoke — may later cite ACL sketch; out of scope here |
| 1.5.6 / 1.5.7 | Parallel rate-limit / hex-pytest — out of scope |
| **2.2** | **Primary consumer** — implements domain ACL port + membership-scoped homepage/detail/expenses/balances |
| 2.3–2.6 | Reuse the same port for invite / split / overrides |

### Locked decisions (do not re-ask)

| Topic | Decision |
|-------|----------|
| Sketch path | Architecture companion next to spine (Winston-owned living doc) |
| Enforcement layer | **One application → domain ACL port path** — not per-route middleware as the authority; not UI/`proxy.ts` |
| Proposed interface | `authorize_list_access(acting_user_id, list_id, action)` |
| Repo rule | Proposed AD-24 practice: no bare `list_id` without `acting_user_id` or ACL token |
| Peer vs owner | Membership = peer read/write of ledger/import; owner-only = rename, invite, standing default-split |
| Product admin | **None** in v1 |
| Personal list | Same `List` entity + owner membership — never a separate type |
| Implementation story | **2.2** owns code; this story owns the contract doc only |
| Naming | Sprint key `1-5-4-…` = Epic **1.5** story 4 — **not** Epic 1 story 5 (`1-5-config-gated-…`) |
| Action item | Marks “Membership ACL enforcement sketch…” sprint action item `done` when sketch lands |

### Deliverables (exact)

| Artifact | Path | Purpose |
|----------|------|---------|
| Living ACL sketch | `…/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` | AC #1 |
| Spine pointer | `ARCHITECTURE-SPINE.md` AD-19 (one link) | Discoverability |

**Not deliverables:** domain ACL port implementation, new list/detail/expense routes, last-opened storage, homepage UI, invite tokens, schema/migrations, rate limits, verify-gate contract (1.5.3), Playwright suites.

### Suggested sketch outline (for the deliverable)

```markdown
# Membership ACL enforcement sketch (living)
## Overview (mermaid choke path)
## Invariants (AD-19 + proposed AD-24 cheat sheet)
## Canonical port
### Signature
### Action vocabulary
## Action matrix (member vs owner)
## Story caller map (2.1 as-built → 2.2 must-call → later)
## Error / disclosure policy
## As-built gap (2.1 ad-hoc rename) → target
## What not to break / anti-patterns
## Related docs (spine, Story 2.2, auth-mail map)
```

### As-built path inventory (MUST document — do not invent)

| Layer | Path | Role today | Sketch stance |
|-------|------|------------|---------------|
| Auth gate | `api/api/deps.py` `require_authenticated_user` | Session → UUID; docstring says ACL = Epic 2 | Auth only; ACL is separate next hop |
| List routes | `api/api/routes/lists.py` | `GET /lists` membership-filtered; `POST /lists` create; `PATCH` rename owner-only | Routes must **call** services that call ACL — routes are not the ACL |
| Application | `api/application/lists.py` | `CreateOwnedListService`, `RenameListService` (ad-hoc membership+owner), `ListMembershipsService` | Rename is the **migration exemplar**; 2.2 adds shared port + new use-cases |
| Repo protocol | `ListRepository` in `lists.py` | `get_list(list_id)`, `get_membership`, `list_for_user`, `update_list_name(list_id, …)` | Target: list-scoped data access carries actor or ACL token |
| Persistence | `api/adapters/persistence/repositories.py`, `models.py` | `ListMembershipModel.role` `"owner"` \| `"member"`; `uq_list_membership` | Do not redesign roles/schema in this story |
| Errors | `api/domain/errors.py` | `NotListMemberError`, `NotListOwnerError` | Reuse; do not invent a third “forbidden” type without cause |
| UI / BFF | `ui/app/lists/*`, `ui/app/api/lists/*`, `ui/proxy.ts` | Lists BFF; proxy presence-only; `/api/lists` public at proxy | UI never becomes second ACL truth |
| Story 2.2 | `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md` | Already specifies domain ACL port + tests | Sketch must **align names/flow** so 2.2 does not diverge |

**Why (AD-19 addendum):** one application-layer path; Epic 1.5 sketches; Epic 2 implements; no second ACL scheme in the UI.

### Architecture compliance (MUST follow)

- **AD-19:** Membership required for list ledger read/write + import; peers; no product admin; personal list at signup
- **AD-19 addendum:** One application-layer enforcement path; this story = sketch; 2.x = implementation
- **Proposed AD-24 (review guidance — encode as practice in the sketch):** domain ACL port; repos must not accept bare `list_id` without `acting_user_id` or ACL token
- **AD-1:** Domain has no FastAPI/SQLAlchemy; ORM under persistence; `ui` → HTTP only
- **AD-8:** Auth remains httpOnly cookie / BFF — ACL is orthogonal to session resolve
- **NFR-3 / FR-8:** Non-members cannot read expenses/balances; visibility = membership
- **AD-22:** No schema/deploy work in this story
- **Do not** invent owner-vs-viewer product roles for ordinary reads; do not add Redis/admin roles

[Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-19]  
[Source: `_bmad-output/planning-artifacts/architecture/.../reviews/review-adversarial-divergence.md` — Pair 14 / proposed AD-24]  
[Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.4]  
[Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]  
[Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md`]  
[Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]  
[Source: `_bmad-output/project-context.md` — ACL must-cover edges]

### Project structure notes

| Touch | Path |
|-------|------|
| NEW sketch | `…/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` |
| UPDATE spine link | same folder `ARCHITECTURE-SPINE.md` (AD-19 pointer only) |
| UPDATE status | `sprint-status.yaml` (story → ready-for-dev now; → done + action_item when implemented) |
| REFERENCE only | `api/application/lists.py`, routes, errors, models, Story 2.2, auth-mail map |
| DO NOT TOUCH | ACL port implementation, list detail/expense endpoints, invite flows, schema, UI homepage |

### Previous story intelligence

**From 1.5.2 (mirror process):**
- Living architecture companion next to spine + one-line spine pointer
- Explicit non-deliverables table; as-built inventory; locked decisions
- Story-close overview required before `done`
- Docs-only: no pytest required for acceptance

**From 2.1 (as-built ACL fragments):**
- `RenameListService` already collapses missing list + non-member → `NotListMemberError` (anti-enumeration)
- Owner check uses `existing.owner_id != actor` → `NotListOwnerError`
- `GET /lists` already membership-filtered via `list_for_user`
- Gap: no shared `authorize_list_access`; repos still accept bare `list_id`

**From Story 2.2 (consumer contract — do not contradict):**
- Domain ACL port with `acting_user_id`, `list_id`, `action`
- Application invocation; no SQLAlchemy/FastAPI in domain
- Member reads for homepage/detail/expense/balance stubs
- First-paint revalidates membership for remembered list
- 401 unauthenticated; deny non-members; Postgres isolation tests
- Owner-only mutations stay out of 2.2 new endpoints

**Anti-patterns (prevent these):**
- Implementing the ACL port “while sketching”
- Per-route `if membership` copies without a shared port
- UI/`proxy.ts` as the security boundary
- Treating personal list as a separate entity type
- Adding product-admin or owner-vs-viewer for ordinary expense reads
- Documenting 2.1 ad-hoc rename as already satisfying proposed AD-24
- Writing invite verify-gate rules here (that is 1.5.3)
- Confusing auth **session** with **Import Session** (AD-4)
- Starting 2.2 implementation on the `docs/1/1-5-4-…` branch

### Git intelligence summary

| Commit / artifact | Relevance |
|-------------------|-----------|
| `fde958e` / `a713d4f` / `b8c4d71` (Story 2.1) | Create/rename + membership filter + review fixes — as-built ACL fragments |
| `24bf63c` | Merge PR #8 — baseline for this story branch |
| Sprint change proposal 2026-08-04 | Epic 1.5 insertion; ACL sketch critical-path before 2.2+ |
| Epic 1 retro | AI: membership ACL contract only; impl in 2.2 |
| Story 1.5.2 artifacts | Pattern for living architecture companion + spine pointer |

Branch for this story: `docs/1/1-5-4-membership-acl-enforcement-sketch` (AD-13 / project-context: one story per branch; `docs` type fits).

### Library / framework requirements

- **No new runtime dependencies**
- Document FastAPI session dependency + hex layout only — do not pin new auth libraries
- Do not bump majors inside this docs story

### Testing requirements

- **No code tests required** for the contract sketch deliverable
- Acceptance check = a reviewer can answer from the sketch alone:
  1. Where is membership enforced (layer + port)?
  2. Which actions are member vs owner?
  3. What must Story 2.1 preserve and Story 2.2 call?
- Sketch must state the **test contract 2.2 will own**: domain allow/deny TDD; Postgres multi-user isolation on list enum + expenses/balances deny; non-member denied on **read and write** (write paths land in later stories but pattern is reserved)
- Optional: one cross-link from Story 2.2 Dev Notes to this sketch after it exists — do that in the 2.2 PR or a tiny docs follow-up, not by implementing 2.2 here

### Latest tech notes

- No library upgrades
- Next.js 16 `proxy.ts` remains a **coarse presence gate** — not ACL (same note as auth-mail map)
- Proposed AD-24 is **review guidance**, not a formally numbered adopted spine AD — the sketch should treat it as required practice for Epic 2 without pretending the spine already renumbered it (unless Winston promotes it in the same PR with an explicit spine edit — optional, not required for AC)

### Project context reference

Follow `_bmad-output/project-context.md`: AD-19 membership ACL; non-member denied on read **and** write (expenses, import, settle); hex boundaries; one story per branch; story-close how/why overview before `done`; source-of-truth order Spine → project-context → SPEC/UX → epics.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 1.5 / Story 1.5.4]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-04.md`]
- [Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-08-04.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-19]
- [Source: `_bmad-output/planning-artifacts/architecture/.../reviews/review-adversarial-divergence.md` — Pair 14]
- [Source: `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md`]
- [Source: `_bmad-output/implementation-artifacts/1-5-2-auth-mail-interaction-map-and-story-close-overview.md`]
- [Source: `_bmad-output/implementation-artifacts/story-close-overview-checklist.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/.../auth-mail-interaction-map.md`]
- [Source: `api/application/lists.py`, `api/api/routes/lists.py`, `api/domain/errors.py`]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-04: Story context created (ready-for-dev) — Ultimate context engine analysis completed
