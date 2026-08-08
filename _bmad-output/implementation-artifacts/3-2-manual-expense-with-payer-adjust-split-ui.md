---
baseline_commit: adb9c6bec7276faba0db87092ced9c0b0c62aa68
---

# Story 3.2: Manual expense with payer + Adjust split UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member,
I want to add a manual expense with amount, description, payer, and optional Adjust split,
so that shared spending is logged the same day without waiting for a statement.

## Acceptance Criteria

1. **Given** I am a member of a list  
   **When** I open add manual expense  
   **Then** the form requires amount, description, and payer (FR-21, UX-DR15)  
   **And** payer defaults to me and remains editable (FR-19)

2. **Given** I do not open Adjust split  
   **When** I save  
   **Then** the item uses the list default split (Story 2.5 / 2.6)  
   **And** the row carries `hand` provenance

3. **Given** I open Adjust split  
   **When** I choose whole-line, absolute amounts per member, or percentage  
   **Then** validation matches Story 2.6 rules (100% / sum-to-total) before save

4. **Given** save succeeds  
   **When** I view the list  
   **Then** the item appears newest-first and settle-up figures update once Story 3.3–3.4 are in place (this story may show the new receipt row immediately; strip totals wire when settle math lands)

5. **Given** expense origin (card / Cash / blank)  
   **When** this story is implemented  
   **Then** origin UI is not required yet — leave a clear extension point on the manual expense form  
   **And** Story 4.2 adds card / Cash / blank origin + no-origin filter after cards exist (FR-21)  
   **And** this story must not ship a dead or stub origin control that implies cards exist

6. **Given** I am not a member  
   **When** I attempt to create an expense on that list  
   **Then** the action is rejected (NFR-3)

## Tasks / Subtasks

- [x] Task 0: Confirm hard prerequisites (do not invent parallel stacks)
  - [x] **Branch:** already `feat/3/3-2-manual-expense-with-payer-adjust-split-ui` from `main` @ `baseline_commit` (`adb9c6b…` — includes merged 2.6 + 3.1). One story per branch (AD-13)
  - [x] **Mandatory reads:** this story + `project-context.md` (dates TZ, FR-10, AD-5/6/16) · `2-6-…md` completion pins (resolution + receipt total) · EXPERIENCE Manual expense / J5. Soft-Ledger mount + ACL sketch live under References / Dev Notes — do not re-read the whole epic pack unless stuck
  - [x] **Hard deps on tip:** 2.5 default-split · 2.6 override API + stub `ledger_entries` · 3.1 Soft-Ledger on `ui/app/lists/[listId]/page.tsx`
  - [x] **Scope gate:** create + Adjust-split UI + `hand` + newest-first rows. **Out:** settle math (3.4), live strip (3.3–3.4), FX (3.5), incomplete disclosure (3.6), origin/cards UI or tables (4.1/4.2), payment CTAs (AD-21)

