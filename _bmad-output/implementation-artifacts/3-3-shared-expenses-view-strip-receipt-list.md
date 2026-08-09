---
baseline_commit: 16691e146e834dd9c88c2a1af70fb824392ab6c4
---

# Story 3.3: Shared-expenses view — strip + receipt list

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member,
I want the shared-expenses surface to lead with a Soft-Ledger settle strip and newest-first receipts,
so that I can see who owes whom at a glance (J2).

## Acceptance Criteria

1. **Given** I am a member of a list
   **When** I open shared-expenses for that list
   **Then** I see the Soft-Ledger balance strip island first (who-line + hero amount polarity owe/owed when totals exist) and receipts below newest-first (FR-38, FR-42, UX-DR4/5)
   **And** non-members cannot open it (FR-8)

2. **Given** there are no receipt items yet
   **When** I open the view
   **Then** the settle strip remains primary and the receipts area can be empty without celebration chrome (UX-DR24)

3. **Given** nets are zero / settled
   **When** the strip renders
   **Then** it shows a clear even/zero state without celebration (UX-DR24)

4. **Given** phone or desktop viewport
   **When** I use the view
   **Then** IA is the same; desktop is wider Soft-Ledger, not a separate dashboard (UX-DR20, NFR-7)
   **And** copy stays plain/direct CRC voice (UX-DR17); no settlement-recording CTA

5. **Given** totals are not yet computed (before Story 3.4)
   **When** the strip renders
   **Then** layout and empty/zero states still work; live who-owes-whom numbers wire in 3.4

## Tasks / Subtasks

- [x] Task 0: Confirm hard prerequisites (do not invent parallel stacks)
  - [x] **Branch:** create `feat/3/3-3-shared-expenses-view-strip-receipt-list` from `main` @ `baseline_commit`. One story per branch (AD-13)
  - [x] **Mandatory reads:** this story + `project-context.md` (AD-12, AD-21, i18n) · 3.2 completion notes (current `page.tsx` shape, `formatCrcAmount`/`asExpenses` helpers) · 3.1 completion notes (Soft-Ledger primitives) · EXPERIENCE.md "Settle-up strip" component pattern + State Patterns table + J2. Dev Notes below already distill the rest — do not re-read the whole epic pack unless stuck
  - [x] **Hard deps on tip (all already shipped, unmodified):** 3.1 Soft-Ledger primitives (`BalanceStrip`, `Hint`, `ReceiptRow`) · 3.2 `ui/app/lists/[listId]/page.tsx` (mounts a hardcoded-neutral `BalanceStrip` today) + `formatCrcAmount()` · the already-existing `GET /lists/{list_id}/balances` stub endpoint, its `read_balances` ACL, and the BFF passthrough at `ui/app/api/lists/[listId]/balances/route.ts`
  - [x] **Scope gate:** UI-only wiring of the strip to the existing balance stub across its owe/owed/zero/error-fallback states, plus a stale-Hint fix and ACL regression tests. **Out:** any real settle-up computation or per-member breakdown (Story 3.4 — do **not** touch `PLACEHOLDER_BALANCE_CRC` or write settle math), FX (3.5), incomplete-disclosure banner (3.6), Simplify, settlement-recording CTA (AD-21, never)

