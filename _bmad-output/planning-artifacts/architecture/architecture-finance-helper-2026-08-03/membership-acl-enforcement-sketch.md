# Membership ACL enforcement sketch (living)

**Owner:** update when any story adds a list-scoped operation (same PR updates action matrix + caller map). Spine keeps a discoverability link only.  
**Story:** 1.5.4 · **Governs:** AD-19 (+ Epic 1.5 addendum) · **Practice:** proposed AD-24 (Pair 14)  
**Implements in code:** Story **2.2** (port + homepage/detail/expenses/balances + last-opened). This doc is the **contract only**.

Companion: [`auth-mail-interaction-map.md`](./auth-mail-interaction-map.md) (session ≠ Import Session).  
Story-close habit: [`story-close-overview-checklist.md`](../../../implementation-artifacts/story-close-overview-checklist.md)

---

## Overview (choke path)

```mermaid
flowchart TD
  Route["FastAPI list-scoped route"]
  Auth{"require_authenticated_user"}
  Unauth["401 unauthenticated"]
  App["Application use-case"]
  Port["authorize_list_access\n(acting_user_id, list_id, action)\n→ ListAccessGrant"]
  Repo["List-scoped repository method\n(requires ListAccessGrant — no bare list_id)"]
  Deny["Route maps denial\nreads → 404 · mutations → 403"]

  Route --> Auth
  Auth -->|missing session| Unauth
  Auth -->|acting_user_id| App
  App --> Port
  Port -->|grant| Repo
  Port -->|deny| Deny
```

**Enforcement layer:** application use-case → **one** domain ACL port. Routes authenticate and map HTTP errors; they are **not** the ACL authority. UI / `proxy.ts` are **not** a second ACL truth.

**Enumeration (homepage):** actor-scoped `list_for_user(acting_user_id)` — **does not** call `authorize_list_access` (no single `list_id`).

---

## Invariants (AD-19 + proposed AD-24 cheat sheet)

| Invariant | Rule |
|-----------|------|
| Membership | User may read/write a list’s ledger and import into it **only** with membership on that list |
| Peers | Members are peers for ordinary ledger/import reads and writes |
| Owner-only | Rename, invite, standing default-split edit |
| Product admin | **None** in v1 — no global bypass |
| Personal list | Ordinary `List` + owner membership at signup — never a separate entity type |
| One path | Single application → domain ACL port path — not ad-hoc per-route `if membership` |
| Grant | Port returns opaque **`ListAccessGrant`** that **binds `list_id`** (and the authorized `action`); list-scoped repos require that grant only and must reject a grant whose `list_id` does not match the call |
| Forbidden mix | Target practice: do **not** mix bare-`list_id` repos with a separate application-only check in the same use case. As-built 2.1 rename is a known gap / migration target — not compliance |
| UI | No second ACL scheme in Next / `proxy.ts` (presence gate ≠ membership) |
| Auth vs Import | Auth **session** (AD-8) ≠ **Import Session** (AD-4 PDF staging) |

Proposed AD-24 is **review guidance** (Pair 14) — required practice for Epic 2. Not yet a formally renumbered spine AD unless Winston promotes it separately.

---

## Canonical port

### Signature

```text
authorize_list_access(acting_user_id, list_id, action) -> ListAccessGrant
```

- **`action`:** stable string literals from the action matrix below (an `Enum` of those same values is fine — do not invent a parallel vocabulary).
- **Allow:** returns opaque `ListAccessGrant` that binds at least `list_id` (+ authorized `action`). Carry into every list-scoped repo call **for that use case only** — do not reuse across requests, lists, or actions.
- **Deny:** raises domain errors mapped by the route (see Error / disclosure policy). Never return a “soft” / partial grant.
- **Fail closed:** unknown `action` → deny (never default-allow). Internal/port errors (e.g. DB failure while checking membership) → deny / propagate as failure — never invent a grant.

### Port home (Story 2.2)

| Piece | Placement |
|-------|-----------|
| Protocol + `ListAccessGrant` type | `api/application/ports.py` (or the established application port module) |
| Policy implementation | Isolated from FastAPI and SQLAlchemy (domain/application — no route/ORM imports) |
| Invocation | Application services only |

### Action vocabulary

Stable string literals (or an enum of the same names) from the matrix below.

**Aliases:** `read_expenses` ≡ `read_ledger`, `write_expense` ≡ `write_ledger`, and `set_split_override` ≡ `write_ledger` at the port — these names authorize the same capability. Callers may pass either; Epic 3 endpoints may expose the expense-named aliases while the port treats them as synonyms of the ledger actions. Story 2.6 uses `set_split_override` for clarity on the override write surface.

