---
baseline_commit: 4f6ab9a3e8103c38ef65e33255e33524af8aaa5b
---

# Story 3.1: Warm Balance tokens + Soft-Ledger primitives

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user of the shared-list UI,
I want Warm Balance light/dark tokens and Soft-Ledger primitives in place,
so that settle-up and receipts look like finance-helper—not kit defaults.

## Acceptance Criteria

1. **Given** the `ui` app  
   **When** design tokens are applied  
   **Then** Warm Balance CSS variables exist for light and dark (`background`, `surface`, `text`, `muted`, `border`, `accent`, `on-accent`, `owe`, `owed`) per DESIGN.md (UX-DR1)  
   **And** Petrona + Manrope are loaded with Soft-Ledger type roles; tabular nums for money; no Inter/Roboto as brand (UX-DR2)  
   **And** spacing/shape tokens match Soft-Ledger (`strip-inset`, rounded `sm`/`md`; no pill primary CTAs) (UX-DR3)

2. **Given** these primitives  
   **When** list chrome is rendered  
   **Then** Balance strip, Receipt row, Section label, Top nav, Tab bar (List / Upload / Account), Hint, and Primary button match DESIGN component anatomy (structure may be empty of live data) (UX-DR4–6)  
   **And** depth uses canvas vs surface tonal layering without drop-shadow hierarchy (UX-DR21)  
   **And** theme Light / Dark / System from Story 1.6 drives which token set is active

## Tasks / Subtasks

- [x] Task 0: Confirm hard prerequisites (do not invent parallel stacks)
  - [x] **Branch from `main` at `baseline_commit`** (`4f6ab9a…`) — **not** from `feat/2/2-6-…` or a dirty Epic 2 WIP tree. Branch name: `feat/3/3-1-warm-balance-tokens-soft-ledger-primitives` (AD-13); one story per branch
  - [x] **Mandatory reads before coding:**
    - [`DESIGN.md`](../planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md) frontmatter (colors, typography, rounded, spacing, components) — **binding token/anatomy source**
    - [`.working/directions-2-warm-balance.html`](../planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/.working/directions-2-warm-balance.html) panel **Soft-Ledger hybrid**
    - [`mockups/list-settle.html`](../planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/mockups/list-settle.html) — promoted settle composition
    - [`project-context.md`](../project-context.md) AD-12 / Warm Balance rules
  - [x] Story **1.6** theme (Light / Dark / System) already owns preference persistence + FOUC — **reuse** `PreferencesProvider`; do not fork a second theme store. Theme UI stays on `/account` via `AccountMenu` — do **not** nest Appearance controls in Soft-Ledger chrome
  - [x] Soft-Ledger list detail shell already lives at `ui/app/lists/[listId]/page.tsx` (Story 2.2+) — **compose** primitives into this page; do not invent `(authenticated)/lists/…` or a parallel demo route as the sole acceptance surface
  - [x] Preserve Invite (`InviteForm`) + Default split (`DefaultSplitPanel`) on list detail — Soft-Ledger layout composes **around** them; do **not** restyle/refactor those panels in this story
  - [x] **Scope gate:** this story is **UI-only**. No `api/domain`, no Alembic, no expense write APIs, no settle math, no Adjust-split UI. Story 2.6 is orthogonal (domain/API); 3.1 does not depend on it

