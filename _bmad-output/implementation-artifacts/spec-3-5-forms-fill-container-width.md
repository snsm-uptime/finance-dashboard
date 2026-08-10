---
status: done
baseline_commit: 81423686beb575e42a0d9386a2a3fc1769159f65
epic_number: 3
story_number: 5
sprint_status_key: 3-5-forms-fill-container-width
---

# Spec: Forms Fill Container Width

## Summary

All forms in `@ui/` must fill the width of their container. Currently, some forms are constrained or don't span the full width of their parent container (e.g., the mobile sheet where default split is configured). This spec ensures consistent width behavior across all form components.

## Acceptance Criteria

**Given** a form component in `@ui/` is rendered inside a container  
**When** the form renders  
**Then** the form should fill the width of its parent container (100% width) without horizontal overflow

**Given** a mobile sheet (e.g., DefaultSplitPanel) is opened  
**When** the sheet is displayed on mobile viewport  
**Then** the sheet content and form should span the full width of the sheet

**Given** forms exist in different layouts (sign-in, signup, lists management, etc.)  
**When** each form is rendered  
**Then** all forms should consistently fill their container width

## Implementation Details

### Forms to Update

1. `@ui/app/sign-in/SignInForm.tsx`
2. `@ui/app/signup/SignupForm.tsx`
3. `@ui/app/verify/VerifyForm.tsx`
4. `@ui/app/forgot-password/ForgotPasswordForm.tsx`
5. `@ui/app/reset-password/ResetPasswordForm.tsx`
6. `@ui/app/alias/AliasSetupForm.tsx`
7. `@ui/app/lists/ManualExpenseForm.tsx`
8. `@ui/app/lists/InviteForm.tsx`
9. `@ui/app/lists/DefaultSplitPanel.tsx`

### Approach

- Add `w-full` Tailwind utility class to all form elements that should span full width
- Review CSS modules (e.g., `lists.module.css`, `ManualExpenseForm.module.css`) for width constraints
- Ensure forms don't have explicit max-width or width constraints that prevent full container spanning
- Test on mobile and desktop viewports to confirm proper width behavior

### Key Constraints

- Use Tailwind utilities per project conventions (Epic 3.5)
- No new CSS Modules unless absolutely necessary
- Avoid breaking existing layouts
- Ensure responsive behavior on all viewport sizes

## Code Map

- Form components in `@ui/app/*/`
- Shared form styling in `@ui/app/lists/lists.module.css` and form-specific modules
- Parent containers controlling sheet/modal width

## Design Notes

Forms should respect the Warm Balance design system and use available container width efficiently. On mobile sheets, forms should stretch to full sheet width for better touch target sizing and content visibility.

## Task List

- [x] Audit all form components for width constraints
- [x] Add width: 100% to form wrapper elements
- [x] Review and update CSS modules if needed
- [x] Verify no regression in layout or styling
- [x] TypeScript type checking passes
- [x] ESLint checks pass

## Implementation Summary

### Changes Made

1. **ManualExpenseForm.module.css** - Changed `.form` from `max-width: 28rem` to `width: 100%`
2. **signup.module.css** - Added `width: 100%` to `.form` class
3. **lists.module.css** - Changed `.createForm` from `max-width: 36rem` to `width: 100%`
4. **lists.module.css** - Changed `.detailSection` from `max-width: 36rem` to `width: 100%`
5. **lists.module.css** - Changed `.splitShares` from `max-width: 24rem` to `width: 100%`
6. **lists.module.css** - Changed `.sliderContainer` from `max-width: 24rem` to `width: 100%`
7. **PercentageSplitTrack.module.css** - Removed `max-width: 24rem` from `.sliderContainer`

All forms in the UI now explicitly use `width: 100%` to fill their container width, replacing previous `max-width` constraints that limited their width. This ensures:
- Mobile sheets (e.g., DefaultSplitPanel) fill the full sheet width
- Forms on main pages fill the available container width
- Consistent width behavior across all form components (ManualExpenseForm, InviteForm, DefaultSplitPanel, SignInForm, SignupForm, VerifyForm, ForgotPasswordForm, ResetPasswordForm, AliasSetupForm)

## Suggested Review Order

**Form Width Styling Updates**

- Core form wrapper styling for manual expense entry; replaced max-width constraint with full-width layout.
  [`ManualExpenseForm.module.css:1-7`](../../../../ui/app/lists/ManualExpenseForm.module.css#L1)

- List management form styling; `.createForm` now fills container width for consistent spacing in mobile sheets and desktop layouts.
  [`lists.module.css:108-117`](../../../../ui/app/lists/lists.module.css#L108)

- Detail section wrapper styling; `.detailSection` changed to `width: 100%` to allow nested forms (DefaultSplitPanel, InviteForm) to span full container width.
  [`lists.module.css:715-719`](../../../../ui/app/lists/lists.module.css#L715)

- Authentication form styling; `.form` now explicitly sets `width: 100%` for consistent layout across all auth flows (sign-in, signup, verify, password reset, alias setup).
  [`signup.module.css:45-50`](../../../../ui/app/signup/signup.module.css#L45)