---

## Action matrix

### Member-sufficient (per-list port)

| Action | Notes |
|--------|-------|
| `read_list` | List detail shell |
| `read_expenses` | Synonym of `read_ledger` |
| `read_balances` | Balance stub / settle strip reads |
| `read_ledger` | Canonical ledger read |
| `write_expense` | Synonym of `write_ledger` |
| `write_ledger` | Canonical ledger write (member-gated **mutation**) |
| `set_split_override` | Synonym of `write_ledger` (Story 2.6 item/receipt overrides) |
| `import_to_list` | Import into list (Epic 4+; member-gated **mutation**) |
| `set_last_opened_list` | Remembered list preference (member-gated **mutation**) |
| _(future)_ peer settle participation | Same port; add action when Epic 3 settle lands |

### Owner-required (per-list port)

| Action | Notes |
|--------|-------|
| `rename_list` | As-built 2.1; migrate to shared port + grant |
| `invite_member` | Story 2.3+ |
| `edit_default_split` | Story 2.5 |

### Forbidden

- Product-admin / global bypass roles
- UI-only ACL as authority
- Treating homepage enumeration as a per-list `authorize_list_access` call

---

## Enumeration vs per-list ACL

| Operation | Mechanism | Calls `authorize_list_access`? |
|-----------|-----------|--------------------------------|
| Homepage / “lists I belong to” | `list_for_user(acting_user_id)` | **No** |
| Any single-`list_id` read/write | Port → `ListAccessGrant` → repo | **Yes** |
| Create owned list | Seeds owner membership; no prior membership check | **No** (create establishes membership) |

---

## Story caller map

### 2.1 (as-built today)

| Operation | Today | Sketch stance |
|-----------|-------|---------------|
| `POST /lists` create | `CreateOwnedListService` seeds owner membership | Keep — no ACL check needed to create |
| `GET /lists` | `ListMembershipsService` → `list_for_user` | Keep actor-scoped enum pattern |
| `PATCH /lists/{id}` rename | Ad-hoc in `RenameListService`: membership + `owner_id` check; repos still take bare `list_id` | **Migration target** for shared port + `ListAccessGrant`; do **not** silently change HTTP behavior in this docs story |

### 2.2 (must implement against this contract)

| Operation | Must call |
|-----------|-----------|
| Homepage membership listing | `list_for_user(acting_user_id)` only |
| List detail | `authorize_list_access(..., "read_list")` → grant → repo |
| Expenses / balances stubs | `authorize_list_access(..., "read_expenses")` or `"read_balances"` → grant → repo |
| Set last-opened list | `authorize_list_access(..., "set_last_opened_list")` → grant; denial → **403** |
| First-paint revalidation | `authorize_list_access(..., "read_list")` for remembered `list_id` (per-list grant path — not homepage enum) |

### Later (name only — same port, new actions as needed)

| Story / area | Actions |
|--------------|---------|
| 2.3 invite | `invite_member` (owner) |
| 2.5 default split | `edit_default_split` (owner) |
| 2.6 overrides | `set_split_override` / `write_ledger` (member write); reads via `read_ledger` |
| Epic 3 ledger | `read_ledger` / `write_ledger` (+ expense synonyms) |
| Epic 4 import | `import_to_list` |

**Living rule:** any story adding a list-scoped operation updates this sketch’s action matrix and caller map in the **same PR**.

---

## Error / disclosure policy (locked)

| Case | HTTP | Domain error → wire |
|------|------|---------------------|
| Unauthenticated | **401** | Existing session gate |
| List-scoped **reads** (detail, expenses, balances, ledger reads, any membership-gated **read**): missing list **or** authenticated non-member | **404** | Raise/map `ListNotFoundError` (or equivalent) → `{"detail": "List not found.", "code": "list_not_found"}` — same body for missing ≡ non-member. Do **not** use 403 for these reads |
| Member-gated **mutations** (`set_last_opened_list`, `write_ledger`, `write_expense`, `import_to_list`): missing/non-member | **403** | `NotListMemberError` → `{"detail": "You do not have access to this list.", "code": "not_list_member"}` |
| Owner-only action (`rename_list`, `invite_member`, `edit_default_split`): missing list **or** authenticated non-member | **403** | Same as member-gated mutation → `not_list_member` (as-built rename precedent) |
| Authenticated **member** who is not owner on owner-only action | **403** | `NotListOwnerError` → `{"detail": "<owner message>", "code": "not_list_owner"}` — do **not** collapse into not-found |