- [x] Task 1: Domain + persistence — expand LEDGER_ENTRY for manual create (AC: #1–#2, #6) — TDD first (AD-15)
  - [x] Alembic revision (never auto-create): extend `ledger_entries` with AD-16 CanonicalLine subset for hand rows:
    - `normalized_description` (text, required for manual) — **column name is `normalized_description`**, not `description` (wire may accept `description` and map at the HTTP edge)
    - `payer_id` (UUID FK → `users.id`, required; **must be current list member**)
    - `provenance` (`hand` | `parser`) — manual create **always** `hand`
    - `line_type` — v1 manual = `purchase` (settle inclusion locked in 3.4 / FR-45)
    - `posted_date` (date) — default **today in `America/Costa_Rica`** as ISO calendar date string; **do not** derive the day from UTC midnight (`project-context` / spine Dates)
    - Nullable stub columns for later import (always NULL on manual create): `product_id`, `external_ref` — **no FK**; do **not** invent a `cards` table
  - [x] **Origin extension (AC #5):** schema/UI code comment or typed optional future fields only — **do not** add `origin_kind` / `origin_card_id` columns (no cards model until 4.1; FK now invents Epic 4)
  - [x] Keep existing stub columns: `amount NUMERIC`, ISO `currency`, optional `receipt_id`, timestamps
  - [x] **Currency pin:** **CRC only** on manual create (J5). Non-CRC → structured 422. FX = Story **3.5** (AD-7)
  - [x] Pure domain validation: positive amount (`Decimal` from string), non-empty `normalized_description`, payer ∈ member set
  - [x] Money: `Decimal` only — never `float` (AD-5). Wire amounts as **strings**. Domain free of FastAPI / SQLAlchemy (AD-1)

- [x] Task 2: Application + API — create expense + list expenses (AC: #1–#4, #6)
  - [x] Replace empty stub of `GET /lists/{list_id}/expenses` with real rows ordered **`created_at DESC`** (newest-first; do not order by `posted_date` alone when all are “today”). Preserve BFF path `ui/app/api/lists/[listId]/expenses/route.ts`
  - [x] GET item shape for Soft-Ledger `ReceiptRow` mapping: `normalized_description` → `title`, `posted_date` → `when`, amount string → `amount` (plus `id`, `payer_id`, `provenance`, `currency`, `created_at`)
  - [x] Add create:
    ```text
    POST /lists/{list_id}/expenses
      ACL: write_expense / write_ledger (member mutation → 403 not_list_member)
      body: {
        amount: str,                 # Decimal string
        currency: "CRC",             # CRC-only this story
        description: str,            # wire alias → persisted normalized_description
        payer_id: UUID,              # default = actor in UI; server validates membership
        split_override?: {           # omit when Adjust split closed → list_default
          kind: whole_assignee | absolute_amounts | percentage,
          assignee_id? | amounts? | percentages?
        }
      }
      → 201 {
        id, list_id, amount, currency, description,   # description mirrors normalized_description
        payer_id, provenance: "hand", line_type: "purchase",
        posted_date, created_at, …
      }
    ```
  - [x] **Atomicity (binding):** same Session/transaction: `create_ledger_entry` → **`session.flush()`** so the new id is readable → reuse `SetSplitOverride` / `upsert_split_override` with `subject_kind=item`. Repo today has get-only for ledger — **add** create. Do **not** invent a second allocator
  - [x] When `split_override` omitted / null → **no** override row → allocations `resolved_from=list_default` (AC #2 / FR-10)
  - [x] When present → same fail-loud rules as 2.6 (`invalid_split_override`, % ≠ 100, absolute sum ≠ total, non-member ids)
  - [x] **Payer ≠ remainder sink** (Pair 9 / AD-6). Remainder → list creator (`owner_id`)
  - [x] Non-member create → **403** `{ code: "not_list_member" }` (NFR-3). Read deny → existing 404 `list_not_found` pattern
  - [x] **Member roster for pickers:**
    ```text
    GET /lists/{list_id}/members → { members: [{ user_id, email }] }
    ```
    ACL: `read_list`. No profiles/avatars
  - [x] Snake_case DTOs; structured JSON 4xx; session cookie auth (AD-8)

- [x] Task 3: UI BFF + client — manual expense form + Adjust split (AC: #1–#5)
  - [x] Same-origin BFF:
    - `POST` + keep `GET` on `ui/app/api/lists/[listId]/expenses/route.ts`
    - `GET` `ui/app/api/lists/[listId]/members/route.ts` (recommended)
  - [x] Extend `listsClient.ts`: `createExpense` / `fetchExpenses` / `fetchListMembers`. **Error map:** for 422 with `invalid_split_override` (and create validation codes), surface API `detail` into the form error — do not collapse to a generic key like default-split today
  - [x] New **client** `ManualExpenseForm.tsx` (CSS modules; Soft-Ledger tokens; no Tailwind/shadcn):
    - Props: `listId`, `currentUserId`, `members: {user_id, email}[]`, messages — **pass `currentUserId` from RSC** (`fetchSession()` is server-only via `next/headers`; never call it from the client form)
    - Fields: amount, description, payer `<select>` defaulting to `currentUserId`; options from members emails
    - Copy InviteForm **control flow** (`pendingRef`, BFF via `listsClient`, injected messages). **Submit CTA = Soft-Ledger `PrimaryButton`** — do **not** copy `lists.module.css` `.primary`
    - **Adjust split** disclosure: collapsed by default (`<details>`/`<summary>` or `aria-expanded`+`aria-controls`). Collapsed submit → omit `split_override`. Open → whole-line | absolute | percentage; optional client pre-check; **server SoT** for validation strings
  - [x] **Origin:** code comment / prop slot only — no control, no disabled dropdown, no “Coming soon” (AC #5)
  - [x] Mount on `ui/app/lists/[listId]/page.tsx` (RSC):
    - **(a)** Server-fetch GET expenses on load → map to newest-first `ReceiptRow`s (empty state OK)
    - **(b)** After successful create: `router.refresh()` and/or local prepend of the 201 body — **do not** assume the list updates with no refresh path
    - Place add-expense below strip / near receipts — **not** over hero amount. Preserve Invite + DefaultSplit chrome
  - [x] Strip: keep placeholder settle (3.3–3.4). Never invent client settle numbers or “Mark settled” (AD-21)
  - [x] i18n EN+ES in `ui/lib/i18n/lists.ts` only. Plain CRC voice (UX-DR17)
  - [x] A11y: labels; `aria-invalid` / `aria-describedby`; keyboard disclosure; focus-visible (3.1 review)

- [x] Task 4: Tests + CI (AC: #1–#6)
  - [x] **api domain TDD:** create validation; CRC-only; Costa Rica `posted_date`; payer membership; `hand` + `normalized_description`; no-override → `list_default`; each override kind; bad % / absolute reject; non-member denied
  - [x] **api integration (Postgres 16):** POST → GET newest-first by `created_at`; ACL 403; override failure rolls back entry (flush+same txn)
  - [x] **ui vitest:** form defaults payer from `currentUserId` prop; collapsed omits override; open modes map payload; PrimaryButton submit; error detail surfacing smoke; EN+ES keys
  - [x] BFF smoke for POST expenses + GET members
  - [x] `npm run typecheck` + `lint` + `test` (+ `test:coverage` 60% include floor); api pytest green
  - [x] No Playwright. Fixtures: generic emails only

### Review Findings

- [x] [Review][Patch] Add Soft-Ledger Select/listbox primitive and use it for payer + assignee (replace native OS `<select>`) [ui/components/soft-ledger/ + ManualExpenseForm.tsx] — Decision: (B) full kit-bound open/closed control in Soft-Ledger tokens; do not ship native dropdown chrome on the Soft-Ledger surface.

- [x] [Review][Patch] Silent members/expenses fetch failure hides the add-expense form and shows empty receipts [ui/app/lists/[listId]/page.tsx:179]
- [x] [Review][Patch] `noValidate` bypasses browser-required amount/description/payer (AC #1) [ui/app/lists/ManualExpenseForm.tsx:115]
- [x] [Review][Patch] Form fields use inventing borders instead of Warm Balance `var(--border)` [ui/app/lists/ManualExpenseForm.module.css:22]
- [x] [Review][Patch] Receipt amounts render as `"10.00 CRC"` instead of plain CRC `₡…` voice [ui/app/lists/[listId]/page.tsx:237]
- [x] [Review][Patch] Form heading/label weights (650/600) exceed Soft-Ledger medium-light manner [ui/app/lists/ManualExpenseForm.module.css:18]
- [x] [Review][Patch] `asExpenses` accepts incomplete rows; missing currency can render as `"undefined"` [ui/app/lists/[listId]/page.tsx:64]
- [x] [Review][Patch] Successful save leaves Adjust-split mode/amounts/percentages stale for the next submit [ui/app/lists/ManualExpenseForm.tsx:99]
- [x] [Review][Patch] Domain accepts amount precision/scale beyond `Numeric(18,4)` quantum [api/domain/expenses.py:48]
- [x] [Review][Patch] Description has no max length before TEXT persistence [api/domain/expenses.py:57]
- [x] [Review][Patch] Open Adjust absolute/percentage can POST empty strings and hit generic Decimal parse errors [ui/app/lists/ManualExpenseForm.tsx:70]
- [x] [Review][Patch] `CreateManualExpenseService` falls back to `nullcontext()` when `atomic` missing — prefer requiring savepoint [api/application/expenses.py:143]

- [x] [Review][Defer] Dual expenses list entry points (`ListExpensesService` vs stub still calling `list_ledger_entries`) [api/application/lists.py] — deferred, pre-existing/test bridge
- [x] [Review][Defer] `list_ledger_entries` silently skips rows with NULL hand fields [api/adapters/persistence/repositories.py] — deferred, intentional for 2.6 stub seeds

## Dev Notes

### Critical product pins

| Pin | Rule |
|-----|------|
| FR-10 “done” | Domain/API was 2.6; **user-visible** Adjust split lands **here** (`project-context.md` gate) |
| J5 → J2 slice | Demo path is **3.2–3.4** contiguous; 3.2 shows receipt row now; strip math later |
| UX-DR15 vs AC #5 | Full UX-DR15 mentions origin + immediate settle-up. **Epics AC wins:** no origin UI; strip totals deferred to 3.3–3.4 |
| Subject grain | Manual expense = **one** `ledger_entries` row (`subject_kind=item`). Do **not** invent whole-receipt create UI here. Receipt totals remain explicit `receipts.amount` (2.6 completion note) |
| Edit later | FR-21 mentions editing overrides later — **out of scope** for 3.2 (create path only) |
| Payer set | Restrict to **current list members** (server-enforce). Epics silent; this closes the gap |
| Dates | `posted_date` calendar day in **`America/Costa_Rica`** — never UTC-midnight day shift |
| AD-16 column | Persist **`normalized_description`**; wire `description` is an edge alias only |

### Current codebase state (UPDATE vs NEW)

**Reuse — do not reinvent:**

| Surface | Path / symbol |
|---------|----------------|
| Soft-Ledger chrome | `ui/components/soft-ledger/*` (`BalanceStrip`, `ReceiptRow`, `PrimaryButton`, `SectionLabel`, `TopNav`, `TabBar`, `Hint`) |
| List detail host | `ui/app/lists/[listId]/page.tsx` |
| Default split UI / client | `DefaultSplitPanel.tsx`, `listsClient.ts` `fetchDefaultSplit` / `saveDefaultSplit` |
| Invite UI / form pattern | `InviteForm.tsx` — controlled fields, `pendingRef`, injected messages, BFF via `listsClient`. Mirror control flow; **CTA = Soft-Ledger `PrimaryButton`**, not `lists.module.css` `.primary` |
| Split domain | `api/domain/splits.py`, `api/domain/default_split.py` (`apply_percentage_split`) |
| Override use-cases / routes | `api/application/splits.py`, `api/api/routes/splits.py`, `SetSplitOverrideBody` |
| Stub LEDGER_ENTRY | `LedgerEntryModel`, migration `0009_split_overrides` — get-only today; **add** create + flush |
| Expenses stub GET | `GET /lists/{id}/expenses` + BFF `expenses/route.ts` + `GetListExpensesStubService` → **replace stub guts**, keep URL |
| ACL | `authorize_list_access` + `write_expense` alias → `write_ledger` |
| i18n | `ui/lib/i18n/lists.ts` |
| Session | RSC: `fetchSession()` → pass `currentUserId` prop into `ManualExpenseForm` (server-only module) |

**Gaps this story closes:**

- `ledger_entries` lacks `normalized_description` / payer / provenance / `line_type` / `posted_date` (+ nullable `product_id` / `external_ref`)
- No `POST` expenses; GET always returns `[]`; RSC never loads expenses into `ReceiptRow`
- No Adjust-split / manual expense UI; no member email roster for pickers
- No `create_ledger_entry` + flush path for atomic override attach

### Architecture compliance

[Source: `architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` + ACL sketch]

- **AD-1:** Domain pure; ORM in `adapters/persistence`; routes in `api/api`; UI talks HTTP via BFF only
- **AD-5:** `NUMERIC` + ISO 4217; Python `Decimal`; JSON money = strings
- **AD-6:** % remainder → list creator (`owner_id`); never payer
- **AD-8:** httpOnly session cookie + same-origin BFF; never Bearer in `localStorage`
- **AD-12:** DESIGN + EXPERIENCE bind look; kits unstyled only — CSS modules + Warm Balance tokens from 3.1
- **AD-13:** branch `feat/3/3-2-manual-expense-with-payer-adjust-split-ui`
- **AD-15:** Domain create + split validation TDD; UI test-after
- **AD-16:** CanonicalLine field set — this story fills the **hand-row subset** (`posted_date`, `amount`, `currency`, `line_type`, `normalized_description`, `provenance=hand`, nullable `product_id`/`external_ref`); parser rows remain Epic 4
- **AD-19:** Membership ACL; member write for expenses + overrides; owner-only remains rename/invite/default-split
- **AD-21:** No settlement-recording CTA / payment ledger writes
- **Proposed AD-24** (ACL sketch): one `authorize_list_access` → `ListAccessGrant` → grant-bound repos — match existing list/split callers
- **Dates:** ISO calendar dates in `America/Costa_Rica` (spine + project-context)

### File structure requirements

```
api/
  domain/                          # NEW helpers or extend existing — create validation
  application/expenses.py          # NEW (or lists.py extension) — CreateExpense + ListExpenses
  application/splits.py            # REUSE upsert/compute
  adapters/persistence/
    models.py                      # UPDATE LedgerEntryModel
    repositories.py                # UPDATE create/list ledger entries
    migrations/versions/0010_*.py  # NEW
  api/routes/lists.py              # UPDATE POST expenses; replace stub GET; optional GET members
  api/schemas/lists.py             # UPDATE expense DTOs
  tests/                           # NEW domain + integration

ui/
  app/lists/[listId]/page.tsx      # UPDATE — form + live ReceiptRows
  app/lists/ManualExpenseForm.tsx  # NEW (+ module.css + test)
  app/lists/listsClient.ts         # UPDATE
  app/api/lists/[listId]/expenses/route.ts  # UPDATE POST
  app/api/lists/[listId]/members/route.ts   # NEW (recommended)
  lib/i18n/lists.ts                # UPDATE EN+ES
  components/soft-ledger/*         # REUSE — do not rebuild
```

### Anti-patterns (will fail review)

- Origin dropdown / Cash stub / “coming soon” origin control
- Adding `origin_card_id` / cards FK before Story 4.1
- Client `fetchSession()` inside `ManualExpenseForm` (server-only)
- Saving without RSC refresh/prepend path (row never appears)
- Client-side settle/FX/share SoT or filling BalanceStrip with invented numbers
- “Mark settled” / Simplify “paid” copy (AD-21)
- Forking AD-6 / copying percentage remainder into TS or a second Python helper
- Making overrides **owner-only** (2.5 default is owner-only; overrides + expenses are **member** writes)
- Using payer as AD-6 remainder sink
- `float` money / JSON number amounts
- Silent clamp of bad % / absolute sums; swallowing `invalid_split_override` detail in the UI
- Persisting a `description` column instead of `normalized_description`
- Defaulting `posted_date` from UTC midnight
- Tailwind / shadcn / pill CTAs / purple kit / Inter-Roboto brand
- Restyling Invite / DefaultSplit as drive-by; copying `lists.module.css` `.primary` instead of Soft-Ledger `PrimaryButton`
- Bearer tokens in `localStorage`
- Non-CRC manual create without 3.5 FX path
- Creating receipt-group UI or double-writing receipt+item for a single manual line
- Parallel Soft-Ledger i18n module
- Claiming Soft-Ledger component tests satisfy the 60% vitest `include` floor

### Previous story intelligence

#### From 3.1 (Soft-Ledger) — immediate predecessor

- Compose into existing list detail; TabBar destinations locked; Account theme stays on `/account`
- `PrimaryButton` exists for real actions — use it for Save
- Review patches: focus-visible, TabBar i18n `aria-label`, TopNav heading semantics — apply same a11y bar to the form
- Do not rebuild tokens / primitives

#### From 2.6 (overrides API) — hard API dependency

- Routes: `PUT/GET/DELETE .../subjects/{item|receipt}/{id}/split-override` + `GET .../share-allocations`
- Kinds: `whole_assignee` | `absolute_amounts` | `percentage`
- Resolution: `item_override` → `receipt_override` → `list_default`
- Receipt total = **explicit** `receipts.amount` (not sum of children)
- Prefer embedding override on create; if calling PUT separately, still one transaction in application service

#### From 2.5 (list default)

- Standing default `even` | `percentage` only; owner mutates; members read — inheritance when Adjust split closed
- `DefaultSplitResponse.member_ids` available but label-poor — add members+email for 3.2 pickers

### Git intelligence summary

```
adb9c6b Merge PR #27 — 3.1 Soft-Ledger
5cec5de feat(3.1): Soft-Ledger tokens, primitives, list chrome
205b7bb Merge PR #26 — 2.6 overrides
dcd3ab7 feat(2.6): item/receipt split overrides domain and API
```

Follow Conventional Commits (`feat(3.2): …`). Extend `ui/app/lists/*` + `api` hex layers; do not rewrite ACL.

### Latest tech notes

- Next.js **16.2.12** + React **19.2.4** (lockfile pins) — keep CSS modules + vitest; no Tailwind
- Adjust split disclosure: prefer native `<details>`/`<summary>` or `aria-expanded` trigger; validate on blur/submit (not every keystroke); map errors with `aria-describedby`
- Money: `Decimal("10.00")` from strings; wire strings end-to-end

### Testing requirements

| Layer | Expectation |
|-------|-------------|
| Domain (api) | Create + override attach + list_default fallback + CRC-only + payer membership |
| Integration (api) | Postgres create/list/ACL/transaction rollback |
| Unit (ui) | Form defaults, disclosure omit/include override, BFF smoke |
| Coverage | Keep ui 60% include floor; api pytest green |
| E2E Playwright | Not required |
| Manual | J5 happy path on phone-width: add CRC expense, default split, optional Adjust split, row appears; strip still empty OK |

### Project context reference

Follow `_bmad-output/project-context.md`: FR-10 complete only with this UI; Warm Balance / Soft-Ledger kits unstyled; Decimal money; settle = computed shares only (no payment writes); EN+ES; one story per branch; DESIGN/EXPERIENCE bind over mocks.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 3 / Story 3.2 ACs; FR-19, FR-21, NFR-3, UX-DR15]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — Manual expense form; J5]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — Soft-Ledger tokens/components]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-5, AD-6, AD-12, AD-15, AD-16, AD-19, AD-21]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/membership-acl-enforcement-sketch.md`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/2-6-item-and-receipt-split-overrides-domain-api.md`]
- [Source: `_bmad-output/implementation-artifacts/3-1-warm-balance-tokens-soft-ledger-primitives.md`]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-03.md` — 3.2–3.4 slice]

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent router)

### Debug Log References

- Nested savepoint (`repo.atomic()` / `begin_nested`) for create+override — full `session.rollback()` on 422 broke TestClient auth by undoing registration in the outer test txn.

### Implementation Plan

- Domain-first `validate_manual_expense` + Costa Rica date helper; CRC-only / payer ∈ members / `hand` + `purchase`.
- Alembic `0010` expands `ledger_entries`; `CreateManualExpenseService` flushes then reuses `SetSplitOverrideService`.
- UI: Soft-Ledger `PrimaryButton` + `<details>` Adjust split; RSC passes `currentUserId` + members + expenses.

### Completion Notes List

- Manual expense create (CRC, hand, Costa Rica `posted_date`) with optional Adjust split wired to 2.6 override kinds.
- GET expenses returns newest-first rows; Soft-Ledger `ReceiptRow`s refresh after save.
- GET members roster for payer/assignee pickers; no origin control (4.2 extension comments only).
- Tests: domain 8, integration 7, UI form + client + BFF; full api suite 246 passed; ui coverage floor held.

### File List

- `_bmad-output/implementation-artifacts/3-2-manual-expense-with-payer-adjust-split-ui.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `api/adapters/persistence/migrations/versions/0010_manual_ledger_fields.py`
- `api/adapters/persistence/models.py`
- `api/adapters/persistence/repositories.py`
- `api/api/routes/lists.py`
- `api/api/schemas/lists.py`
- `api/application/expenses.py`
- `api/application/lists.py`
- `api/domain/dates.py`
- `api/domain/errors.py`
- `api/domain/expenses.py`
- `api/tests/test_list_access_domain.py`
- `api/tests/test_manual_expense_api.py`
- `api/tests/test_manual_expense_domain.py`
- `ui/app/api/lists-invites.bff.test.ts`
- `ui/app/api/lists/[listId]/expenses/route.ts`
- `ui/app/api/lists/[listId]/members/route.ts`
- `ui/app/lists/ManualExpenseForm.module.css`
- `ui/app/lists/ManualExpenseForm.test.tsx`
- `ui/app/lists/ManualExpenseForm.tsx`
- `ui/app/lists/[listId]/page.tsx`
- `ui/app/lists/listsClient.test.ts`
- `ui/app/lists/listsClient.ts`
- `ui/components/soft-ledger/Select.module.css`
- `ui/components/soft-ledger/Select.tsx`
- `ui/components/soft-ledger/soft-ledger.test.tsx`
- `ui/lib/i18n/lists.ts`

### Change Log

- 2026-08-07: Story 3.2 implemented — manual expense create + Adjust split UI, ledger hand fields, members roster, tests green; status → review.
- 2026-08-07: Code review patches applied — Soft-Ledger Select, CRC voice, load-error surfacing, domain quantum/max length, adjust-reset; status → done.

## Story completion status

Status: **done**

Completion note: Implementation + code-review patches complete (Soft-Ledger Select, CRC ₡ voice, load errors, domain bounds). Deferred: dual list stub path; silent skip of pre-3.2 stub ledger rows.
