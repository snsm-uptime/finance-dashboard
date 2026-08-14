---
title: Reusable Sheet Component with Configurable Slots
type: refactor
created: 2026-08-12
status: done
route: one-shot
---

# Reusable Sheet Component with Configurable Slots

## Intent

**Problem:** The Sheet component was embedded in ListDetailMobileActions with hardcoded children-based API and FormHeaderActionHostProvider portal pattern. This prevented reuse with other forms that need different cornerAction content, custom close buttons, or dimension customization.

**Approach:** Extract Sheet into a standalone component with configurable slot props (title, cornerAction, closeButton, body) and add focus/accessibility enhancements discovered via adversarial review. Forms now provide all UI parts as props instead of children, making the component truly reusable.

## Suggested Review Order

1. [Sheet.tsx:15-30](#sheet-tsx-15-30) — Props type definition: new props (returnFocusRef, maxHeight) and clarifications for accessibility
2. [Sheet.tsx:40-60](#sheet-tsx-40-60) — Animation timing constant and closeRef logic for custom close buttons
3. [Sheet.tsx:73-80](#sheet-tsx-73-80) — Focus restoration on close via returnFocusRef
4. [Sheet.module.css:18-40](#sheet-module-css-18-40) — CSS variable for max-height customization
5. [ListDetailMobileActions.tsx:60-70](#list-detail-mobile-actions-tsx-60-70) — FAB button refs for focus management
6. [ListDetailMobileActions.tsx:114-163](#list-detail-mobile-actions-tsx-114-163) — Sheet usage with returnFocusRef, title as string, and new prop pattern

## Key Changes

- **Extracted Sheet.tsx** — 160 LOC, fully standalone component with portal rendering, animation, a11y, and keyboard traps
- **New props** — `returnFocusRef` (focus restoration), `maxHeight` (dimension control), clarified `title` and `closeButton` behavior
- **Fixes 12 adversarial findings** — Including focus management, backdrop interaction during close, animation timing constant, custom close button a11y, backdrop semantics, and memory concerns
- **Tests cornerAction slot** — Now used in all three Sheet instances (expense, split, invite) with fallback to default content
- **Maintains animations** — Cubic-bezier ease, prefers-reduced-motion support, 280ms timing on both CSS and JS

## Files Changed

- **ui/app/lists/Sheet.tsx** (new) — 160 lines
- **ui/app/lists/Sheet.module.css** (new) — 138 lines
- **ui/app/lists/ListDetailMobileActions.tsx** — Removed 140 LOC of Sheet impl, updated to use new Sheet component
- **ui/app/lists/ListDetailMobileActions.module.css** — Removed sheet-related styles (moved to Sheet.module.css)

## Commits

1. `b61248e` — Adapt forms for Sheet component slot pattern (hideBorder prop, sheet label)
2. `b14dbd0` — Extract reusable Sheet component with configurable slots
3. `c2253e3` — Address adversarial review findings (focus, a11y, customization)
4. `6f2b9de` — Let title expand when cornerAction is not provided