**Cross-endpoint note (intentional tradeoff):** Reads hide existence (404). Mutations return 403 `not_list_member` for missing ≡ non-member. A caller who can hit both a list-scoped read and a member-gated mutation for the same `list_id` can distinguish “exists but forbidden” via the mutation status. Anti-enumeration here prioritizes **read** surfaces; do not “fix” this by returning 404 on mutations without an explicit policy-change story (that would also change 2.1 rename).

**Do not** silently change 2.1 rename behavior in this docs-only story (as-built remains 403 `not_list_member` for missing/non-member on rename).

---

## As-built gap → target

| Layer | Path | Role today | Target |
|-------|------|------------|--------|
| Auth gate | `api/api/deps.py` `require_authenticated_user` | Session → UUID; docstring still says “membership ACL = Epic 2” | Auth only; ACL is the next hop |
| List routes | `api/api/routes/lists.py` | Membership-filtered `GET /lists`; create; rename owner-only (`ListNotFoundError`+`NotListMemberError` → 403; `NotListOwnerError` → `not_list_owner`) | Routes call services that call ACL — routes are not the ACL |
| Application | `api/application/lists.py` | Create / ad-hoc rename / enum | Rename migrates to shared port; 2.2 adds use-cases |
| Ports | `api/application/ports.py` | Email/signup ports only today | 2.2 adds `authorize_list_access` + `ListAccessGrant` |
| Repo | `ListRepository` | `get_list(list_id)`, `update_list_name(list_id, …)` bare ids | List-scoped methods require `ListAccessGrant` (assert grant.`list_id`); enum stays `list_for_user(actor)` |
| Persistence | `adapters/persistence/…` | `role` `"owner"` \| `"member"`; `uq_list_membership` | No role/schema redesign in sketch |
| Errors | `api/domain/errors.py` | `NotListMemberError`, `NotListOwnerError`, `ListNotFoundError` (all exist today) | Reads → 404 via `ListNotFoundError` body; mutations → 403 `not_list_member`; owner deny → 403 `not_list_owner` |
| UI / BFF | `ui/app/lists/*`, `ui/app/api/lists/*`, `ui/proxy.ts` | Lists BFF; proxy presence-only; `/api/lists` public at proxy | UI never becomes second ACL truth |

**Honest status:** Sketch = **target contract**. 2.1 has membership-filtered listing + ad-hoc rename checks only. **2.2 implements** the port — do not pretend compliance already exists.

---

## Test contract (owned by Story 2.2)

- Domain allow/deny TDD for the ACL port (incl. unknown action → deny; grant/`list_id` mismatch rejected at repo)
- Postgres multi-user isolation: list enum + expenses/balances deny
- Non-member **read** → **404** with `list_not_found` body
- `set_last_opened_list` non-member → **403** `not_list_member`
- Member-gated **writes** (`write_ledger` / `import_to_list`) non-member → **403** `not_list_member` (assert when those endpoints land; pattern locked here)

---

## What not to break / anti-patterns

**Preserve**

- Personal list = ordinary `List` + owner membership
- Peer members for ordinary reads/writes
- Actor-scoped homepage enum (not forced through per-list port)
- Auth session cookie path (AD-8) separate from Import Session (AD-4)
- 2.1 rename HTTP codes until an explicit policy-change story

**Do not**

- Implement the ACL port “while sketching” on the docs branch
- Per-route membership copies without the shared port
- Bare-`list_id` repos + application-only check (Pair 14) in **new** use cases
- Homepage enum as `authorize_list_access(..., list_id=?)`
- UI / `proxy.ts` as the security boundary
- Product-admin or owner-vs-viewer roles for ordinary expense reads
- **403** on list-scoped **reads** for non-members
- **404** on `set_last_opened_list` / rename / write mutations for non-members without an explicit policy change story
- Soft grants, grant reuse across lists/actions, or default-allow on unknown `action`
- Confuse auth session with Import Session

---

## Related docs

| Doc | Role |
|-----|------|
| [`ARCHITECTURE-SPINE.md`](./ARCHITECTURE-SPINE.md) AD-19 | Invariant + pointer here |
| [`reviews/review-adversarial-divergence.md`](./reviews/review-adversarial-divergence.md) Pair 14 | Proposed AD-24 |
| [`2-2-lists-homepage-membership-scoped-access.md`](../../../implementation-artifacts/2-2-lists-homepage-membership-scoped-access.md) | Primary consumer |
| [`auth-mail-interaction-map.md`](./auth-mail-interaction-map.md) | Auth/session map (orthogonal) |
| [`1-5-4-membership-acl-enforcement-sketch.md`](../../../implementation-artifacts/1-5-4-membership-acl-enforcement-sketch.md) | This story file |
