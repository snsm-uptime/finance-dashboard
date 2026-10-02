---
title: Apply Next.js Link Standard with Polymorphic IconButton
type: one-shot
created: 2026-10-02
status: done
route: one-shot
---

# Apply Next.js Link Standard with Polymorphic IconButton

## Intent

**Problem:** ListDetailMobileActions used legacy Next.js Link pattern (`passHref`, `legacyBehavior`) which is deprecated in Next.js 13+. This created nested interactive elements (Link wrapping IconButton) that violate semantic HTML and accessibility best practices.

**Approach:** Make IconButton polymorphic to support rendering as either a button (default) or a Next.js Link (when `href` prop provided). This consolidates styling logic in one place, eliminates legacy Link patterns, and uses proper semantic HTML for navigation vs action elements.

---

## Changes

### Files Modified

**ui/components/IconButton/IconButton.tsx** — Enhanced component with Link support
- Added `href` prop (renders as Link when provided, button otherwise)
- Split Props type into `ButtonProps` and `LinkProps` for proper TypeScript discrimination
- Conditional rendering: Link for navigation, button for actions
- All variants and state-based styles work for both elements
- Maintains single source of truth for button/link styling

**ui/app/lists/ListDetailMobileActions.tsx** — Simplified import statement link
- Removed unnecessary `Link` import
- Removed `passHref` and `legacyBehavior` from Link wrapper
- Removed `as="a"` non-standard prop from IconButton
- Now uses `IconButton` with `href` prop directly
- Removed unused `importStatementLinkRef` reference

### Commit

```
f54fa19 feat: Make IconButton polymorphic to support Link rendering
```

---

## Suggested Review Order

1. **Type changes** — `ui/components/IconButton/IconButton.tsx:7–60` — Verify the `ButtonProps`/`LinkProps` discriminated union correctly types both cases
2. **Conditional rendering** — `ui/components/IconButton/IconButton.tsx:73–120` — Confirm Link and button branches render identically styled content
3. **ListDetailMobileActions** — `ui/app/lists/ListDetailMobileActions.tsx:122–128` — Verify the IconButton usage with `href` renders as a link with button styling
4. **Tests** — All 17 IconButton tests pass; ListDetailMobileActions test mocks Link as `<a>` which still matches selector

---

## Verification

- ✅ TypeScript passes (no new errors)
- ✅ IconButton tests (17/17) pass
- ✅ Semantic HTML: navigation uses Link, actions use button
- ✅ No nested interactive elements
- ✅ Single styling source for both button and link variants
- ✅ Follows Next.js upgrade standard: https://nextjs.org/docs/app/guides/upgrading/codemods#remove-a-tags-from-link-components