- [x] Task 1: Complete Warm Balance + Soft-Ledger design tokens (AC: #1)
  - [x] **Colors already largely correct** in `ui/app/globals.css` as `--wb-*` + legacy aliases (`--background`, `--surface`, `--foreground`, `--muted`, `--border`, `--accent`, `--on-accent`, `--owe`, `--owed`) for `:root`, `html.dark`, and System (`prefers-color-scheme` when no `.light`/`.dark`). **Do not re-pick hexes** — match DESIGN.md exactly:
    | Role | Light | Dark |
    |------|-------|------|
    | background | `#F7F3EC` | `#17140F` |
    | surface | `#FFFCF7` | `#221E17` |
    | text | `#2A241C` | `#F0E9DC` |
    | muted | `#6E6456` | `#A89B88` |
    | border | `#E2D8C8` | `#3A342A` |
    | accent | `#3F6B45` | `#8FBB8E` |
    | on-accent | `#FFFCF7` | `#17140F` |
    | owe | `#A04936` | `#D48B78` |
    | owed | `#2F6E48` | `#7EC794` |
  - [x] **Add** Soft-Ledger spacing CSS vars (4px rhythm + named locks): `--space-1`…`--space-6` (4/8/10/12/14/16px), `--strip-inset: 10px`, `--page-gutter: 10px`, `--nav-x: 14px`, `--row-y: 9px`
  - [x] **Add** shape vars: `--rounded-sm: 8px`, `--rounded-md: 10px`, `--rounded-lg: 12px` (`--rounded-full` reserved — **never** use for primary CTAs)
  - [x] **Add type roles as a 1:1 map from DESIGN.md `typography.*`** — no freestyle type scale. Each role must encode face (`--font-brand` Petrona or `--font-ui` Manrope), `font-size`, `font-weight` (including awkward `550` where DESIGN says so), `letter-spacing`, and `line-height` when specified:
    | Role | Face | Size | Weight | Tracking / line-height |
    |------|------|------|--------|-------------------------|
    | brand | Petrona | 0.66rem | 500 | tracking 0.03em |
    | list-title | Manrope | 0.66rem | 500 | — |
    | strip-who | Manrope | 0.72rem | 500 | tracking 0.02em; lh 1.3 |
    | strip-amount | Petrona | 1.7rem | 500 | tracking −0.03em; lh 1.1 |
    | section-label | Manrope | 0.6rem | 550 | tracking 0.05em; uppercase |
    | body | Manrope | 0.74rem | 400 | lh 1.4 |
    | meta | Manrope | 0.62rem | 400 | — |
    | amount-inline | Petrona | 0.74rem | 500 | — |
    | button | Manrope | 0.66rem | 550 | — |
    | tab | Manrope | 0.58rem | 500 | — |
  - [x] Money surfaces: `font-variant-numeric: tabular-nums`; hierarchy **amount ≫ who ≫ row**
  - [x] Fonts: keep existing `next/font/google` Manrope (`--font-ui`) + Petrona (`--font-brand`) in `ui/app/layout.tsx` — already self-hosted; do **not** load Inter/Roboto as brand; do **not** add Tailwind just for fonts

- [x] Task 2: Soft-Ledger component primitives (AC: #2)
  - [x] Create package under `ui/components/soft-ledger/` (CSS modules; no Tailwind/shadcn):
    - `BalanceStrip.tsx` — surface island, 1px border, `rounded.md`, `strip-inset` margins; who-line (muted) + hero amount (owe/owed polarity props + **text** polarity, not color-only); optional CTA slot (omit OK for empty/J2 pattern)
    - `ReceiptRow.tsx` — title/when left, amount right; bottom hairline; airier `row-y`; amounts muted
    - `SectionLabel.tsx` — uppercase muted section label
    - `TopNav.tsx` — transparent; **brand left / list title right only** (DESIGN `top-nav`) — **no** Account control in TopNav
    - `TabBar.tsx` — List / Upload / Account; inactive muted / active accent; surface + top border
    - `Hint.tsx` — muted under strip; same inset as strip
    - `PrimaryButton.tsx` — moss accent + on-accent; `rounded.sm` (8px); padding `9px 12px` — **not** pill
  - [x] **A11y pins (WCAG 2.2 AA floor):** TabBar = `<nav aria-label="…">` with three links (or buttons); active tab uses `aria-current="page"`; strip who-line + amount remain readable without relying on color alone (text establishes polarity); do not invent focus-trapped disabled junk
  - [x] Depth: canvas (`--background`) vs surface (`--surface`) only — **no** drop-shadow hierarchy (UX-DR21)
  - [x] Props: accept empty/placeholder content; do **not** fetch settle balances or invent client share math
  - [x] Leave vertical room under strip/hint for future incomplete disclosure (Story 3.6 / UX-DR8) — never place chrome over the hero amount
  - [x] **PrimaryButton mount rule:** ship the component + package anatomy tests (satisfies AC #2 “Primary button”). On empty settle list detail, **omit** the strip CTA (DESIGN allows omit for balances-only / J2). Do **not** invent a “Mark settled” / settlement-recording label (AD-21). Story 3.2+ will reuse the button for real actions

- [x] Task 3: Mount primitives on live list chrome (AC: #2)
  - [x] Rewire `ui/app/lists/[listId]/page.tsx`:
    - Replace header `AccountNavLink` + ad-hoc brand/title block with Soft-Ledger `TopNav` (brand + list title only)
    - Mount `BalanceStrip` (empty settle OK) + `Hint` + `SectionLabel` + empty `ReceiptRow` state + `TabBar`
    - Keep Invite + DefaultSplit **below/around** Soft-Ledger chrome without deleting or restyling them this story
  - [x] **Tab destinations (locked):**
    | Tab | On list detail (`/lists/[listId]`) | Notes |
    |-----|--------------------------------------|-------|
    | List | `href=/lists/{listId}`; **active** (`aria-current="page"`) | Do **not** default List-tab to homepage `/lists` while viewing detail |
    | Upload | `href=/upload` | Existing Epic 4 stub page already auth-gated — structure only; **no** ingest UI; do **not** invent a disabled dead-end |
    | Account | `href=/account` | Replaces header `AccountNavLink`; theme Light/Dark/System stays inside Account page `AccountMenu` |
  - [x] Homepage: “All lists” / back control may still link to `/lists`; Lists homepage may mark List tab active and link Upload/Account the same way when TabBar is shared
  - [x] Homepage polarity fix in `ui/app/lists/lists.module.css` **only these balance selectors** (keep `balanceTone()` helper):
    - `.balanceOwe .balanceAmount` — change `#8b3a2a` → `var(--owe)`
    - `.balanceOwed .balanceAmount` — change `var(--accent)` → `var(--owed)`
    - Do **not** silently remap form `.error { color: #8b3a2a }` to `--owe` unless you intentionally decide errors should share owe token (out of scope; leave error styling alone)
  - [x] **i18n reuse (locked):** extend `ui/lib/i18n/lists.ts` — reuse existing `brand`, `uploadLink`, `detailSettle*`, `detailReceipts*`, `backToLists`, balance polarity strings. Account tab label = `accountCopy(locale).navAccount` from `ui/lib/i18n/account.ts`. Add only missing keys (e.g. List tab label, Hint empty copy) in `lists.ts` — **no** parallel `softLedger.ts` i18n tree
  - [x] Manual check: Light / Dark / System from Account menu flips token sets (Story 1.6 FOUC + `html.dark` / `html.light`)

- [x] Task 4: Tests + CI (AC: #1–#2)
  - [x] UI test-after (vitest + jsdom — match `AccountMenu.test.tsx` / `InviteForm.test.tsx` patterns):
    - Soft-Ledger primitives: DOM structure, labels, TabBar `aria-current`, strip who + amount roles/text
    - `PrimaryButton` module CSS uses `var(--rounded-sm)` / `8px` — assert **module source / class rule ≠ `9999px`** (do **not** assert `getComputedStyle` CSS custom properties from `globals.css` — Vitest/jsdom does not load those reliably here)
    - Homepage: `balanceTone()` still maps negative → owe, positive → owed, zero → zero; optional assert module CSS source contains `var(--owe)` / `var(--owed)` on the balance selectors above
  - [x] `npm run typecheck` + `npm run lint` + `npm test` (+ `npm run test:coverage`) in `ui/` green
  - [x] **Coverage floor (pinned):** `ui/vitest.config.mts` thresholds are **60%** on configured `include` only (`lib/**/*.ts`, `app/api/**/*.ts`). Soft-Ledger under `components/` does **not** count toward that floor — do not claim Soft-Ledger tests satisfy coverage. Keep floor green; do not lower thresholds
  - [x] No Playwright required for this story (AD-15)
  - [x] No api pytest changes expected — if accidentally touched, revert

### Review Findings

- [x] [Review][Patch] AcceptInvitePanel pending/error race after lint fix — Restoring initial `pending` from props and removing `setPending(true)` / `setError(null)` on effect entry can show `acceptSuccess` while accept is in flight and leave stale errors across token/auth re-runs. [ui/app/invites/accept/AcceptInvitePanel.tsx:23]
- [x] [Review][Patch] Soft-Ledger interactive chrome missing `:focus-visible` — TabBar links and PrimaryButton lack a visible focus affordance despite WCAG 2.2 AA floor. [ui/components/soft-ledger/TabBar.module.css:1]
- [x] [Review][Patch] TabBar `aria-label` default is English-only `"Primary"` — Not wired through lists i18n; ES sessions get an EN landmark. [ui/components/soft-ledger/TabBar.tsx:26]
- [x] [Review][Patch] Error/notFound TopNav shows brand twice — `navTitle` falls back to `t.brand` when list name is missing. [ui/app/lists/[listId]/page.tsx:135]
- [x] [Review][Patch] Success path heading outline weak — TopNav brand/list title are `<p>`; only receipts SectionLabel is `h2`, so list detail lacks a clear page heading for the loaded list. [ui/components/soft-ledger/TopNav.tsx:10]

## Dev Notes

### Critical scope clarification

**“Soft-Ledger primitives” in Story 3.1 = UI system**, not domain ledger tables.

| Term | Meaning here |
|------|----------------|
| Warm Balance | Color + appearance tokens (light/dark CSS vars) |
| Soft-Ledger | Layout personality: island strip, airy receipt rows, type/spacing/radius |
| Domain ledger / LEDGER_ENTRY / shares / FX | **Out of scope** — Stories 3.2–3.5 (+ Epic 4 import) |

No PRD FR IDs map to this story. Traceability: **UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR21** + Story 1.6 theme. AD-12 binds DESIGN/EXPERIENCE over mocks/kits.

### Current codebase state (UPDATE vs NEW)

**Already done (reuse — do not reinvent):**
- Warm Balance color hexes + dark/System switching — `ui/app/globals.css`
- Petrona/Manrope via `next/font` — `ui/app/layout.tsx` (`--font-brand`, `--font-ui`)
- Theme FOUC + preference — `ui/components/PreferencesProvider.tsx` (Story 1.6); Appearance on `/account` via `AccountMenu`
- Soft-Ledger **shell placeholders** on list detail — `ui/app/lists/[listId]/page.tsx` (still mounts `AccountNavLink` in header — remove when TopNav + TabBar land)
- Homepage owe/owed/zero helper — `balanceTone()` in `listsClient.ts` (+ test)
- Upload stub route — `ui/app/upload/page.tsx` + `listsMessages.uploadLink`
- EN+ES list chrome strings — `ui/lib/i18n/lists.ts`; Account label — `ui/lib/i18n/account.ts` (`navAccount`)

**Gaps this story closes:**
- Spacing / rounded / type-role CSS variables missing from `globals.css` (colors/fonts/theme already good)
- No reusable Soft-Ledger component package (`ui/components/` has Account* + Preferences only)
- List detail uses ad-hoc sections + header Account link, not island Balance strip / Tab bar / Receipt row anatomy
- Homepage balance polarity hardcodes / wrong tokens: `.balanceOwe .balanceAmount` → `#8b3a2a`; `.balanceOwed .balanceAmount` → `var(--accent)`

### Architecture compliance

- **AD-12:** DESIGN.md + EXPERIENCE.md bind look/behavior; kits = **unstyled** primitives only — **no** Tailwind/shadcn theme, no purple brand inheritance
- **AD-1:** `ui` → HTTP only; this story stays in `ui/`
- **AD-13:** branch `feat/3/3-1-warm-balance-tokens-soft-ledger-primitives` from `main` @ `baseline_commit`
- **AD-15:** UI test-after OK; domain TDD N/A here
- **AD-21:** never ship “Mark settled” / Simplify “paid” / payment CTAs — even as mock chrome on PrimaryButton
- Do **not** implement AD-5/6/7 money/FX/settle in this story

### File structure requirements

```
ui/
  app/
    globals.css                         # UPDATE — add spacing/rounded/type tokens
    layout.tsx                          # VERIFY fonts only (likely no change)
    upload/page.tsx                     # REUSE stub — TabBar Upload target
    account/…                           # REUSE — TabBar Account + theme menu
    lists/
      [listId]/page.tsx                # UPDATE — Soft-Ledger mount; remove header AccountNavLink
      lists.module.css                  # UPDATE — .balanceOwe/.balanceOwed amount colors only
      ListsPanel.tsx                    # UPDATE only if TabBar / token wiring needs it
  components/
    soft-ledger/                        # NEW
      BalanceStrip.tsx (+ .module.css)
      ReceiptRow.tsx (+ .module.css)
      SectionLabel.tsx (+ .module.css)
      TopNav.tsx (+ .module.css)
      TabBar.tsx (+ .module.css)
      Hint.tsx (+ .module.css)
      PrimaryButton.tsx (+ .module.css + .test.tsx)
      *.test.tsx                        # structure / a11y pins
    AccountNavLink.tsx                  # REMOVE from list detail header (may remain elsewhere)
    PreferencesProvider.tsx             # REUSE — do not fork
    AccountMenu.tsx                     # REUSE on /account only
  lib/i18n/
    lists.ts                            # UPDATE — add missing List/Hint keys only
    account.ts                          # REUSE navAccount for Account tab
```

Optional: extract token block to `ui/styles/tokens.css` imported from `globals.css`.

### Anti-patterns (will fail review)

- Installing Tailwind / shadcn / inventing a second design-token package
- Re-picking Warm Balance hexes or using cool slate / purple kit defaults
- Inter or Roboto as brand faces; freestyle type scale that ignores DESIGN.md matrix
- Pill primary CTAs (`border-radius: 9999px` / `rounded.full`)
- Drop-shadow hierarchy instead of canvas/surface
- Client-side settle/FX/share math filling the strip with invented numbers
- API/domain/Alembic changes “while we’re here”
- Deleting or restyling Invite / DefaultSplit in this story
- Incomplete disclosure **over** hero amount
- Using `--accent` for owed polarity (use `--owed`)
- Nesting `AccountMenu` / theme controls in TopNav or TabBar
- Leaving header `AccountNavLink` **and** Account tab (double Account chrome)
- List tab on detail navigating to homepage `/lists` as the active-tab default
- Inventing a disabled Upload dead-end instead of linking `/upload` stub
- Parallel Soft-Ledger i18n module when `lists.ts` / `account.ts` already cover labels
- Asserting `getComputedStyle` Warm Balance CSS vars in Vitest as the token AC proof
- Claiming Soft-Ledger component tests fulfill the 60% vitest coverage include

### Previous story intelligence (Epic 2 → Epic 3 handoff)

Story 3.1 is first in Epic 3 — prior intelligence comes from Epic 2 UI surfaces, not a 3.0 story:

- **2.2:** Soft-Ledger shell established (brand + list title; settle-first / receipts-below placeholders). Full strip polish deferred to **this** story. UX-DR7 homepage polarity pattern exists — complete token wiring here.
- **2.5 / 2.6:** Default split + item/receipt override **domain/API** — consumed by **3.2** Adjust-split UI, **not** 3.1. Creator ≡ `lists.owner_id` (never invent `created_by`). Do not fork share allocation into TypeScript.
- **2.6 may still be in-progress** — orthogonal to 3.1; branch from `main`, not that feature branch.
- Demo value path is **3.2–3.4 (J5→J2)**; 3.1 is the design-system precondition so that slice looks like product.

### Git intelligence

Recent commits polish Epic 2 UI hosts (default-split, invite landing). Soft-Ledger products sit on `ui/app/lists/*` — extend that surface. Compose tokens/components around DefaultSplit/Invite; do not rewrite list ACL.

### Latest tech notes

- Next.js **16.2.x** + React **19.2.x** (lockfiles are pin truth) — keep CSS modules + vitest stack; no Tailwind required
- Fonts: continue `next/font/google` with `variable: '--font-ui' | '--font-brand'` and `display: 'swap'` (already correct; self-hosted at build — no Google CDN at runtime)
- Theme: class strategy on `<html>` (`.dark` / `.light`) + System media query when unset — already in `globals.css` / PreferencesProvider

### Testing requirements

| Layer | Expectation |
|-------|-------------|
| Unit (ui) | Soft-Ledger DOM/a11y structure; PrimaryButton not pill (module CSS); balanceTone polarity; optional CSS-module source checks for `var(--owe)` / `var(--owed)` |
| Coverage | `npm run test:coverage` keeps **60%** on `lib/**` + `app/api/**` only |
| Visual / manual | Light↔Dark↔System flips; list detail Soft-Ledger island anatomy; TabBar List/Upload/Account destinations |
| api | No changes |
| E2E Playwright | Not required this story |

### Project context reference

Follow `_bmad-output/project-context.md`: Warm Balance / Soft-Ledger from spines; kits unstyled only; no settlement-recording CTAs; EN+ES chrome; one story per branch; DESIGN.md wins over mocks.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 3 / Story 3.1]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — frontmatter tokens + components]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — J2/J5 + Upload IA]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-12, AD-13, AD-15, AD-21]
- [Source: `_bmad-output/project-context.md`]
- [Source: `ui/app/globals.css`, `ui/app/layout.tsx`, `ui/app/lists/[listId]/page.tsx`, `ui/app/upload/page.tsx`, `ui/vitest.config.mts`]

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent)

