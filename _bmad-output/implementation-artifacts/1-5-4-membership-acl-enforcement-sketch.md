---
baseline_commit: 24bf63c Merge pull request #8 from snsm-uptime/feat/2/2-1-create-and-rename-owned-lists
---

# Story 1.5.4: Membership ACL enforcement sketch

Status: done

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

- [x] Task 0: Confirm scope and sources (AC: #1, #2)
  - [x] Read Epic 1.5 / Story 1.5.4 in `epics.md`, sprint change proposal, and Epic 1 retro AI for membership ACL
  - [x] Skim AD-19 (+ Epic 1.5 addendum) in `ARCHITECTURE-SPINE.md` and proposed AD-24 in `reviews/review-adversarial-divergence.md` (Pair 14)
  - [x] Read as-built 2.1 list ACL fragments: `api/application/lists.py` (`RenameListService`), `api/api/routes/lists.py`, `api/domain/errors.py` (`NotListMemberError` / `NotListOwnerError`)
  - [x] Read Story 2.2 file (`2-2-lists-homepage-membership-scoped-access.md`) — this sketch must lock what 2.2 already assumes so names/flow do not drift
  - [x] Confirm this is **documentation / contract only** — no new ACL port code, routes, schema, migrations, or UI
  - [x] If a living ACL sketch already exists and satisfies ACs: stop and report — do not invent a parallel doc

- [x] Task 1: Membership ACL enforcement sketch (AC: #1)
  - [x] Create durable artifact next to the spine: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md`
  - [x] Add a one-line pointer from `ARCHITECTURE-SPINE.md` (AD-19) to that file — do not rewrite AD-19
  - [x] Document the **canonical enforcement flow** (single choke path):
    1. Route gets `acting_user_id` only from `require_authenticated_user` (401 if missing)
    2. Application use-case calls **one** domain ACL port: `authorize_list_access(acting_user_id, list_id, action)` → opaque **`ListAccessGrant`**
    3. Port evaluates membership; for owner-only actions also evaluates owner/role
    4. Every list-scoped repository method requires that **`ListAccessGrant`** — **no bare `list_id`**, and do **not** mix an alternate “actor-scoped repo” pattern in the same use case (proposed AD-24 practice)
    5. Route maps denial to the locked HTTP error policy below
  - [x] Lock port placement for 2.2: protocol in `api/application/ports.py` (or the established application port module); policy implementation isolated from FastAPI and SQLAlchemy; application services invoke it
  - [x] Lock the **proposed stable interface** name: `authorize_list_access(acting_user_id, list_id, action) -> ListAccessGrant` (align with Story 2.2 wording)
  - [x] Include an **action matrix** with two tiers (per-list port only — see enumeration rule below):
    - **Member-sufficient:** `read_list`, `read_expenses`, `read_balances`, `read_ledger`, `write_expense`, `write_ledger`, `import_to_list`, `set_last_opened_list` (+ future peer settle participation). Note: `read_expenses` / `write_expense` are Epic 3 endpoint aliases of `read_ledger` / `write_ledger` if both names appear
    - **Owner-required:** `rename_list`, `invite_member`, `edit_default_split`
    - **Forbidden:** product-admin / global bypass; UI-only ACL as authority
  - [x] **Enumeration rule (not a per-list ACL action):** homepage / “lists I belong to” is an actor-scoped query `list_for_user(acting_user_id)` — it does **not** call `authorize_list_access` (no single `list_id`)
  - [x] Map **Story callers**:
    - **2.1 (as-built today):** create establishes owner membership (no ACL check needed to create); rename must go through owner authorization (today: ad-hoc in `RenameListService` — sketch marks this as the migration target for the shared port + `ListAccessGrant`)
    - **2.2 (must implement against this contract):** actor-scoped membership listing; per-list ACL for list detail, expenses/balances stubs, last-opened set + first-paint revalidation
    - **Later (name only):** 2.3 invite, 2.5 default split, 2.6 overrides, Epic 3/4 ledger + import — same port, new actions as needed; **any story adding a list-scoped operation updates this sketch’s action matrix and caller map in the same PR**
  - [x] Document **error / disclosure policy** (locked):
    - Unauthenticated → **401**
    - **List-scoped reads** (detail, expenses, balances, ledger reads, and any membership-gated **read** of a list resource): authenticated non-member **and** missing list → **404** with the same client-safe body (anti-enumeration — do **not** use 403 for these reads)
    - **Member-gated mutations** (including `set_last_opened_list`): missing/non-member → **403** `not_list_member` (same safe denial as 2.1 rename for non-members)
    - Authenticated member who is not owner on owner-only action → `NotListOwnerError` / **403** owner deny code (do not collapse into not-found)
    - Do **not** silently change 2.1 rename behavior in this docs-only story
  - [x] Document **as-built gap** honestly: 2.1 has membership-filtered `GET /lists` + ad-hoc rename checks; `get_list` / `update_list_name` still accept bare `list_id`; `deps.require_authenticated_user` docstring still says “membership ACL = Epic 2”. Sketch = target contract; **2.2 implements** the port — do not pretend compliance already exists
  - [x] Include one scannable mermaid (or ASCII) of the choke path — not a novel
  - [x] Cover **what not to break** (personal list = ordinary `List` + membership; peers for reads; no second ACL in Next/`proxy.ts`; auth session ≠ Import Session)

- [x] Task 2: Hygiene + handoff (AC: #1, #2)
  - [x] Link the sketch from this story’s Completion Notes / File List
  - [x] **Update Story 2.2** (`2-2-lists-homepage-membership-scoped-access.md`) in this docs PR: replace all non-member **read** `403` / “prefer 403” language with **404** for missing-or-non-member list-scoped reads (same client-safe body); keep member-gated mutation denial as 403 where applicable; add the updated 2.2 path to this story’s File List
  - [x] Mark sprint `action_items` entry “Membership ACL enforcement sketch (contract only; impl in 2.2)” → `done` when the sketch lands
  - [x] Do **not** mark sibling Epic 1.5 stories done; do **not** start implementing 2.2 product code on this branch; do **not** edit product list/ACL code beyond optional docstring pointer if useful (prefer docs-only)
  - [x] Before marking this story `done`: paste story-close how/why overview per `story-close-overview-checklist.md`
  - [x] Prefer Conventional Commit on branch `docs/1/1-5-4-membership-acl-enforcement-sketch`

### Review Findings

- [x] [Review][Patch] Lock write denials → 403 `not_list_member` for `write_ledger` / `write_expense` / `import_to_list` (decision A) [membership-acl-enforcement-sketch.md:156-192]
- [x] [Review][Patch] Acknowledge read-404 vs mutation-403 cross-endpoint existence oracle [membership-acl-enforcement-sketch.md:156-165]
- [x] [Review][Patch] Lock `ListAccessGrant` minimum semantics (binds `list_id`; same use-case only; never soft-grant) [membership-acl-enforcement-sketch.md:59-64]
- [x] [Review][Patch] Clarify domain-error → HTTP mapping for reads vs mutations (incl. as-built `not_list_owner`) [membership-acl-enforcement-sketch.md:156-179]
- [x] [Review][Patch] Specify read-404 client-safe JSON body shape (`detail` + `code`) [membership-acl-enforcement-sketch.md:161]
- [x] [Review][Patch] Explicit owner-only + missing/non-member → 403 `not_list_member` [membership-acl-enforcement-sketch.md:156-163]
- [x] [Review][Patch] Port fail-closed: unknown `action` rejected; internal errors never return a grant [membership-acl-enforcement-sketch.md:59-76]
- [x] [Review][Patch] First-paint revalidation names `read_list`; lock alias synonym rule at the port [membership-acl-enforcement-sketch.md:74-76,138-140]
- [x] [Review][Patch] Fix malformed markdown code span on expenses/balances caller-map row [membership-acl-enforcement-sketch.md:138]
- [x] [Review][Patch] Mermaid choke path: show unauthenticated → 401 fork [membership-acl-enforcement-sketch.md:14-28]
- [x] [Review][Defer] Optional `require_authenticated_user` docstring still says “ACL = Epic 2” [api/api/deps.py] — deferred, pre-existing / optional docs-only fix for Story 2.2
- [x] [Review][Defer] First-paint client must clear stale `last_opened_list_id` on deny — deferred, Story 2.2 UX
- [x] [Review][Defer] Malformed non-UUID `list_id` FastAPI validation vs 404 anti-enumeration — deferred, pre-existing framework path
- [x] [Review][Defer] Rename migration exit criteria / when 2.1 pays AD-24 debt — deferred, intentional grandfather until an implement story migrates it

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
| Proposed interface | `authorize_list_access(acting_user_id, list_id, action) -> ListAccessGrant` |
| Port home (2.2) | Protocol in `api/application/ports.py` (or established application port module); policy free of FastAPI/SQLAlchemy |
| Repo rule | List-scoped repos require **`ListAccessGrant`** only — no bare `list_id`; do not mix actor-scoped alternatives in the same use case |
| Enumeration | `list_for_user(acting_user_id)` is actor-scoped — **not** a per-list ACL action |
| Peer vs owner | Membership = peer read/write of ledger/import; owner-only = rename, invite, standing default-split |
| Read denial HTTP | List-scoped **reads** → **404** for missing list ≡ non-member (same body); never 403 on those reads |
| Mutation denial HTTP | Member-gated mutations (incl. `set_last_opened_list`) + 2.1 rename non-member → **403** `not_list_member`; owner-only deny → **403** owner code |
| Product admin | **None** in v1 |
| Personal list | Same `List` entity + owner membership — never a separate type |
| Living ownership | Any story adding a list-scoped operation updates this sketch’s action matrix + caller map in the **same PR** |
| Implementation story | **2.2** owns code; this story owns the contract doc (+ 2.2 story-file disclosure alignment) |
| Naming | Sprint key `1-5-4-…` = Epic **1.5** story 4 — **not** Epic 1 story 5 (`1-5-config-gated-…`) |
| Action item | Marks “Membership ACL enforcement sketch…” sprint action item `done` when sketch lands |

### Deliverables (exact)

| Artifact | Path | Purpose |
|----------|------|---------|
| Living ACL sketch | `…/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` | AC #1 |
| Spine pointer | `ARCHITECTURE-SPINE.md` AD-19 (one link) | Discoverability |
| Story 2.2 alignment | `2-2-lists-homepage-membership-scoped-access.md` | Read denial **404** (no prefer-403 drift) |

**Not deliverables:** domain ACL port implementation, new list/detail/expense routes, last-opened storage, homepage UI, invite tokens, schema/migrations, rate limits, verify-gate contract (1.5.3), Playwright suites.

### Suggested sketch outline (for the deliverable)

```markdown
# Membership ACL enforcement sketch (living)
## Overview (mermaid choke path)
## Invariants (AD-19 + proposed AD-24 cheat sheet)
## Canonical port
### Signature (`authorize_list_access` → `ListAccessGrant`)
### Port home (`api/application/ports.py`)
### Action vocabulary (incl. ledger aliases)
## Action matrix (member vs owner)
## Enumeration vs per-list ACL
## Story caller map (2.1 as-built → 2.2 must-call → later)
## Error / disclosure policy (reads 404 · mutations 403)
## As-built gap (2.1 ad-hoc rename) → target
## Living ownership (update matrix when adding ops)
## What not to break / anti-patterns
## Related docs (spine, Story 2.2, auth-mail map)
```

### As-built path inventory (MUST document — do not invent)

| Layer | Path | Role today | Sketch stance |
|-------|------|------------|---------------|
| Auth gate | `api/api/deps.py` `require_authenticated_user` | Session → UUID; docstring says ACL = Epic 2 | Auth only; ACL is separate next hop |
| List routes | `api/api/routes/lists.py` | `GET /lists` membership-filtered; `POST /lists` create; `PATCH` rename owner-only | Routes must **call** services that call ACL — routes are not the ACL |
| Application | `api/application/lists.py` | `CreateOwnedListService`, `RenameListService` (ad-hoc membership+owner), `ListMembershipsService` | Rename is the **migration exemplar**; 2.2 adds shared port + new use-cases |
| Ports | `api/application/ports.py` | Existing hex ports (email, etc.) | 2.2 adds `authorize_list_access` / `ListAccessGrant` protocol here |
| Repo protocol | `ListRepository` in `lists.py` | `get_list(list_id)`, `get_membership`, `list_for_user`, `update_list_name(list_id, …)` | Target: list-scoped methods require `ListAccessGrant`; enum stays `list_for_user(actor)` |
| Persistence | `api/adapters/persistence/repositories.py`, `models.py` | `ListMembershipModel.role` `"owner"` \| `"member"`; `uq_list_membership` | Do not redesign roles/schema in this story |
| Errors | `api/domain/errors.py` | `NotListMemberError` (2.1 → 403 on rename), `NotListOwnerError`, `ListNotFoundError` | **Reads** → **404** (`ListNotFoundError` or equivalent same body); member-gated mutations → **403** `not_list_member`; keep owner deny distinct |
| UI / BFF | `ui/app/lists/*`, `ui/app/api/lists/*`, `ui/proxy.ts` | Lists BFF; proxy presence-only; `/api/lists` public at proxy | UI never becomes second ACL truth |
| Story 2.2 | `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md` | Already specifies domain ACL port + tests | Sketch must **align names/flow** so 2.2 does not diverge |

**Why (AD-19 addendum):** one application-layer path; Epic 1.5 sketches; Epic 2 implements; no second ACL scheme in the UI.

### Architecture compliance (MUST follow)

- **AD-19:** Membership required for list ledger read/write + import; peers; no product admin; personal list at signup
- **AD-19 addendum:** One application-layer enforcement path; this story = sketch; 2.x = implementation
- **Proposed AD-24 (review guidance — encode as practice in the sketch):** domain ACL port returns `ListAccessGrant`; list-scoped repos require that grant — do not rely on application-only checks with unscoped repos; do not mix actor-scoped alternatives in the same use case
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
| UPDATE Story 2.2 | `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md` (read denial → 404) |
| UPDATE status | `sprint-status.yaml` (story → ready-for-dev now; → done + action_item when implemented) |
| REFERENCE only | `api/application/lists.py`, `ports.py`, routes, errors, models, auth-mail map |
| DO NOT TOUCH | ACL port implementation, list detail/expense endpoints, invite flows, schema, UI homepage |

### Previous story intelligence

**From 1.5.2 (mirror process):**
- Living architecture companion next to spine + one-line spine pointer
- Explicit non-deliverables table; as-built inventory; locked decisions
- Story-close overview required before `done`
- Docs-only: no pytest required for acceptance

**From 2.1 (as-built ACL fragments):**
- `RenameListService` already collapses missing list + non-member → `NotListMemberError` → API **403** `not_list_member` (mutation anti-enumeration)
- Owner check uses `existing.owner_id != actor` → `NotListOwnerError`
- `GET /lists` already membership-filtered via `list_for_user` (actor-scoped enum — keep this pattern; do not force it through the per-list port)
- Gap: no shared `authorize_list_access` / `ListAccessGrant`; repos still accept bare `list_id`
- **Policy for Epic 2:** list-scoped **reads** → **404**; member-gated **mutations** (incl. last-opened) → **403** `not_list_member`

**From Story 2.2 (consumer contract — align disclosure in this PR):**
- Domain ACL port with `acting_user_id`, `list_id`, and `action` → **`ListAccessGrant`**
- Application invocation; protocol lives under application ports; no SQLAlchemy/FastAPI in policy
- Member reads for detail/expense/balance stubs; homepage via actor-scoped enum
- First-paint revalidates membership for remembered list
- 401 unauthenticated; **reads → 404**; **set_last_opened_list** missing/non-member → **403**
- Owner-only mutations stay out of 2.2 new endpoints

**Anti-patterns (prevent these):**
- Implementing the ACL port “while sketching”
- Per-route `if membership` copies without a shared port
- Mixing bare-`list_id` repos with a separate application-only check (Pair 14)
- Treating homepage enum as `authorize_list_access(..., list_id=?)`
- UI/`proxy.ts` as the security boundary
- Treating personal list as a separate entity type
- Adding product-admin or owner-vs-viewer for ordinary expense reads
- Returning **403** on list-scoped **reads** for non-members (leaks “exists but forbidden” vs not-found)
- Returning **404** on `set_last_opened_list` / rename non-member paths without an explicit policy change story
- Documenting 2.1 ad-hoc rename as already satisfying proposed AD-24
- Writing invite verify-gate rules here (that is 1.5.3)
- Confusing auth **session** with **Import Session** (AD-4)
- Starting 2.2 product implementation on the `docs/1/1-5-4-…` branch

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
  1. Where is membership enforced (layer + port + grant)?
  2. Which actions are member vs owner? Which ops are actor-scoped enum vs per-list ACL?
  3. What must Story 2.1 preserve and Story 2.2 call?
  4. Reads vs mutations: which HTTP status for missing/non-member? (**404** reads · **403** member-gated mutations)
- Sketch must state the **test contract 2.2 will own**: domain allow/deny TDD; Postgres multi-user isolation on list enum + expenses/balances deny; non-member **read** → **404**; `set_last_opened_list` non-member → **403**; write denial pattern reserved for later ledger stories
- Cross-link Story 2.2 Dev Notes to this sketch after it exists (done in this PR’s 2.2 story-file update + optional one-liner once the sketch path is real)

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

Cursor Grok 4.5

### Debug Log References

- Confirmed no pre-existing `membership-acl-*.md` (Task 0 — no parallel doc)
- Story 2.2 already locked reads → 404 / mutations → 403; this PR only hardened the living-sketch link

### Completion Notes List

- Delivered living ACL contract at `membership-acl-enforcement-sketch.md` (choke path, action matrix, caller map, disclosure, as-built gap).
- Spine AD-19 (+ capability map) points to the sketch; no AD-19 rewrite.
- Story 2.2 disclosure link updated to the landed sketch path; no product ACL code.
- Sprint action item “Membership ACL enforcement sketch…” → `done`.
- Docs-only: no pytest / no runtime deps.
- Code review (2026-08-04): applied 10 contract patches (grant semantics, disclosure bodies, write→403, fail-closed, mermaid 401); 4 deferred; story → `done`.

## Story-close overview — 1.5.4 / membership-acl-enforcement-sketch

**Request path:**
(docs) Architect living companion next to spine → AD-19 pointer → Story 2.2 consumes contract when implementing `authorize_list_access` → `ListAccessGrant` → list-scoped repos. Runtime path when 2.2 lands: Browser → BFF/`proxy.ts` (presence only) → FastAPI route → `require_authenticated_user` → application use-case → ACL port → grant-gated repo.

**Key components:**
`membership-acl-enforcement-sketch.md` · `ARCHITECTURE-SPINE.md` (AD-19 pointer) · `2-2-lists-homepage-membership-scoped-access.md` · as-built refs: `api/application/lists.py`, `api/api/routes/lists.py`, `api/domain/errors.py`, `api/api/deps.py`

**Why this shape:**
AD-19 addendum requires one application-layer ACL path; proposed AD-24 (Pair 14) requires grant-gated repos instead of bare `list_id` + app-only checks. Sketch before 2.2 so homepage/invite/import do not invent parallel ACL schemes.

**What not to break:**
Personal list = ordinary `List` + membership; peers for ordinary reads/writes; homepage = `list_for_user` (not per-list port); reads → **404** / member-gated mutations → **403**; no second ACL in UI/`proxy.ts`; auth session ≠ Import Session; do not silently change 2.1 rename HTTP codes.

### File List

- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md` (NEW → review-patched)
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` (UPDATE — AD-19 + capability pointer)
- `_bmad-output/implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md` (UPDATE — sketch link + write-denial note)
- `_bmad-output/implementation-artifacts/1-5-4-membership-acl-enforcement-sketch.md` (UPDATE — status/tasks/record/review)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — story → done; action item → done)
- `_bmad-output/implementation-artifacts/deferred-work.md` (UPDATE — review deferrals)

## Change Log

- 2026-08-04: Story context created (ready-for-dev) — Ultimate context engine analysis completed
- 2026-08-04: Locked list-scoped **reads** → **404** for missing ≡ non-member; kept 2.1 rename 403 as as-built mutation note
- 2026-08-04: Validate-story pass — `ListAccessGrant` repo rule; enum vs per-list ACL; mutation 403 incl. last-opened; ledger actions; port home; living-doc ownership; Task 2 aligns Story 2.2 disclosure
- 2026-08-04: Implemented living ACL sketch + spine pointer; aligned Story 2.2 link; sprint action item done; status → review
- 2026-08-04: Code review — 10 patches applied to sketch; write denials locked 403; status → done
