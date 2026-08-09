---
baseline_commit: b3fd6d1
---

# Story 3.6: Incomplete-disclosure pattern (slot only)

Status: ready-for-dev

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
- [ ] CSS custom properties are set globally: `--color-muted`, `--color-background`, `--color-muted-dark`, `--color-background-dark`, `--spacing-4`, `--spacing-5`, `--spacing-strip-inset`
- [ ] Dark mode detection is set up (via `@media (prefers-color-scheme: dark)` or theme context from Story 1.6)
- [ ] Manrope font is loaded with `font-weight: 400` variant available
- [ ] i18n system is wired (i18n function/hook available for use)

If any of these are missing, verify Story 3.1 is complete before proceeding.

## Tasks / Subtasks

- [ ] Task 0: Confirm hard prerequisites
  - [ ] **Branch:** create `feat/3/3-6-incomplete-disclosure-pattern-slot-only` from `main` @ `baseline_commit`. One story per branch (AD-13)
  - [ ] **Mandatory reads:** this story · `project-context.md` · Story 3.4 completion notes (settle-up computes from CRC amounts) · Story 3.3 completion notes (receipt list rendering) · DESIGN.md Soft-Ledger hybrid layout, `components.hint`, `components.balance-strip` · ARCHITECTURE-SPINE.md AD-17 (quarantine ownership), AD-12 (UX companion authority) · Story 5.2 (accept-with-quarantine marks statement incomplete) · Story 5.4 (wire real incomplete disclosure behavior)
  - [ ] **Hard deps on tip (all already shipped):** 3.4 settle-up computation and CRC strip rendering · 3.3 shared-expenses view structure with strip + receipts · Warm Balance tokens from 3.1 · Manrope typography for hint text · Accessibility WCAG 2.2 AA floor from Story 1.6
  - [ ] **Scope — In:**
    - Create reusable `<IncompleteDisclosure>` component in `ui/` that sits **below** the settle strip (same inset)
    - Component is calm/muted, uses Warm Balance tokens + Manrope typography (per DESIGN.md `components.hint`)
    - Accepts boolean `isIncomplete` prop (controls visibility); when `false` or `undefined`, render nothing (AC #1)
    - Accepts optional `onResolve` callback (link/action for future Epic 5 wiring)
    - Component includes aria-label for screen readers; not color-only (AC #2, UX-DR19)
    - Integrate component into shared-expenses view layout below the strip
    - Unit + integration tests for visibility logic (no data fabrication; tests assume input props only)
  - [ ] **Scope — Out:**
    - No wiring to real incomplete data from API yet (that's Epic 5 Stories 5.2, 5.4)
    - No quarantine detail links or conflict review routing (Epic 5 responsibility)
    - No styling changes to the strip itself (strip already renders in 3.4)
    - No animated or decorative transitions (calm/muted appearance per UX-DR8)

- [ ] Task 1: Design and create `<IncompleteDisclosure>` component
  - [ ] **File organization:**
    - Create: `ui/components/IncompleteDisclosure.tsx`
    - Export from: `ui/components/index.ts` (add `export { IncompleteDisclosure } from './IncompleteDisclosure'`)
    - This follows existing Story 3.1 component patterns; verify export structure
  - [ ] **Props:**
    ```typescript
    interface IncompleteDisclosureProps {
      /**
       * If true, render the incomplete disclosure.
       * If false or undefined, render nothing (AC #1).
       */
      isIncomplete?: boolean;
      
      /**
       * Optional callback for "Resolve" action (wired in Epic 5).
       * For now, can be undefined; component prepares for it.
       */
      onResolve?: () => void;
      
      /**
       * Optional: show a hint label (e.g., "Resolve quarantine").
       * Defaults to a calm disclosure message.
       */
      label?: string;
    }
    ```
  - [ ] **Visibility & AC #1:**
    - If `isIncomplete` is falsy, return `null` (or empty fragment)
    - If `isIncomplete === true`, render the disclosure
    - No decorative empty div; clean conditional render
  - [ ] **Layout (per DESIGN.md `components.hint` + Soft-Ledger hybrid):**
    - Sits below the settle strip (same inset as strip: `spacing.strip-inset` = 10px)
    - Same surface/canvas pattern: transparent background over `{colors.background}` (not inside the island)
    - Padding: use `{spacing.5}` (14px) vertical × `{spacing.4}` (12px) horizontal to match strip (or slightly looser per hint spec)
    - No border; no rounded corners; calm appearance
  - [ ] **Typography & color (DESIGN.md `components.hint`):**
    - Font: Manrope, weight 400, size 0.62rem (meta size)
    - Color: `{colors.muted}` (light: #6E6456; dark: #A89B88)
    - Line-height: 1.4 (readable but not prominent)
  - [ ] **Accessibility (AC #2, UX-DR19):**
    - Include `aria-label="Balances are incomplete: contains unresolved quarantine or conflicts."` (or similar calm phrasing)
    - Not color-only: text is the primary signal, never relying solely on color or icon
    - No required motion to read or interact; if future `onResolve` link exists, make it keyboard-accessible (Tab+Enter)
    - Screen readers announce the disclosure upon navigation into the shared-expenses view
  - [ ] **Internationalization (EN/ES from v1 per UX-DR18):**
    - Component MUST use i18n keys, not hardcoded strings
    - Import i18n/translate function from project's i18n system (likely set up in Story 1.6)
    - Use i18n keys: `incomplete.disclosure.label`, `incomplete.disclosure.hint`, `incomplete.disclosure.resolve`
    - EN defaults: 
      - Label: "Balances may be incomplete. Check unresolved items to confirm the total." (calm phrasing; no urgent red flags)
      - Resolve link: "Resolve incomplete" (not a CTA button; keep calm)
    - ES translations will be added during implementation (developer adds keys to `ui/i18n/es.json` matching EN structure)
    - aria-label must also be translatable: key `incomplete.disclosure.aria_label` with value "Balances are incomplete: contains unresolved quarantine or conflicts"
  - [ ] **Warm Balance Token Integration (Story 3.1 dependency):**
    - Use CSS custom properties (Story 3.1 sets these up globally):
      - `var(--color-muted)` for light mode text (#6E6456)
      - `var(--color-background)` for transparent base (transparent over this)
    - Dark mode: automatically apply via `@media (prefers-color-scheme: dark)`:
      - `var(--color-muted-dark)` for dark mode text (#A89B88)
      - `var(--color-background-dark)` for transparent base
    - Spacing tokens: `var(--spacing-4)` (12px), `var(--spacing-5)` (14px), `var(--spacing-strip-inset)` (10px)
    - Do NOT hardcode hex values; reference Story 3.1 token definitions
    - Ensure contrast ≥ 4.5:1 for WCAG AA (muted-dark on background-dark in design tools)

- [ ] Task 1b: Understand API contract (no implementation; documentation only)
  - [ ] **Current API shape (Story 3.6):** The shared-expenses balance endpoint currently returns:
    ```typescript
    GET /lists/{listId}/shared-expenses/balance
    {
      id: string;
      settleBalances: SettleBalance[];
      // balanceStatus DOES NOT YET EXIST
    }
    ```
  - [ ] **This story's contract:** Hardcode `isIncomplete={false}` in the component prop (no real data yet)
  - [ ] **Epic 5.4's contract:** API will add `balanceStatus` to response:
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
  - [ ] **Developer note:** Do NOT wire the component to real API data yet. That's Epic 5.4's responsibility. Keep this story's integration simple: `<IncompleteDisclosure isIncomplete={false} />`

- [ ] Task 2: Integrate component into shared-expenses view layout
  - [ ] **File:** Likely `ui/pages/[listId]/shared-expenses.tsx` or relevant shared-expenses page/component
  - [ ] **Placement:**
    - Below `<BalanceStrip>` (or settle-up strip component from Story 3.4)
    - Before the receipt list section
    - Same horizontal inset as strip
    - Example structure:
      ```tsx
      <div className="shared-expenses-view">
        <TopNav />
        <BalanceStrip ... />
        <IncompleteDisclosure isIncomplete={false} />  {/* Slot-only for now; no real data wired */}
        <SectionLabel>Receipts</SectionLabel>
        <ReceiptList ... />
        <TabBar />
      </div>
      ```
  - [ ] **Props wiring (for now, hardcoded or stubbed):**
    - `isIncomplete={false}` — no real data from API yet (Epic 5 will wire `balanceStatus?.isIncomplete` from API response)
    - `onResolve={undefined}` — not wired until Epic 5 Stories 5.2/5.4 add quarantine detail routes
  - [ ] **No styling regressions:**
    - Verify strip island layout unchanged
    - Verify receipt list still renders correctly below
    - Confirm spacing between strip and receipts still aligns to Soft-Ledger rhythm

- [ ] Task 3: Write tests for component
  - [ ] **Unit test:** `ui/components/__tests__/IncompleteDisclosure.test.tsx`
    - Test visibility: when `isIncomplete={true}`, component renders; when `false`/undefined, renders nothing
    - Test aria-label: screen reader text is present
    - Test dark mode: component uses dark tokens when theme is dark
    - Test callback: if `onResolve` is passed, verify it can be invoked (no-op in v1; Epic 5 adds behavior)
    - Do NOT fabricate API responses or quarantine data; test props only (AC #3)
  - [ ] **Integration test in shared-expenses flow:** `ui/__tests__/shared-expenses.integration.test.tsx`
    - Mount shared-expenses view with `isIncomplete={false}` → verify disclosure does not render
    - Mount with `isIncomplete={true}` → verify disclosure renders below strip
    - Verify tab order and keyboard navigation (disclosure is reachable after strip via Tab)
    - Verify no layout shift or visual regression in the view structure
  - [ ] **Accessibility check:**
    - Use axe-core or similar linter in test (or manual a11y review per Story 1.6 floor)
    - Verify WCAG 2.2 AA contrast on muted text against backgrounds (light and dark)
    - Verify aria-label is announced by screen readers
    - Verify keyboard access (Tab stops, no traps)
  - [ ] **CSS specificity & theming:**
    - Verify `.incomplete-disclosure` does not override or get overridden by `.balance-strip` or `.receipt-list` styles (test in browser DevTools)
    - Verify dark mode works: toggle OS dark mode while component is visible; muted-dark text remains readable
  - [ ] **Layout spacing edge cases:**
    - Test layout spacing: when both `BalanceStrip` and `IncompleteDisclosure` render, verify `margin-top: 0` on disclosure keeps spacing tight (14px) below strip
    - Test with longer text: if disclosure text wraps across multiple lines, verify `line-height: 1.4` keeps it readable and no visual clipping

- [ ] Task 4: Styling and theming
  - [ ] **CSS module or Tailwind config (match Story 3.1 Warm Balance setup):**
    - Define `incomplete-disclosure` class or component styles using Warm Balance tokens
    - Light mode:
      ```css
      .incomplete-disclosure {
        color: var(--color-muted);           /* #6E6456 */
        background: transparent;
        font-family: Manrope, system-ui, sans-serif;
        font-size: 0.62rem;
        font-weight: 400;
        line-height: 1.4;
        padding: 14px 12px;
        margin-inline: 10px;
        margin-top: 0;  /* flush below strip */
        margin-bottom: var(--spacing-4);
      }
      ```
    - Dark mode: automatically apply `--color-muted-dark`, `--bg-background-dark`
    - No border, no background fill (transparent to canvas)
  - [ ] **Responsive behavior:**
    - Same inset as strip on all viewport sizes
    - Typography size stays 0.62rem (meta); no rescaling
    - No mobile-specific variant; same appearance on phone and desktop
  - [ ] **No animations:**
    - Calm appearance; avoid fade-in, slide, or other motion (per UX-DR8, UX-DR19 Reduce Motion)
    - Instant appear/disappear based on `isIncomplete` boolean

- [ ] Task 5: Prepare for Epic 5 wiring (documentation only; no implementation)
  - [ ] **Comment block in component:** Add TODO or notes clarifying how Epic 5 will wire real data:
    ```typescript
    // TODO (Epic 5.2–5.4): Wire real incomplete data from API
    // - API response should include: balanceStatus.isIncomplete (bool)
    // - If incomplete, include: balanceStatus.unresolvedQuarantineCount, balanceStatus.unresolvedConflictCount
    // - onResolve callback will route to quarantine or conflict resolution detail view
    // - This story creates the slot; Epic 5 provides the behavior and real data.
    ```
  - [ ] **API response shape (stub documentation for Epic 5):**
    ```typescript
    // Expected API response shape (to be filled in Epic 5):
    interface BalanceStatus {
      isIncomplete: boolean;
      unresolvedQuarantineCount?: number;
      unresolvedConflictCount?: number;
    }
    // Shared-expenses API will include this in the balance summary response.
    ```

- [ ] Task 6: Documentation and CI
  - [ ] **Component storybook or example (optional, nice-to-have):**
    - Add a Storybook story for `<IncompleteDisclosure>` showing both `isIncomplete={true}` and `false` states
    - Example in story file for reference in Epic 5
  - [ ] **CI: type-checking, linting, tests**
    - `ui`: `npx tsc` → no TS errors
    - `ui`: `npx eslint components/IncompleteDisclosure.tsx` → clean lint
    - `ui`: `npm test -- IncompleteDisclosure.test.tsx` → all tests pass
    - `ui`: Visual regression (manual or screenshot) → no strip/layout changes
  - [ ] **Accessibility audit (manual or tool):**
    - Verify contrast ratios (muted text on backgrounds) meet WCAG AA in both light and dark
    - Verify aria-label reads correctly in screen reader (test on Safari VoiceOver or NVDA)
    - Verify keyboard navigation (Tab through shared-expenses surface; disclosure is reachable)

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

## Completion Checklist

Before marking this story **done** and pushing for code review:

- [ ] Branch created and named per AD-13: `feat/3/3-6-incomplete-disclosure-pattern-slot-only`
- [ ] Component implemented: `<IncompleteDisclosure>` with props (isIncomplete, onResolve, label)
- [ ] Component integrated into shared-expenses view (below strip, same inset)
- [ ] Tests written: visibility, a11y, dark mode, callback wiring
- [ ] Styling matches DESIGN.md Soft-Ledger + Warm Balance tokens (calm/muted)
- [ ] Accessibility verified: aria-label, contrast, keyboard access (WCAG 2.2 AA)
- [ ] No regressions: strip layout, receipt rendering, tab order unchanged
- [ ] CI green: TypeScript, linting, tests pass; no type errors
- [ ] Short how/why overview (see `story-close-overview-checklist.md`):
  - **What:** Created reusable `<IncompleteDisclosure>` component slotted below settle strip
  - **Why:** FR-43 pattern requires calm, non-false-positive disclosure of incomplete balances when Epic 5 wires quarantine data
  - **How:** Component accepts `isIncomplete` boolean prop; renders muted text below strip (same inset); Warm Balance tokens + aria-label for a11y; no real data yet (Epic 5 wires)
  - **What not to break:** Strip layout, receipt list rendering, Soft-Ledger spacing rhythm, keyboard navigation order, Warm Balance theming
- [ ] PR ready for code review (run `/code-review` when pushed)

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
