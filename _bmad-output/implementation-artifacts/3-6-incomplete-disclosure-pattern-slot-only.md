---
baseline_commit: b3fd6d1
---

# Story 3.6: Incomplete-disclosure pattern (slot only)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a list member,
I want an incomplete-balance disclosure pattern under the settle strip,
So that when Epic 5 wires quarantine data, understated totals are never silent.

## Acceptance Criteria

1. **Given** the shared-expenses Soft-Ledger strip
   **When** no statement in the period is marked incomplete / quarantined
   **Then** no incomplete disclosure is shown — strip is not falsely marked incomplete (FR-43 pattern)

2. **Given** the disclosure UI component
   **When** it is implemented
   **Then** it sits calm/muted below the island strip (same inset), not over the hero amount (UX-DR8)
   **And** it is announcable to assistive tech (not color-only) when later wired (UX-DR19)

3. **Given** this story alone
   **When** product behavior is tested
   **Then** there is no requirement to fabricate incomplete data — Epic 5 wires FR-43 for real quarantine

## Prerequisites: Story 3.1 Warm Balance Setup

Before starting implementation, verify that Story 3.1 has completed the Warm Balance token setup:
- [x] CSS custom properties are set globally in `ui/app/globals.css` — actual token names differ from this story's placeholders: `--muted`/`--muted` (dark via `html.dark`), `--background`, `--space-4`, `--space-5`, `--strip-inset` (not `--color-muted`/`--spacing-4` etc.). Used the real names.
- [x] Dark mode is theme-context driven (`html.dark` class from `PreferencesProvider`, Story 1.6) with a `@media (prefers-color-scheme: dark)` pre-hydration fallback — not a bare media query as this story assumed. `var(--muted)` resolves correctly either way, so the component needed no dark-mode-specific code.
- [x] Manrope is loaded as `--font-ui` (`app/layout.tsx`) and referenced via `var(--type-meta-face)`/`--type-meta-size`/`--type-meta-weight` (weight 400, size 0.62rem) — matches DESIGN.md `components.hint`.
- [x] i18n is per-domain message objects (`ui/lib/i18n/lists.ts` `listsMessages.en/es`), not a JSON-file/hook system as this story assumed. Added disclosure keys there.

If any of these are missing, verify Story 3.1 is complete before proceeding.

## Tasks / Subtasks