### Debug Log References

- Coverage floor was below 60% due to untested Epic 2 BFF routes under `ui/app/api/lists/**` and `ui/app/api/invites/**`; restored with smoke tests (thresholds unchanged).
- Pre-existing `AcceptInvitePanel` `react-hooks/set-state-in-effect` lint error blocked `npm run lint`; initialized `pending` from props instead of sync setState in effect.

### Completion Notes List

- Soft-Ledger spacing / shape / type-role CSS vars added to `globals.css`; Warm Balance hexes unchanged.
- New `ui/components/soft-ledger/` primitives (BalanceStrip, ReceiptRow, SectionLabel, TopNav, TabBar, Hint, PrimaryButton) with CSS modules; no Tailwind/shadcn.
- List detail rewired to Soft-Ledger chrome; Account chrome moved to TabBar → `/account`; Invite + DefaultSplit preserved below.
- Homepage owe/owed amount colors use `var(--owe)` / `var(--owed)`.
- Vitest: Soft-Ledger anatomy + PrimaryButton not-pill + homepage polarity CSS source checks; BFF smoke tests for coverage floor.
- `npm run typecheck`, `lint` (warnings only), `test` (92), `test:coverage` (~91% stmts) green.

### File List

- ui/app/globals.css
- ui/app/lists/[listId]/page.tsx
- ui/app/lists/lists.module.css
- ui/app/lists/lists.module.balance-tokens.test.ts
- ui/lib/i18n/lists.ts
- ui/components/soft-ledger/BalanceStrip.tsx
- ui/components/soft-ledger/BalanceStrip.module.css
- ui/components/soft-ledger/ReceiptRow.tsx
- ui/components/soft-ledger/ReceiptRow.module.css
- ui/components/soft-ledger/SectionLabel.tsx
- ui/components/soft-ledger/SectionLabel.module.css
- ui/components/soft-ledger/TopNav.tsx
- ui/components/soft-ledger/TopNav.module.css
- ui/components/soft-ledger/TabBar.tsx
- ui/components/soft-ledger/TabBar.module.css
- ui/components/soft-ledger/Hint.tsx
- ui/components/soft-ledger/Hint.module.css
- ui/components/soft-ledger/PrimaryButton.tsx
- ui/components/soft-ledger/PrimaryButton.module.css
- ui/components/soft-ledger/soft-ledger.test.tsx
- ui/app/api/lists-invites.bff.test.ts
- ui/app/invites/accept/AcceptInvitePanel.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/3-1-warm-balance-tokens-soft-ledger-primitives.md

### Change Log

- 2026-08-06: Implemented Warm Balance Soft-Ledger tokens, primitives, list-detail mount, tests; story → review.
- 2026-08-06: Code review patches applied (invite pending race, focus-visible, TabBar i18n aria, TopNav h1/error title); story → done.

## Story completion status

Status: **done**

Completion note: Soft-Ledger / Warm Balance UI system landed on list detail; AC #1–#2 covered; code-review patches applied; UI quality gates green.
