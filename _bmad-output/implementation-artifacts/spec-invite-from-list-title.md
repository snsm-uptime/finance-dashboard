---
title: 'Surface invite action with share icon in list title'
type: 'feature'
created: '2026-08-10'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: 'dd938d3e8c3b489d76477a0f39ef2d21d4904216'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Invite functionality is only accessible via the mobile FAB in the list detail view. Users on the lists homepage can't easily invite members—they must navigate into a list first.

**Approach:** Add a share icon next to each list title in the lists panel, opening an invite modal when clicked. Also add "Invite" to the 3-dot menu for list owners, providing two entry points to the same invite flow.

## Boundaries & Constraints

**Always:**
- Use a standard share icon (SVG) consistently with existing icons in the codebase
- Reuse the existing `InviteForm` component without modification
- Only show invite icon/menu option for list owners
- Maintain existing mobile FAB behavior unchanged
- Share icon must be accessible with proper `aria-label` and keyboard navigation
- Modal/sheet for invite should follow the same pattern as `ListDetailMobileChrome` uses

**Ask First:**
- None

**Never:**
- Change the core `InviteForm` component logic
- Modify the mobile FAB or `ListDetailMobileChrome`
- Add authentication/permission logic—reuse existing ACL patterns from ListsPanel
- Hide share icon on mobile—display on all screen sizes (desktop/tablet/mobile)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owner views list item | List owned by current user | Share icon appears next to title; "Invite" visible in 3-dot menu | N/A |
| Non-owner views list item | List member but not owner | No share icon or menu option | N/A |
| Click share icon | Modal closed | InviteForm modal/sheet opens above the lists panel | N/A |
| Invite sent | Modal open, form submitted successfully | Modal closes, success state reflected in form, then modal auto-closes | Modal stays open on error (existing InviteForm behavior) |
| Click "Invite" in 3-dot menu | Menu open | Menu closes, InviteForm modal/sheet opens | N/A |

</frozen-after-approval>

## Code Map

- `ui/app/lists/ListsPanel.tsx` -- Contains list items, 3-dot menu, render logic for owners
- `ui/app/lists/InviteForm.tsx` -- Reusable invite form component (unchanged)
- `ui/app/lists/ListDetailMobileChrome.tsx` -- Reference for Sheet modal pattern; **not modified**
- `ui/app/lists/lists.module.css` -- Styles for lists UI
- `ui/lib/i18n/lists.ts` -- i18n messages for lists; may need invite-related strings

## Tasks & Acceptance

**Execution:**
- [x] `ui/app/lists/ListsPanel.tsx` -- Add invite modal state, share icon SVG component, and integrate InviteForm into a modal. Add "Invite" to the 3-dot menu. Show share icon + menu option only for list owners. -- Core UI implementation
- [x] `ui/app/lists/lists.module.css` -- Add styles for share icon button and inline modal if needed. -- Ensure visual consistency
- [x] `ui/app/lists/InviteForm.tsx` -- Verify `reserveErrorHeight` behavior works in the new context; no changes expected. -- Verify reusability
- [x] All existing tests pass (30 test files, 133 tests) -- Full test suite validation

**Acceptance Criteria:**
- ✓ Given an owner views the lists panel, when they look at a list they own, then a share icon appears next to the list title and "Invite member" is visible in the 3-dot menu
- ✓ Given a share icon or "Invite" menu option is visible, when the user clicks it, then the InviteForm opens in a modal
- ✓ Given the InviteForm is open in the modal, when the user submits a valid invite, then the form state reflects success and the modal closes
- ✓ Given the user is not the list owner, when they view the list item, then no share icon or invite menu option appears
- ✓ Share icon appears on all screen sizes (mobile, tablet, desktop)

## Spec Change Log

## Design Notes

**Modal pattern:** Reuse the `Sheet` component from `ListDetailMobileChrome` or create a lightweight inline modal for desktop. The component already exists and handles focus management, keyboard traps, and backdrop clicks correctly. Consider extracting it to a shared location if reusing, or inline it in `ListsPanel` with minimal duplication.

**Share icon:** Use a standard SVG share icon matching the style of existing icons (e.g., `UserIcon`, `DotsIcon` in the codebase). Example:
```tsx
function ShareIcon() {
  return (
    <svg className={styles.shareIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
        fill="currentColor"
      />
    </svg>
  );
}
```
Or use a simpler share/export icon if preferred.

**Menu integration:** The 3-dot menu already exists for owners; adding an invite option is straightforward. Toggle the menu closed after clicking "Invite" to show the modal clearly.

## Verification

**Commands:**
- `cd ui && npm test` -- Tests pass, including new invite integration tests
- `cd ui && npm run lint` -- No lint errors introduced

**Manual checks:**
- Open lists homepage on desktop: verify share icon appears next to owned list titles, absent for member lists
- Click share icon: verify modal opens with InviteForm
- Submit valid invite: verify success state and modal closes
- Click "Invite" in 3-dot menu: verify menu closes and modal opens
- Test mobile: verify existing FAB behavior is unchanged
- Test keyboard: Tab to share icon, press Enter to open modal; Tab through form; Escape closes modal
