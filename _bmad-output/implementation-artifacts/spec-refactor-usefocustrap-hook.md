---
title: 'Extract useFocusTrap Hook'
type: 'refactor'
created: '2026-08-11'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'fc02db95c55d069d08a1f1523abe780fbf6efce3'
completed_commit: 'f8e24dc61a7d3f45d6b17d34c3c8f8b2e9c0d1a2'
context: ["_bmad-output/implementation-artifacts/refactor-ticket-status.yaml", "_bmad-output/implementation-artifacts/refactor-hooks-and-components-tickets.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet.tsx and ListsPanel.tsx (InviteSheet component) contain identical focus trap and keyboard handling logic (~35 LOC each). When either needs updates, both must change in parallel — risky and unmaintainable.

**Approach:** Extract focus trap logic into a reusable `useFocusTrap` hook that both components use. The hook handles: Tab containment, Shift+Tab reversal, Escape key, focus initialization, body overflow, and return-focus on cleanup.

## Boundaries & Constraints

**Always:**
- Hook API matches signature defined in refactor-hooks-and-components-tickets.md (TICKET 1.2)
- Behavior is identical in both consumers (Sheet.tsx and InviteSheet) — no unintended changes
- Focus trap is active only when `isActive === true` (matches phase === "open")
- Focusable selector matches current implementation exactly: `'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'`
- Tests pass for both components without modification to their test expectations

**Ask First:**
- If focusable element selection needs to differ per component (none expected, but flag if found during implementation)

**Never:**
- Do not change animation timing or phase state logic — those are handled by useModalAnimation hook
- Do not include return-focus-on-close in this hook (Sheet.tsx handles that separately via phase === "closing")
- Do not break existing component behavior or add new dependencies on modal timing

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| **Activate focus trap** | `isActive=true`, ref points to modal with 3+ focusable elements | Focus moves to defaultFocusRef or first focusable; Tab/Shift+Tab trapped; body overflow hidden | N/A |
| **Deactivate focus trap** | `isActive=false` (phase changes from "open") | Body overflow restored; keyboard listener removed; no focus change | N/A |
| **Tab at last focusable** | `isActive=true`, user presses Tab on last button | Focus wraps to first focusable element | N/A |
| **Shift+Tab at first focusable** | `isActive=true`, user presses Shift+Tab on first input | Focus wraps to last focusable element | N/A |
| **Escape key pressed** | `isActive=true`, user presses Escape | `onEscapePress` callback fires (if provided); no default behavior | N/A |
| **No focusable elements** | `isActive=true`, container has zero focusable elements | Tab/Shift+Tab ignored; Escape still handled | N/A |
| **Dynamic focusable content** | Container content changes while `isActive=true` | Focus trap queries focusable elements on each Tab/Shift+Tab (handles new content) | N/A |
| **returnFocusRef cleanup** | `isActive` becomes false, `returnFocusRef` provided | Focus returns to returnFocusRef.current (if available) | N/A |

</frozen-after-approval>

## Code Map

- `ui/hooks/useFocusTrap.ts` -- New hook to be created; exports the focus trap behavior
- `ui/app/lists/Sheet.tsx` (lines 67-100) -- Contains focus trap effect to extract and refactor
- `ui/app/lists/ListsPanel.tsx` (InviteSheet, lines 55-88) -- Contains identical focus trap logic to extract and refactor
- `ui/hooks/index.ts` -- Export the new hook for public API

## Tasks & Acceptance

**Execution:**
- [x] `ui/hooks/useFocusTrap.ts` -- Create hook with signature and full implementation -- Centralizes duplicate focus trap logic; enables reuse across all modal-like components
- [x] `ui/app/lists/Sheet.tsx` (lines 67-100) -- Remove focus trap useEffect; call useFocusTrap hook with appropriate options -- Reduces code by ~30 LOC; behavior unchanged
- [x] `ui/app/lists/ListsPanel.tsx` InviteSheet (lines 55-88) -- Remove focus trap useEffect; call useFocusTrap hook with appropriate options -- Reduces code by ~30 LOC; behavior unchanged
- [x] `ui/hooks/index.ts` -- Export useFocusTrap from the hook module -- Makes hook available for import by other components

**Acceptance Criteria:**
- Given Sheet.tsx is open, when Tab is pressed on the last focusable element, then focus wraps to the first focusable element
- Given Sheet.tsx is open, when Shift+Tab is pressed on the first focusable element, then focus wraps to the last focusable element
- Given Sheet.tsx is open, when Escape key is pressed, then onClose callback fires and sheet begins closing animation
- Given Sheet.tsx is closed, when document.body.style.overflow is checked, then it matches its pre-open value
- Given Sheet.tsx with returnFocusRef pointing to a button, when sheet closes, then focus returns to that button
- Given InviteSheet component, when the same scenarios above are tested, then behavior is identical to Sheet.tsx
- Given the hook is called with `isActive=false`, when Tab or Escape is pressed, then no keyboard trap behavior occurs
- Given a container with zero focusable elements, when Tab is pressed, then Tab event is ignored (no error, no exception)

## Spec Change Log

**Review 1 (Blind Hunter, Edge Case Hunter) — 2026-08-12:**

Patches applied:
- Tab/Shift+Tab now call `event.stopPropagation()` to prevent event bubbling to ancestors (Blind Hunter #2)
- Removed `returnFocusRef` parameter from hook — return focus timing is parent's responsibility (Sheet.tsx retains separate effect for CLOSE_ANIMATION_MS delay) (Blind Hunter #7)
- Optimized dependency array: removed `containerRef` (stable ref) and `returnFocusRef` (removed) to prevent unnecessary re-runs (Blind Hunter #1)

Deferred (pre-existing or future improvements):
- Body overflow race condition with nested modals (Blind Hunter #3) — Pre-existing in original code
- ARIA role support for custom interactive elements (Blind Hunter #5) — Future enhancement
- Portal-rendered focusable elements (Blind Hunter #4) — Architectural limitation, not in scope
- Focus validation and unit tests (Blind Hunter #6, #9, #10, #11) — Nice-to-have improvements

Keep instructions:
- Tab trapping logic, Shift+Tab reversal, Escape handling — all working correctly
- Initial focus to defaultFocusRef or first focusable — preserved
- Body overflow management — preserved and working

## Verification

**Commands:**
- `npm test -- Sheet --no-coverage` -- expected: All existing Sheet.tsx tests pass (focus trap behavior already covered by existing tests)
- `npm test -- lists --no-coverage` -- expected: All ListsPanel/InviteSheet tests pass (identical behavior, same test expectations)
- `npm run build` -- expected: TypeScript compiles without errors; no unused imports

**Manual checks (if no CLI):**
- Open Sheet component in browser dev environment; press Tab repeatedly — focus should trap at boundaries, not leave the sheet
- With keyboard only, open a sheet, press Escape — sheet should close
- Open Sheet, then close it; verify that focus returns to the button that opened it (if returnFocusRef was provided)
- Repeat the above checks with InviteSheet in ListsPanel
- Inspect InviteSheet close button; verify it receives focus when sheet opens

## Suggested Review Order

**Hook Implementation**

- New hook centralizes focus trap logic: Tab containment, Shift+Tab reversal, Escape handling, body overflow
  [`useFocusTrap.ts:1-68`](../../ui/hooks/useFocusTrap.ts#L1)

**Component Integration**

- Sheet.tsx refactored to use hook; retains separate return-focus effect for CLOSE_ANIMATION_MS timing
  [`Sheet.tsx:67-72`](../../ui/app/lists/Sheet.tsx#L67)

- ListsPanel.tsx (InviteSheet) refactored to use hook; identical pattern to Sheet
  [`ListsPanel.tsx:55-60`](../../ui/app/lists/ListsPanel.tsx#L55)

**Hook Export**

- Export useFocusTrap from hooks module for public API
  [`hooks/index.ts:2`](../../ui/hooks/index.ts#L2)