- [x] Task 0: Confirm hard prerequisites
  - [x] **Branch:** `feat/3/3-6-incomplete-disclosure-pattern-slot-only` already checked out from `main` @ `baseline_commit` (b3fd6d1). One story per branch (AD-13)
  - [x] **Mandatory reads:** this story · `project-context.md` · Story 3.4 file (settle-up computes from CRC amounts) · Story 3.3 file + completion notes (receipt list rendering, `balanceStripPropsFrom` pure-helper testing pattern) · DESIGN.md `components.hint` (line 282) · ARCHITECTURE-SPINE.md AD-17 (quarantine ownership) line 175, AD-12 (UX companion authority) line 142. Story 5.2/5.4 files do not exist yet (Epic 5 not started) — read this story's own "Story 3.6 vs Epic 5 Phases" table instead, which documents the expected future contract.
  - [x] **Hard deps on tip (all already shipped):** confirmed present — 3.4 settle-up/CRC strip rendering (`BalanceStrip` + `balanceStripPropsFrom` in `page.tsx`), 3.3 shared-expenses view structure (strip + `Hint` + receipts in `page.tsx`), Warm Balance tokens (`app/globals.css`), Manrope typography (`--font-ui` in `app/layout.tsx`), WCAG 2.2 AA floor patterns (existing `aria-label`/`role` usage across `soft-ledger/*`)
  - [x] **Scope — In:**
    - Create reusable `<IncompleteDisclosure>` component in `ui/` that sits **below** the settle strip (same inset)
    - Component is calm/muted, uses Warm Balance tokens + Manrope typography (per DESIGN.md `components.hint`)
    - Accepts boolean `isIncomplete` prop (controls visibility); when `false` or `undefined`, render nothing (AC #1)
    - Accepts optional `onResolve` callback (link/action for future Epic 5 wiring)
    - Component includes aria-label for screen readers; not color-only (AC #2, UX-DR19)
    - Integrate component into shared-expenses view layout below the strip
    - Unit + integration tests for visibility logic (no data fabrication; tests assume input props only)
  - [x] **Scope — Out:**
    - No wiring to real incomplete data from API yet (that's Epic 5 Stories 5.2, 5.4)
    - No quarantine detail links or conflict review routing (Epic 5 responsibility)
    - No styling changes to the strip itself (strip already renders in 3.4) — `BalanceStrip.tsx`/`.module.css` untouched
    - No animated or decorative transitions (calm/muted appearance per UX-DR8)

- [x] Task 1: Design and create `<IncompleteDisclosure>` component
  - [x] **File organization:**
    - Created: `ui/components/soft-ledger/IncompleteDisclosure.tsx` (actual soft-ledger components live under `components/soft-ledger/`, not `components/` directly — matched `BalanceStrip.tsx`/`Hint.tsx` location)
    - No `ui/components/index.ts` barrel exists in this codebase (verified via search) — every soft-ledger component is imported directly by path (`@/components/soft-ledger/X`), so none was added; this matches existing convention, not a gap.
    - Follows existing Story 3.1/3.3 component patterns (co-located `.module.css`, named export, no default export)
  - [x] **Props (as shipped — updated post-review to match the actual component):**
    ```typescript
    type ResolveAction =
      | { onResolve: () => void; resolveLabel: string }
      | { onResolve?: undefined; resolveLabel?: undefined };

    export type IncompleteDisclosureProps = {
      /**
       * If true, render the incomplete disclosure.
       * If false or undefined, render nothing (AC #1).
       */
      isIncomplete?: boolean;

      /** Caller-supplied disclosure copy (i18n lives in the caller, e.g. `listsMessages`). */
      label: string;
    } & ResolveAction;
    ```
    `onResolve` and `resolveLabel` are coupled via a discriminated union — a caller cannot pass one without the other, which prevents an unlabeled `<button>` (WCAG 4.1.2) once Epic 5.4 wires `onResolve`. There is no separate `ariaLabel` prop: the component renders a `<div role="status">` (matching `ReceiptRow`'s existing convention) so the visible `label` text is itself announced to assistive tech — no risk of the visible and screen-reader copy diverging, and no dependency on `aria-label`, which is not permitted on non-landmark text roles.
  - [x] **Visibility & AC #1:**
    - `isIncomplete` falsy → returns `null` (no wrapper div)
    - `isIncomplete === true` → renders the disclosure `<p>`
    - Clean conditional render; verified by test ("renders nothing when isIncomplete is false or undefined")
  - [x] **Layout (per DESIGN.md `components.hint` + Soft-Ledger hybrid):**
    - `margin-inline: var(--strip-inset)` (10px) — same inset as `BalanceStrip`
    - Transparent background over the page canvas (`background: transparent`), not inside the strip island
    - `padding: var(--space-5) var(--space-4)` (14px × 12px)
    - No border, no border-radius
  - [x] **Typography & color (DESIGN.md `components.hint`):**
    - `font-family: var(--type-meta-face)` (resolves to Manrope via `--font-ui`), `var(--type-meta-weight)` (400), `var(--type-meta-size)` (0.62rem)
    - `color: var(--muted)` (light `#6E6456` / dark `#A89B88` via `html.dark`)
    - `line-height: 1.4`
  - [x] **Accessibility (AC #2, UX-DR19):**
    - `aria-label` prop passed through (wired to `incompleteDisclosureAriaLabel` i18n key)
    - Text is the primary/only signal — no icon, no color-only cue
    - No motion; `onResolve` renders as a real `<button type="button">`, natively keyboard-reachable (Tab+Enter/Space)
  - [x] **Internationalization (EN/ES from v1 per UX-DR18):**
    - Component takes `label`/`ariaLabel`/`resolveLabel` as props (no hardcoded strings in the component itself) — caller supplies translated text
    - This codebase's actual i18n system is per-domain message objects (`ui/lib/i18n/lists.ts` `listsMessages.en`/`.es`), not `ui/i18n/*.json` files or a translate hook as this story assumed. Added `incompleteDisclosureLabel`, `incompleteDisclosureAriaLabel`, `incompleteDisclosureResolve` to both `en` and `es` in `lists.ts`, following the same naming style as neighboring keys (`detailReceiptsTitle`, etc.)
    - EN: label = "Balances may be incomplete. Check unresolved items to confirm the total."; resolve = "Resolve incomplete"; aria-label = "Balances are incomplete: contains unresolved quarantine or conflicts."
    - ES: translated equivalents added (see `lists.ts`)
  - [x] **Warm Balance Token Integration (Story 3.1 dependency):**
    - Used the real token names from `app/globals.css` (this story's placeholder names `--color-muted`/`--spacing-4`/`--spacing-strip-inset` don't exist in the codebase): `var(--muted)`, `var(--strip-inset)`, `var(--space-4)`, `var(--space-5)`
    - Dark mode is automatic — `--muted` is redefined under `html.dark` and the `prefers-color-scheme` pre-hydration fallback in `globals.css`; the component references the variable once and needs no dark-specific CSS
    - No hex values hardcoded; verified by test asserting the CSS module doesn't contain `#6E6456`/`#A89B88`
    - Contrast: reuses the same `--muted`/`--muted` (dark) pair already used by `Hint.tsx` and `BalanceStrip`'s who-line, which are the established WCAG AA-passing muted tokens for this palette

- [x] Task 1b: Understand API contract (no implementation; documentation only)
  - [x] **Current API shape (Story 3.6):** The shared-expenses balance endpoint currently returns:
    ```typescript
    GET /lists/{listId}/shared-expenses/balance
    {
      id: string;
      settleBalances: SettleBalance[];
      // balanceStatus DOES NOT YET EXIST
    }
    ```
  - [x] **This story's contract:** Hardcoded `isIncomplete={false}` on the component in `page.tsx` (no real data yet)
  - [x] **Epic 5.4's contract:** API will add `balanceStatus` to response:
    ```typescript
    {
      id: string;
      settleBalances: SettleBalance[];
      balanceStatus: {
        isIncomplete: boolean;
        unresolvedQuarantineCount?: number;
        unresolvedConflictCount?: number;
      }
    }
    ```
  - [x] **Developer note:** Did not wire the component to real API data. `page.tsx` passes `isIncomplete={false}` explicitly with a comment noting Epic 5.4 will wire `balanceStatus`.

- [x] Task 2: Integrate component into shared-expenses view layout
  - [x] **File:** `ui/app/lists/[listId]/page.tsx` (App Router — this story's `pages/[listId]/shared-expenses.tsx` path doesn't exist; the shared-expenses/list-detail view is `app/lists/[listId]/page.tsx`, established by Story 3.3)
  - [x] **Placement:**
    - Below `<BalanceStrip>`, before the empty-state `<Hint>`/receipts section, same horizontal inset as strip (component uses `var(--strip-inset)` internally, same as `BalanceStrip.module.css`)
  - [x] **Props wiring (for now, hardcoded or stubbed):**
    - `isIncomplete={false}` — no real data from API yet
    - `onResolve` omitted (undefined) — not wired until Epic 5
    - `label`/`ariaLabel`/`resolveLabel` wired from the new `listsMessages` i18n keys
  - [x] **No styling regressions:** confirmed via `npx next build` (clean) and full `vitest run` (140/140 passing, including existing `BalanceStrip`/`Hint`/`ReceiptRow` tests) — strip, hint, and receipt rendering unchanged since the component renders `null` when `isIncomplete={false}`

- [x] Task 3: Write tests for component
  - [x] **Unit test:** added to `ui/components/soft-ledger/soft-ledger.test.tsx` (not a separate `__tests__/IncompleteDisclosure.test.tsx` — this codebase tests all `soft-ledger/*` primitives together in one file, per existing convention for `BalanceStrip`/`Hint`/`ReceiptRow`/etc.)
    - Visibility: `isIncomplete={true}` renders; `false`/undefined renders nothing (2 tests)
    - aria-label: present and matches the passed `ariaLabel` prop
    - Callback: `onResolve` invoked via a real `<button>` click; verified no button renders when `onResolve` is omitted
    - No fabricated API responses/quarantine data — tests pass props only (AC #3)
  - [x] **Dark mode:** not tested via a runtime theme toggle (jsdom has no CSS cascade/`prefers-color-scheme` evaluation) — instead asserted via the CSS-module-content test that `var(--muted)` (the token that already flips value under `html.dark` / `prefers-color-scheme` in `globals.css`) is used and no hex value is hardcoded, which is the same verification strategy `PrimaryButton`'s existing test uses for its tokens.
  - [x] **Integration test in shared-expenses flow:** added as composed-render tests in `soft-ledger.test.tsx` (mounting `BalanceStrip` + `IncompleteDisclosure` + `SectionLabel` + `ReceiptRow` together, matching `page.tsx`'s actual composition) rather than a separate `ui/__tests__/shared-expenses.integration.test.tsx` — no such directory/pattern exists in this codebase, and `page.tsx` itself is an async Server Component (uses `cookies()`/`fetch`) that this codebase's existing tests never render directly (Story 3.3's `page.balanceStrip.test.ts` only unit-tests the extracted pure `balanceStripPropsFrom` helper). Followed that established pattern.
    - Verified DOM order: strip → disclosure → section label (i.e., below strip, above receipts)
    - Verified no-render case leaves no disclosure node and no leaked text
    - Keyboard reachability covered by using a real `<button>` (natively Tab/Enter-reachable) rather than a div with a click handler
  - [x] **Accessibility check:** no axe-core dependency exists in this project (checked `package.json`); relied on the same manual-review approach the codebase already uses (`aria-label`, native `<button>`, `:focus-visible` — see `TabBar.module.css`/`PrimaryButton.module.css` precedent). Added a `:focus-visible` outline to `.resolve` in the new CSS module.
  - [x] **CSS specificity & theming:** `.disclosure`/`.resolve` are CSS-module-scoped (unique hashed class names), so no collision with `.strip`/`.row` styles is possible by construction; verified dark mode is inherited automatically via `var(--muted)` (no dark-specific rule needed in the new CSS module).
  - [x] **Layout spacing edge cases:** `margin: 0 var(--strip-inset) var(--space-4)` keeps the disclosure flush below the strip (no extra top margin) with `var(--space-4)` breathing room before receipts; `line-height: 1.4` set explicitly in the CSS module for text-wrap readability.

- [x] Task 4: Styling and theming
  - [x] **CSS module (match Story 3.1 Warm Balance setup):** `ui/components/soft-ledger/IncompleteDisclosure.module.css` — used real tokens (`var(--muted)`, `var(--strip-inset)`, `var(--space-4)`, `var(--space-5)`, `var(--type-meta-face/size/weight)`) instead of this story's placeholder token names / hardcoded hex, per Story 3.1's actual `globals.css`. No border, no background fill.
  - [x] **Dark mode:** automatic via `var(--muted)` (redefined under `html.dark` / `prefers-color-scheme` in `globals.css`) — no separate dark-mode block needed, unlike the story's assumed bare `@media (prefers-color-scheme: dark)` override.
  - [x] **Responsive behavior:** no viewport-specific rules added; same inset/typography on all sizes (matches `Hint`/`BalanceStrip` — neither has responsive variants either).
  - [x] **No animations:** verified by test asserting the CSS module contains no `transition`/`animation`/`@keyframes`; visibility is a plain conditional render (`null` vs `<p>`), so appear/disappear is instant.

- [x] Task 5: Prepare for Epic 5 wiring (documentation only; no implementation)
  - [x] **Comment block in component:** Added TODO or notes clarifying how Epic 5 will wire real data:
    ```typescript
    // TODO (Epic 5.2–5.4): Wire real incomplete data from API
    // - API response should include: balanceStatus.isIncomplete (bool)
    // - If incomplete, include: balanceStatus.unresolvedQuarantineCount, balanceStatus.unresolvedConflictCount
    // - onResolve callback will route to quarantine or conflict resolution detail view
    // - This story creates the slot; Epic 5 provides the behavior and real data.
    ```
  - [x] **API response shape (stub documentation for Epic 5):** documented in the `Task 1b` note above and in the component's TODO comment block (kept in one place rather than duplicated verbatim, to avoid drift between two copies of the same shape).
    ```typescript
    // Expected API response shape (to be filled in Epic 5):
    interface BalanceStatus {
      isIncomplete: boolean;
      unresolvedQuarantineCount?: number;
      unresolvedConflictCount?: number;
    }
    // Shared-expenses API will include this in the balance summary response.
    ```

- [x] Task 6: Documentation and CI
  - [ ] **Component storybook or example (optional, nice-to-have):** Skipped — no Storybook exists anywhere in this codebase (verified: no `.storybook/` dir, no `storybook` devDependency in `ui/package.json`), and adding a new tooling dependency for one component is out of scope for a slot-only story. The composed render test in `soft-ledger.test.tsx` (both `isIncomplete={true}` and `false`) serves the same "reference for Epic 5" purpose.
  - [x] **CI: type-checking, linting, tests**
    - `ui`: `npx tsc --noEmit` → 0 errors
    - `ui`: `npx eslint .` → 0 errors (2 pre-existing warnings, both unrelated to this story)
    - `ui`: `npx vitest run` → 140/140 tests passing (15 in `soft-ledger.test.tsx`, no regressions elsewhere)
    - `ui`: `npx next build` → compiles and generates all routes cleanly, including `/lists/[listId]`
  - [x] **Accessibility audit (manual or tool):** No axe-core/screen-reader tooling available in this environment; relied on code-level verification consistent with the project's existing a11y approach — `aria-label` prop present and asserted by test, `--muted`/`--muted` (dark) tokens reused from already-shipped, already-audited `Hint`/`BalanceStrip` components (same contrast pair, not a new untested color), native `<button>` for `onResolve` (inherently keyboard-operable, no custom tab-index/keydown handling needed), `:focus-visible` outline added matching `PrimaryButton`'s pattern.

### Review Findings

- [x] [Review][Patch] `aria-label` on `<p>` is name-prohibited by ARIA — AC #2/UX-DR19's a11y mechanism may not fire [ui/components/soft-ledger/IncompleteDisclosure.tsx:28] — `<p>` maps to ARIA role `paragraph`, which per WAI-ARIA 1.2 has "Name from: prohibited"; conformant AT/browsers (and axe-core's `aria-prohibited-attr` rule) ignore the `aria-label`, silently defeating the "announcable to assistive tech" requirement. Resolved (2026-08-14): switch the wrapper element to a `<div role="status">`, matching `ReceiptRow`'s existing convention — gets `aria-live="polite"` for free (covers the separate "no aria-live for future reactive appearance" concern) and allows naming. Also fold the visible/aria-label text divergence into this fix by letting AT read the visible text natively where possible.

- [x] [Review][Patch] `onResolve`/`resolveLabel` are independently optional, allowing an unlabeled `<button>` [ui/components/soft-ledger/IncompleteDisclosure.tsx:9-10,30-33] — All three review layers converged on this. Not reachable today (page.tsx never passes `onResolve`), but the component's own TODO marks `onResolve` as Epic 5.4's job, and nothing currently stops Epic 5 from passing `onResolve` without `resolveLabel`, producing a WCAG 4.1.2 nameless control. Fixed: coupled the two props via a discriminated union.
- [x] [Review][Patch] Disclosure/receipts gap won't match the app's spacing rhythm once live [ui/components/soft-ledger/IncompleteDisclosure.module.css:2, ui/app/lists/lists.module.css `.softReceipts`] — `.softBody` is a flex column, so `.disclosure`'s `margin-bottom: var(--space-4)` (12px) and `.softReceipts`'s `margin-top: var(--space-2)` (8px) do not collapse, yielding a 20px gap instead of the 8px used elsewhere. Fixed: dropped `.disclosure`'s bottom margin — this also brought the CSS in line with DESIGN.md's `components.incomplete-disclosure` token entry, which never documented a bottom-margin token in the first place.
- [x] [Review][Patch] `IncompleteDisclosureProps` type is not exported [ui/components/soft-ledger/IncompleteDisclosure.tsx:3] — inconsistent with sibling `BalanceStrip.tsx`, which exports `BalancePolarity`, for a component pitched as reusable across Epic 5. Fixed: added `export`.
- [x] [Review][Patch] Completion Checklist left unchecked despite Change Log claiming full completion [`## Completion Checklist` in this file] — Debug Log/Completion Notes/Change Log all assert CI-green completion (independently spot-verified true by Blind Hunter), but the checklist boxes were never checked, so a reviewer skimming only that section sees an apparently-incomplete story. Fixed: checked off.
- [x] [Review][Patch] Story's own `Props` code block (Task 1) doesn't match the shipped component API [this file, Task 1 "Props" subsection] — spec shows `label?: string` optional with no `ariaLabel`, but shipped component requires `label: string` and `ariaLabel: string` and adds `resolveLabel?: string`. Fixed: updated the spec's Props block to match the shipped (post-review) API.

## Dev Notes

### Critical product pins

| Pin | Rule |
|-----|------|
| **Incomplete disclosure visibility** | Only renders if API or component prop sets `isIncomplete = true`. No false positives; honest empty when no quarantine (AC #1) |
| **Layout placement** | Below strip, same inset (10px); transparent over canvas; not over hero amount (UX-DR8) |
| **Styling approach** | Calm/muted; Manrope weight 400; `{colors.muted}` text; no color-only signals (UX-DR19, UX-DR8) |
| **Accessibility floor** | WCAG 2.2 AA: aria-label for screen readers; keyboard-accessible; no required motion; ≥4.5:1 contrast (UX-DR19) |
| **Data slot** | This story = UI component slot only. Epic 5 Stories 5.2 (accept-with-quarantine) and 5.4 (wire disclosure) provide real data and behavior. No fabricated quarantine needed here (AC #3) |
| **Token reuse** | Warm Balance from Story 3.1, Hint typography from DESIGN.md; same spacing rhythm as strip (Story 3.3/3.4) |
| **Future wiring (Epic 5)** | Component ready for: `isIncomplete` prop from API response, `onResolve` callback routing to quarantine/conflict resolution |

### Recommended Implementation Sequence

Build in this order to prevent regressions and ensure testability:

1. **Task 1 first:** Create component skeleton with props + basic conditional render (returns `null` when `isIncomplete={false}`)
2. **Task 1b:** Understand API contract (documentation; no code)
3. **Task 4 second:** Apply Warm Balance styling (CSS custom properties + dark mode)
4. **Task 2 third:** Integrate into shared-expenses view (wire hardcoded `isIncomplete={false}` prop)
5. **Task 3 fourth:** Write unit + integration tests (all scenarios: visibility, a11y, dark mode, spacing)
6. **Task 5 fifth:** Add Epic 5 TODO comments and API shape documentation
7. **Task 6 last:** Run CI (TypeScript, linting, tests) and accessibility audit

This sequence ensures styling is locked before integration testing, preventing layout regressions.

### Critical Gotchas (Mistakes to Avoid)

- ❌ **Don't hardcode colors** (#6E6456, #A89B88). Use CSS custom properties: `var(--color-muted)`, `var(--color-muted-dark)`
- ❌ **Don't add animations or transitions.** This is a CALM disclosure (UX-DR8); instant appear/disappear based on `isIncomplete` boolean only
- ❌ **Don't render an empty div** when `isIncomplete={false}`. Return `null` instead (cleaner DOM; no layout side effects)
- ❌ **Don't wire real API data yet.** Story 3.6 is slot-only; hardcode `isIncomplete={false}`. Epic 5.4 wires real data
- ❌ **Don't forget aria-label.** Screen readers must announce incompleteness; it's a critical accessibility requirement
- ❌ **Don't test with fabricated quarantine data.** Use mock/stub props only (AC #3); no fake API responses
- ❌ **Don't forget EN+ES translation keys.** UX-DR18 requires both languages from v1; add to `ui/i18n/en.json` and `ui/i18n/es.json`
- ❌ **Don't hardcode Manrope.** Use CSS variable or font-family stack from Story 3.1 setup

### Files Modified (Exact Changes)

| File | Change | Section | Impact |
|------|--------|---------|--------|
| `ui/components/IncompleteDisclosure.tsx` | NEW | — | New component file |
| `ui/components/index.ts` | UPDATE | Add export | Make component importable |
| `ui/pages/[listId]/shared-expenses.tsx` | UPDATE | Below `<BalanceStrip>` | Add component to layout; wire `isIncomplete={false}` |
| `ui/components/__tests__/IncompleteDisclosure.test.tsx` | NEW | — | Unit tests for component |
| `ui/__tests__/shared-expenses.integration.test.tsx` | UPDATE | New test case | Verify disclosure renders/doesn't render in view |
| `ui/i18n/en.json` | UPDATE | New keys | Add: `incomplete.disclosure.label`, `incomplete.disclosure.hint`, `incomplete.disclosure.resolve`, `incomplete.disclosure.aria_label` |
| `ui/i18n/es.json` | UPDATE | New keys | Add same keys with ES translations |
| `ui/design/tokens.ts` or `ui/styles/globals.css` | VERIFY | Warm Balance vars | Confirm tokens exist (no change if Story 3.1 done) |

### Soft-Ledger hybrid placement rationale

Story 3.3 established the shared-expenses view structure:
1. Top nav (transparent, muted brand + list title)
2. **Balance strip island** (settle hero amount + who-line + optional CTA)
3. Receipts below (newest-first)

Story 3.6 **inserts the incomplete disclosure between strip and receipts** (as a separate row at same inset). This preserves the strip as the visual climax while keeping balances-may-be-incomplete disclosure **calm and below** (not competing with or overlaying the hero amount).

DESIGN.md notes (line 290–292):
> "Not redrawn on Soft-Ledger hybrid panel; Soft Type panel showed disclosure under the strip. [ASSUMPTION] When needed on Soft-Ledger, place calm muted disclosure **below** the island strip (same inset), not over the amount — balances still lead."

This story confirms that assumption: the component is slotted in the layout; styling and data wiring follow later.

### Story 3.6 vs Epic 5 Phases

| Phase | Responsibility | Component State | API Involvement | Dev Focus |
|-------|---|---|---|---|
| **Story 3.6** (this) | Create component slot | `isIncomplete={false}` (hardcoded) | No wiring; API doesn't have data | Render-ready component, a11y, styling |
| **Epic 5.2** | Accept-with-quarantine flow | Statement marked `incomplete: true` | DB: `quarantine_rows` table created | Business logic (outside this story) |
| **Epic 5.4** | Wire real incomplete data | `isIncomplete={balanceStatus.isIncomplete}` | API adds `balanceStatus` to response | Connect component to real API data; add `onResolve` routing |

### Quick Test Plan (Before Running Full CI)

- [ ] **Visibility:** `isIncomplete={false}` → renders nothing; `isIncomplete={true}` → renders muted text
- [ ] **Styling:** Muted text on light background; dark mode text on dark background; `line-height: 1.4` preserves readability
- [ ] **Accessibility:** aria-label present and announced; Tab-reachable after strip; contrast ≥4.5:1
- [ ] **Layout:** No spacing shift; strip above, disclosure below, receipts further below; all unchanged
- [ ] **i18n:** EN and ES text render correctly from translation keys
- [ ] **Regression:** All other shared-expenses tests still pass; no visual regressions in strip or receipt list

## Dev Agent Record

### Debug Log

- No blocking issues. One planning correction: this story's task text assumes several project structures that don't exist in the live codebase (`ui/components/index.ts` barrel, `ui/pages/[listId]/shared-expenses.tsx`, `ui/i18n/*.json` + translate hook, `--color-muted`/`--spacing-4` CSS variable names, per-component `__tests__/` files, `ui/__tests__/shared-expenses.integration.test.tsx`). Explored the actual codebase first (`app/lists/[listId]/page.tsx`, `components/soft-ledger/*`, `lib/i18n/lists.ts`, `app/globals.css`) and followed its real conventions instead of the story's placeholder paths/names, per `project-context.md`'s source-of-truth order (Spine/project-context win; story text is downstream). Each deviation is called out inline on its subtask above.
- `page.tsx` (the shared-expenses/list-detail view) is an async Server Component using `cookies()`/`fetch`; the codebase's existing test for it (`page.balanceStrip.test.ts`) only unit-tests an extracted pure helper rather than rendering the RSC. Followed that precedent instead of attempting a new RSC-render test harness.

### Completion Notes List

- Created `<IncompleteDisclosure>` in `ui/components/soft-ledger/IncompleteDisclosure.tsx` + `IncompleteDisclosure.module.css`: renders `null` when `isIncomplete` is falsy (AC #1); renders a muted `<p aria-label>` below the strip, same inset, using real Warm Balance tokens (`var(--muted)`, `var(--strip-inset)`, `var(--space-4)`, `var(--space-5)`, `var(--type-meta-*)`) — no hardcoded hex, no animation.
- Optional `onResolve` renders as a native `<button type="button">` inside the disclosure text (keyboard-reachable by construction); omitted entirely when `onResolve` is not passed.
- Added a TODO comment block in the component documenting the Epic 5.2–5.4 `balanceStatus` API contract, satisfying Task 1b/5's documentation-only requirement without a second copy of the shape drifting out of sync.
- Wired into `ui/app/lists/[listId]/page.tsx` directly below `<BalanceStrip>` with `isIncomplete={false}` hardcoded (no API wiring — Epic 5.4's job) and `label`/`ariaLabel`/`resolveLabel` sourced from new i18n keys.
- Added `incompleteDisclosureLabel`, `incompleteDisclosureAriaLabel`, `incompleteDisclosureResolve` (EN + ES) to `ui/lib/i18n/lists.ts`'s existing `listsMessages` object — this project doesn't use JSON i18n files; it uses per-domain TS message objects, so followed that pattern instead of the story's assumed `ui/i18n/en.json`/`es.json`.
- Tests added to `ui/components/soft-ledger/soft-ledger.test.tsx` (existing shared test file for all soft-ledger primitives): visibility (true/false/undefined), aria-label content, `onResolve` invocation via real click, absence of the resolve button when `onResolve` is omitted, a CSS-content assertion that Warm Balance tokens are used with no hardcoded hex and no motion/transition properties, and two composed-render tests mirroring `page.tsx`'s actual `BalanceStrip` → `IncompleteDisclosure` → `SectionLabel`/`ReceiptRow` layout (one with `isIncomplete={true}` verifying DOM order, one with `false` verifying no false-positive render — AC #1/#3).
- No fabricated API responses or quarantine data anywhere in the tests — all inputs are literal component props, per AC #3.
- Verification: `npx tsc --noEmit` (0 errors), `npx eslint .` (0 errors; 2 pre-existing warnings unrelated to this story), `npx vitest run` (140/140 passing, 15 in the touched test file, no regressions), `npx next build` (compiles cleanly, `/lists/[listId]` route generated).
- Storybook step (Task 6) intentionally skipped — no Storybook tooling exists anywhere in this repo; the composed true/false render tests serve the same "reference for Epic 5" purpose without adding a new dependency.

### File List

- `ui/components/soft-ledger/IncompleteDisclosure.tsx` (new)
- `ui/components/soft-ledger/IncompleteDisclosure.module.css` (new)
- `ui/components/soft-ledger/soft-ledger.test.tsx` (modified — added import/mock + 8 new test cases)
- `ui/app/lists/[listId]/page.tsx` (modified — import + integrate `<IncompleteDisclosure>` below `<BalanceStrip>`)
- `ui/lib/i18n/lists.ts` (modified — added 3 EN + 3 ES i18n keys)

### Change Log

- 2026-08-13: Implemented Story 3.6 — added slot-only `<IncompleteDisclosure>` component (calm/muted, below settle strip, `isIncomplete` prop, aria-labeled, EN/ES i18n), integrated into `ListDetailPage` with `isIncomplete={false}` hardcoded, added unit + composed-render tests. No API wiring (Epic 5 scope). All tasks/subtasks complete; CI (typecheck/lint/tests/build) green.
- 2026-08-14: Code review fixes — replaced the `<p aria-label>` wrapper with `<div role="status">` (the `<p>`/`paragraph` role is name-prohibited under WAI-ARIA 1.2, so the original `aria-label` risked being silently ignored by assistive tech); dropped the now-redundant `ariaLabel` prop and `incompleteDisclosureAriaLabel` i18n key since the visible `label` text is now the accessible name directly; coupled `onResolve`/`resolveLabel` via a discriminated union so a future caller can't pass one without the other; removed `.disclosure`'s bottom margin so it no longer double-stacks with `.softReceipts`'s top margin in the flex layout; exported `IncompleteDisclosureProps`; updated tests and this story's Props/Checklist sections to match.

## Completion Checklist

Before marking this story **done** and pushing for code review:

- [x] Branch created and named per AD-13: `feat/3/3-6-incomplete-disclosure-pattern-slot-only`
- [x] Component implemented: `<IncompleteDisclosure>` with props (isIncomplete, onResolve, label)
- [x] Component integrated into shared-expenses view (below strip, same inset)
- [x] Tests written: visibility, a11y, dark mode, callback wiring
- [x] Styling matches DESIGN.md Soft-Ledger + Warm Balance tokens (calm/muted)
- [x] Accessibility verified: `role="status"` + visible text as the accessible name, contrast, keyboard access (WCAG 2.2 AA) — updated post-review; `aria-label` on a non-landmark element is name-prohibited by ARIA and was replaced
- [x] No regressions: strip layout, receipt rendering, tab order unchanged
- [x] CI green: TypeScript, linting, tests pass; no type errors
- [x] Short how/why overview (see `story-close-overview-checklist.md`):
  - **What:** Created reusable `<IncompleteDisclosure>` component slotted below settle strip
  - **Why:** FR-43 pattern requires calm, non-false-positive disclosure of incomplete balances when Epic 5 wires quarantine data
  - **How:** Component accepts `isIncomplete` boolean prop; renders muted text below strip (same inset) in a `role="status"` region; Warm Balance tokens; no real data yet (Epic 5 wires)
  - **What not to break:** Strip layout, receipt list rendering, Soft-Ledger spacing rhythm, keyboard navigation order, Warm Balance theming
- [x] PR ready for code review (run `/code-review` when pushed)

---

## Story Summary

**Story 3.6** creates the **incomplete-disclosure UI component slot** that will later hold real quarantine/conflict data from Epic 5 Stories 5.2 (accept-with-quarantine marks statements incomplete) and 5.4 (wire real incomplete disclosure behavior).

The component is:
- **Calm and muted:** below the settle strip (never overlaying the hero amount), Manrope meta typography, Warm Balance muted ink
- **Accessibility-first:** aria-labeled for screen readers, WCAG 2.2 AA contrast, keyboard-operable, no required motion
- **Data-ready but slot-only:** accepts `isIncomplete` boolean prop (no real data until Epic 5); renders nothing when false (AC #1)
- **Integration-ready:** sits in shared-expenses view layout below strip, same inset as island (AC #2)
- **Future-proofed:** component structure prepared for Epic 5 to wire `onResolve` callback and real quarantine/conflict counts (Epic 5.2–5.4 responsibility)

No compromises on UX-DR8 (placement), UX-DR19 (a11y), or FR-43 (honest empty state). The slot is ready for Epic 5's data.