- [x] Task 1: Wire live balances into the strip — no backend changes (AC: #1, #3, #5)
  - [x] In `ListDetailPage`, add a 4th parallel server-side fetch alongside `default-split` / `expenses` / `members` to `${getApiInternalUrl()}/lists/{listId}/balances`; parse `{ list_id, balance_crc }` with the same defensive-guard style as `asDefaultSplit` / `asExpenses` (reject non-string fields); on non-2xx or parse failure set a new `balancesLoadError` flag (mirrors `splitLoadError`)
  - [x] Compute tone with the **existing exported** `balanceTone(balance_crc)` from `../listsClient` (already used by the homepage `ListsPanel.tsx`) — do not write a second tone classifier
  - [x] Map tone → `BalanceStrip` `polarity`: `"zero"` → `"neutral"`, `"owe"` → `"owe"`, `"owed"` → `"owed"`
  - [x] **`who` text branches on receipts, not just tone** — the two empty ACs are distinct states, not one:
    - `expenses.length === 0` → `who={t.detailSettleEmpty}` ("No balances yet."), `amount="—"` (AC #2 — a genuinely empty list, nothing entered yet)
    - `expenses.length > 0` → `who` = the tone label `t.balanceOwe` / `t.balanceOwed` / `t.balanceZero`, `amount={formatCrcAmount(balance_crc)}` (AC #3 — receipts exist; strip reflects the actual computed net, "Settled" when it's zero)
    - Do **not** fabricate a per-counterparty sentence like DESIGN.md's aspirational "You owe Partner ₡42,500" — the stub API returns one flat `balance_crc` with no counterparty identity; that lands with real settle math in Story 3.4
  - [x] `amount` formatting: `formatCrcAmount(balance_crc)` (reuse the existing helper already used for receipt amounts) — never a raw unformatted number, never `"… CRC"` suffix voice (patched away in 3.2 review). Note: the homepage (`ListsPanel.tsx`) still shows the raw `balance_crc` string unformatted — that's a pre-existing, out-of-scope inconsistency; don't "fix" the homepage as unplanned scope creep, and don't copy its unformatted pattern here
  - [x] On `balancesLoadError`: keep the strip visible (never blank it) — fall back to `who={t.loadError}`, `amount="—"`, `polarity="neutral"`. This mirrors how `splitLoadError` / `expensesLoadError` / `membersLoadError` already surface `t.loadError` elsewhere on this same page for a fetch failure. Do **not** reuse `detailSettleEmpty` for this — a failed fetch is not the same claim as "no balances yet," and telling the user they have no balance when we simply couldn't load it is misleading
  - [x] Never pass a `BalanceStrip` `action` prop (CTA slot) — no settlement-recording control exists in v1 (AD-21)

- [x] Task 2: Fix the stale always-on empty-state Hint (AC: #2, #3)
  - [x] `<Hint>{t.detailHintEmpty}</Hint>` ("Shared expenses will land here.") currently renders unconditionally, even once receipts exist — factually wrong copy once data is present. Gate it: render only when `expenses.length === 0`; omit entirely otherwise. DESIGN/EXPERIENCE do not specify a non-empty hint — don't invent one
  - [x] Confirm no celebration chrome (emoji, confetti, exclamation streaks) is introduced anywhere in the empty or zero/settled states — plain Warm Balance tokens only (UX-DR24, UX-DR17)

- [x] Task 3: Confirm existing guarantees — no new backend work (AC: #1 non-member clause, #4)
  - [x] Non-member access: `GET /lists/{list_id}/balances` already denies via the existing `read_balances` → 404 `list_not_found` ACL pattern (`api/domain/list_access.py`); the RSC page already 404s on the initial `/lists/{listId}` detail fetch before any balances call happens for non-members. **No code change needed** — cover with a regression test in Task 4
  - [x] Desktop/phone: the page already renders one IA with no separate desktop branch — keep it that way; do not add a second "dashboard" layout
  - [x] Voice: `formatCrcAmount` already renders plain `₡…` — reuse it for the strip amount too, don't regress to a bank-jargon string

- [x] Task 4: Tests + CI (AC: #1–#5)
  - [x] `ui/components/soft-ledger/soft-ledger.test.tsx`: extend the `BalanceStrip` cases to cover `polarity="owed"` and `polarity="neutral"` (today only `"owe"` is asserted) — locks the primitive contract this story leans on
  - [x] **New:** BFF coverage for `ui/app/api/lists/[listId]/balances/route.ts` — it currently has **zero tests** despite sitting inside the vitest `coverage.include` glob (`app/api/**/*.ts`, see `ui/vitest.config.mts`). Add a case to `ui/app/api/lists-invites.bff.test.ts` (or a new colocated `*.bff.test.ts`) mirroring the existing `GET /api/lists` cookie-forwarding smoke test — **stale note:** verified this coverage already exists (`lists-invites.bff.test.ts` → "GET balances / expenses / default-split / members forward", added in 3.1/5cec5de); `npx vitest run --coverage` shows `[listId]/balances/route.ts` at 90% stmts / 88.88% lines. No duplicate test added
  - [x] Add regression coverage for the page-level behavior this story changes: balances-tone → strip props mapping (owe/owed/zero/error-fallback), conditional Hint, and the non-member 404 path. `app/lists/**` is not in the coverage `include` glob, so this isn't a CI gate — but zero coverage on logic this story just introduced is a real regression risk; if rendering the async RSC directly is awkward in vitest, extract the pure tone→props mapping into a small exported helper (colocated in `page.tsx` or `listsClient.ts`) and unit-test that helper directly, the same way `balanceTone` itself is already tested
  - [x] i18n: EN+ES parity unaffected — no new keys are strictly required (reusing `balanceOwe`/`balanceOwed`/`balanceZero`/`detailSettleEmpty`). If `detailSettleTitle` ("Settle up"/"Liquidar") stays unused after this story, remove it rather than leave dead copy sitting next to the labels actually wired in
  - [x] `npm run typecheck` + `lint` + `test` (+ `test:coverage`) — note the 60% floor only gates `lib/**` + `app/api/**`, which is exactly why the new balances-route test matters; `page.tsx` itself isn't gated but should still get the regression coverage above
  - [x] `api`: no new/changed tests needed — no `api/` changes in this story. Confirm `api/tests/test_lists_integration.py` / `test_list_access_domain.py` balances assertions still pass unmodified

### Review Findings

- [x] [Review][Patch] Hint renders during expenses fetch error, creating conflicting UX [ui/app/lists/[listId]/page.tsx:334] — Fixed: added `&& !expensesLoadError` guard
- [x] [Review][Patch] Empty string balanceCrc not coalesced, causing invalid tone detection [ui/app/lists/[listId]/page.tsx:147] — Fixed: use `balanceCrc?.trim() || "0"`
- [x] [Review][Patch] Unhandled JSON parse error in balancesRes.json() [ui/app/lists/[listId]/page.tsx:278] — Fixed: wrapped in try-catch
- [x] [Review][Patch] Type coercion risk: balance_crc may arrive as number, not string [ui/app/lists/[listId]/page.tsx:70-77] — Fixed: coerce to string with `String(row.balance_crc)`

## Dev Notes

### Critical product pins

| Pin | Rule |
|-----|------|
| Real settle math | **Not this story.** `balance_crc` stays the existing `"0"` stub (`PLACEHOLDER_BALANCE_CRC`, `api/application/lists.py`) until Story 3.4. 3.3 only makes the UI correctly render *whatever the stub currently returns* through the full owe/owed/zero/error state machine, so 3.4 needs zero UI changes when it starts returning real signed amounts |
| Per-member "who" | The stub API has no counterparty identity — use the flat tone labels (`balanceOwe`/`balanceOwed`/`balanceZero`), not a fabricated name sentence. DESIGN.md's "You owe Partner ₡42,500" example is the aspirational full picture once 3.4 lands |
| Non-member ACL | Already enforced end-to-end (`read_balances` → 404 `list_not_found`, and the page already 404s before the balances fetch runs) — verify with a test, don't re-implement |
| Route | "Shared-expenses" in EXPERIENCE.md **is** `ui/app/lists/[listId]/page.tsx` — there is no separate route to create |
| Coverage floor | `ui/vitest.config.mts` `coverage.include` = `lib/**` + `app/api/**` only. `page.tsx` / `app/lists/**` isn't gated by the 60% threshold, but the untested `balances/route.ts` **is** inside that glob and currently contributes 0-covered lines to it |
| Settlement CTA | Never — AD-21. No `action` prop on `BalanceStrip` in this story |

### Strip state machine (this story)

| State | Condition | `who` | `amount` | `polarity` |
|-------|-----------|-------|----------|------------|
| Empty list (AC #2) | `expenses.length === 0` | `t.detailSettleEmpty` ("No balances yet.") | `"—"` | `neutral` |
| Settled / zero net (AC #3) | `expenses.length > 0` and tone `"zero"` | `t.balanceZero` ("Settled") | `formatCrcAmount(balance_crc)` | `neutral` |
| Owe / owed (AC #1, real numbers land in 3.4) | tone `"owe"` / `"owed"` | `t.balanceOwe` / `t.balanceOwed` | `formatCrcAmount(balance_crc)` | `owe` / `owed` |
| Fetch failed | `balancesLoadError` | `t.loadError` | `"—"` | `neutral` |

These are four distinct, mutually exclusive states — don't collapse "empty" and "settled" into one, and don't reuse the empty-state copy for a load failure.

### Current codebase state (UPDATE vs NEW)

**Reuse — do not reinvent:**

| Surface | Path / symbol |
|---------|----------------|
| Balance stub endpoint | `GET /lists/{list_id}/balances` → `ListBalancesStubResponse {list_id, balance_crc}` (`api/api/routes/lists.py:409`, `api/api/schemas/lists.py:99`) — always returns `"0"` via `GetListBalancesStubService` / `PLACEHOLDER_BALANCE_CRC` (`api/application/lists.py`). Already ACL-checked (`read_balances`, member-read → 404 for non-members) and already tested (`test_lists_integration.py`, `test_list_access_domain.py`) |
| BFF passthrough | `ui/app/api/lists/[listId]/balances/route.ts` — already exists, already forwards cookies correctly, currently **unused by any UI code** and **untested** |
| Tone classifier | `balanceTone(balance_crc)` in `ui/app/lists/listsClient.ts:199` — already used by the homepage `ListsPanel.tsx` for the same "0"-stub balance; returns `"owe" \| "owed" \| "zero"` |
| Homepage pattern to mirror | `ListsPanel.tsx:157-190` — `tone = balanceTone(list.balance_crc)`, label from `t.balanceOwe`/`balanceOwed`/`balanceZero`, CSS class swap. The detail strip should follow the same tone→label logic, just through `BalanceStrip` instead of the homepage's inline span |
| Strip primitive | `ui/components/soft-ledger/BalanceStrip.tsx` — stable, generic, presentational only (`who`, `amount`, `polarity?`, `action?`). **No changes needed to the primitive itself** |
| Amount formatting | `formatCrcAmount()` in `page.tsx` — already used for receipt amounts (plain `₡…` voice, patched in 3.2 review). Reuse verbatim for the strip amount |
| List detail host | `ui/app/lists/[listId]/page.tsx` — server-fetches detail/default-split/expenses/members in parallel today; add balances as a 4th parallel fetch in the same `Promise.all` |
| Receipts | `ReceiptRow` mapping already newest-first, already correct — **not** touched by this story |
| i18n | `ui/lib/i18n/lists.ts` — `balanceOwe`/`balanceOwed`/`balanceZero` (lines 23-25, 88-90) already EN/ES complete; `detailSettleTitle` defined but unused; `detailSettleEmpty`/`detailHintEmpty` currently always-shown placeholders being repurposed by this story |

**Gaps this story closes:**

- `BalanceStrip` on the detail page is 100% hardcoded (`who={t.detailSettleEmpty} amount="—" polarity="neutral"`, unconditional) regardless of real data — the page never fetches `/balances` at all today
- `<Hint>` renders the "will land here" onboarding copy even when receipts already exist
- `ui/app/api/lists/[listId]/balances/route.ts` has zero test coverage despite being inside the CI coverage-floor glob

### Architecture compliance

[Source: `architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **AD-1:** `ui` → HTTP only; this story adds a server-side fetch to the existing `api` endpoint, no new domain/persistence code
- **AD-12:** DESIGN + EXPERIENCE bind look/behavior; Soft-Ledger primitives stay unstyled-kit-free and unmodified — reuse `BalanceStrip` as-is
- **AD-13:** branch `feat/3/3-3-shared-expenses-view-strip-receipt-list`
- **AD-15:** no domain touched → no TDD red/green cycle required; UI test-after is fine. Coverage floor (`lib/**` + `app/api/**`) must not regress — the new balances-route test is what keeps it from regressing
- **AD-19:** `read_balances` membership ACL already implemented and correct (Epic 2) — this story only consumes it
- **AD-21:** v1 settle-up stays computed-shares-only / no payment ledger — this story must not add any settlement-recording affordance or CTA

### File structure requirements

```
api/
  (no changes — /lists/{id}/balances, its ACL, and the stub service are already complete and correct)

ui/
  app/lists/[listId]/page.tsx                 # UPDATE — balances fetch, strip wiring, conditional Hint
  app/lists/listsClient.ts                    # REUSE — balanceTone() unchanged
  lib/i18n/lists.ts                           # UPDATE (maybe) — retire detailSettleTitle if it stays unused
  components/soft-ledger/BalanceStrip.tsx     # REUSE — no changes
  components/soft-ledger/soft-ledger.test.tsx # UPDATE — add owed/neutral BalanceStrip cases
  app/api/lists/[listId]/balances/route.ts    # REUSE — no changes, just finally gets consumed
  app/api/lists-invites.bff.test.ts           # UPDATE (or new sibling *.bff.test.ts) — balances BFF smoke test
```

### Anti-patterns (will fail review)

- Implementing any real settle-up / per-member balance math in this story — that is Story 3.4's job; this story only renders whatever `"0"` (or later, whatever real value) the stub returns
- Fabricating a per-counterparty "who" sentence (e.g. inventing a name) when the API gives none
- Adding a `BalanceStrip` `action`/CTA prop, or any "Mark settled" / settlement-recording copy or control (AD-21)
- Building a second desktop-only layout/component instead of the existing single-IA responsive page
- Re-implementing `balanceTone()` or `formatCrcAmount()` a second time instead of importing the existing ones
- Leaving the `<Hint>` "will land here" copy showing once receipts exist
- Touching `api/application/lists.py` `PLACEHOLDER_BALANCE_CRC` or any `api/` file — this is a UI-only story
- Bank-jargon amount voice (`"0.00 CRC"`) instead of the existing plain `₡…` formatter
- Claiming the coverage floor covers `page.tsx` when it doesn't (`app/lists/**` isn't in `coverage.include`) — don't skip the new balances-route BFF test on that mistaken assumption, since that file *is* in-glob and currently untested

### Previous story intelligence

#### From 3.2 (manual expense + Adjust split) — immediate predecessor

- `page.tsx` already does a `Promise.all` of parallel server-side fetches (`default-split`, `expenses`, `members`) with per-fetch `*LoadError` flags and defensive `as*` type guards — add `balances` as a 4th fetch following the identical pattern, don't restructure the loading flow
- `formatCrcAmount()` already exists and was hardened in 3.2's review pass (plain `₡…`, no `"… CRC"` suffix) — reuse verbatim
- Review pattern to repeat: keep the add-expense form and other chrome working even when one fetch fails (`membersLoadError`/`splitLoadError` render inline error paragraphs, don't blank the whole page) — do the same for `balancesLoadError` (strip falls back to neutral placeholder, doesn't disappear)
- `router.refresh()` after a successful expense create already re-runs this RSC's fetches — once balances is wired in, a newly-added expense will re-fetch `/balances` for free (still `"0"` until 3.4, but the plumbing is correct)

#### From 3.1 (Soft-Ledger primitives)

- `BalanceStrip`/`Hint`/`ReceiptRow`/`TopNav`/`TabBar` are locked, stable, unstyled-kit-free primitives — this story consumes them, does not modify them
- Review patches from 3.1 already fixed focus-visible / `aria-label` issues on these primitives — no known a11y debt to inherit here

### Git intelligence summary

```
16691e1 feat(3.2): manual expense form with Adjust split and member aliases
adb9c6b Merge PR #27 — 3.1 Soft-Ledger
5cec5de feat(3.1): Soft-Ledger tokens, primitives, list chrome
205b7bb Merge PR #26 — 2.6 overrides
dcd3ab7 feat(2.6): item/receipt split overrides domain and API
```

Follow Conventional Commits (`feat(3.3): …`). This story only touches `ui/app/lists/[listId]/page.tsx`, `ui/lib/i18n/lists.ts`, and test files — no `api/` diff expected.

### Latest tech notes

No new libraries or version changes needed — this is pure wiring against already-pinned Next.js 16.2.x / React 19.2.x and the already-existing API endpoint. No web research required for this story.

### Testing requirements

| Layer | Expectation |
|-------|-------------|
| api | None — no `api/` changes. Confirm existing balances tests still pass unmodified |
| BFF (ui) | **New**: smoke test for `balances/route.ts` cookie forwarding + status passthrough (mirrors existing `lists-invites.bff.test.ts` pattern) — closes a real gap in the coverage-floor glob |
| Unit (ui) | `BalanceStrip` owed + neutral polarity cases added to `soft-ledger.test.tsx`; tone→props mapping logic covered (extract a pure helper if RSC rendering is awkward) |
| Coverage | `lib/**` + `app/api/**` 60% floor must not regress; `app/lists/**` not gated but shouldn't ship untested |
| E2E Playwright | Not required |
| Manual | J2 happy path: open a list with existing receipts and confirm strip shows the zero/settled state (since balance is still stub `"0"`), receipts render newest-first, Hint is gone once receipts exist, non-member direct URL access still 404s |

### Project context reference

Follow `_bmad-output/project-context.md`: DESIGN/EXPERIENCE bind over mocks (AD-12); no settlement-recording CTA ever (AD-21); EN+ES parity; one story per branch; before marking `done`, add the story-close how/why overview per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` (team agreement since Epic 1 retro).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 3 / Story 3.3 ACs; FR-38, FR-42, FR-8, UX-DR4/5, UX-DR20, UX-DR24, UX-DR17, NFR-7]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — Settle-up strip component pattern; State Patterns (Empty receipts, Settled/zero net); J2]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — Balance strip component anatomy, owe/owed color rules]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — AD-1, AD-12, AD-13, AD-15, AD-19, AD-21]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/3-2-manual-expense-with-payer-adjust-split-ui.md`]
- [Source: `_bmad-output/implementation-artifacts/3-1-warm-balance-tokens-soft-ledger-primitives.md`]
- [Source: `ui/vitest.config.mts` — coverage.include scope]
- [Source: `api/api/routes/lists.py`, `api/application/lists.py`, `api/domain/list_access.py` — existing balances stub + ACL, read directly during story creation]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx tsc --noEmit` — clean, no errors
- `npx eslint .` — 0 errors, 2 pre-existing warnings unrelated to this story (`SignupForm.tsx` exhaustive-deps, `Select.tsx` aria-invalid)
- `npx vitest run --coverage` — 30 files / 133 tests passed; overall 90.71% stmts / 69.8% branch / 100% funcs / 91.69% lines (floor is 60%); `app/api/lists/[listId]/balances/route.ts` at 90% stmts / 88.88% lines
- `uv run pytest -q` (api) — 184 passed, 95 skipped (integration suites skip without `DATABASE_URL`; Docker was unavailable/unresponsive in this sandbox, so the Postgres-backed integration path — `test_lists_integration.py::test_non_member_reads_return_list_not_found` / `test_member_detail_and_stubs_ok`, both covering `/balances`) could not be exercised locally this session. No `api/` files were touched, and the domain-level ACL unit test (`test_list_access_domain.py`, `read_balances` denial) passed. Flagging for CI to confirm the skipped integration tests.

### Completion Notes List

- Wired the existing `/lists/{id}/balances` stub into `ListDetailPage`'s settle strip as a 4th parallel fetch, following the identical `*LoadError` + defensive `as*` guard pattern used for `default-split`/`expenses`/`members`. No backend changes — `PLACEHOLDER_BALANCE_CRC` stays `"0"` until Story 3.4.
- Extracted the tone→props state machine into an exported pure helper, `balanceStripPropsFrom`, in `page.tsx` (mirrors how `balanceTone` is already tested standalone) so the four mutually-exclusive strip states (empty / settled-zero / owe-owed / fetch-error) are unit-tested without needing to render the async RSC.
- Fixed the stale `<Hint>` — it now only renders while `expenses.length === 0`, instead of unconditionally.
- Removed the unused `detailSettleTitle` i18n key (EN+ES) — confirmed via grep it was referenced nowhere outside `lists.ts`.
- **Stale story note found and verified, not acted on:** Task 4 said the balances BFF route had "zero tests." `git log -S` shows `lists-invites.bff.test.ts`'s `balances.GET` case was actually added in 3.1 (`5cec5de`), before this story was authored. Confirmed via coverage run (90%/88.88%) rather than trusting the story text, and did not add a duplicate test.
- Non-member 404 on `/balances` needed no new code (already ACL-gated via `read_balances` → `list_not_found`) and already has integration coverage (`test_lists_integration.py::test_non_member_reads_return_list_not_found`, loops over `/balances` among other paths) — not re-implemented.
- This worktree's branch (`claude/bmad-sprint-status-65b489`) started 5 commits behind `main` (missing the merged 3.2 PR #28 + follow-up fixes) before work began; fast-forward-merged `main` in first, then branched `feat/3/3-3-shared-expenses-view-strip-receipt-list` from the now-current tip.

## Story-close overview — 3-3-shared-expenses-view-strip-receipt-list

**Request path:**
Browser (RSC page load) → `ui` `ListDetailPage` server-side `fetch` (same-origin, cookie-forwarded) → `api` `GET /lists/{id}/balances` (existing `read_balances` ACL) → `GetListBalancesStubService` → always returns `{list_id, balance_crc: "0"}` today. `ui` maps the response through `balanceTone()` + the new `balanceStripPropsFrom()` into `BalanceStrip` props.

**Key components:**
`ui/app/lists/[listId]/page.tsx` (balances fetch, `asBalances` guard, `balanceStripPropsFrom` helper, strip wiring, conditional `<Hint>`); `ui/lib/i18n/lists.ts` (dead-key removal); `ui/components/soft-ledger/soft-ledger.test.tsx` (owed/neutral `BalanceStrip` cases); new `ui/app/lists/[listId]/page.balanceStrip.test.ts`. No `api/` changes — the stub endpoint, its ACL, and the BFF passthrough already existed and are unmodified.

**Why this shape:**
AD-1/AD-15: UI-only wiring against an already-shipped stub, no domain/persistence touch, so no TDD red/green cycle. AD-21: the strip never gets an `action`/CTA prop — settle-up recording isn't a v1 concept. The tone→props mapping was pulled out to a pure, exported function specifically so the four-state contract (empty / settled / owe / owed / error) is regression-tested without needing to mock `next/headers`/`next/navigation` for a full RSC render.

**What not to break:**
- `balance_crc` stays the `"0"` stub until Story 3.4 — don't wire real settle math here.
- Never fabricate a per-counterparty "who" sentence; the stub has no counterparty identity.
- Never add a `BalanceStrip` `action` prop (AD-21, no settlement-recording CTA, ever).
- `balancesLoadError` must keep the strip visible with `t.loadError`, never reuse `detailSettleEmpty` for a fetch failure.
- `<Hint>` only shows when `expenses.length === 0` — don't regress it back to always-on.

### File List

- `ui/app/lists/[listId]/page.tsx` — modified
- `ui/lib/i18n/lists.ts` — modified
- `ui/components/soft-ledger/soft-ledger.test.tsx` — modified
- `ui/app/lists/[listId]/page.balanceStrip.test.ts` — added

## Change Log

- 2026-08-08 — Story 3.3 implemented: live balances wired into the settle strip (owe/owed/zero/error states), stale empty-Hint fixed, dead `detailSettleTitle` i18n key removed, new pure-helper + primitive test coverage added. No `api/` changes.
