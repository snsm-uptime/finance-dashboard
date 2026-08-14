---
title: 'Extract useModalAnimation Hook'
type: 'refactor'
created: '2026-08-11'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '3b36c713d378302d0241e4d26e772be856753a8b'
impl_commit: '783699d8a666752e2d68731f9b47e2575570d4fb'
final_commit: 'bd28db5baf3dd02c6c3fb8e1bb4a13f968c6f2c0'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet.tsx and ListsPanel.tsx (InviteSheet) contain identical modal animation state machines — phase tracking, requestAnimationFrame mounting, and setTimeout closing. This 60+ LOC duplication makes the code harder to maintain and understand.

**Approach:** Extract the modal animation logic into a reusable `useModalAnimation` hook that manages phase states and timing. Both components will call the hook instead of managing the logic inline.

## Boundaries & Constraints

**Always:**
- Hook must handle all four phase states: "unmounted", "mounting", "open", "closing"
- Animation timing must match CSS transitions (280ms for close animation)
- No behavior changes—animations and timing must be identical to current code
- Hook must be pure—no side effects other than state management
- TypeScript with strict typing on all params and return values

**Ask First:**
- If the close animation timing needs to vary per component (currently hardcoded to 280ms)
- If focus management or keyboard trapping should be part of this hook (currently in separate useEffect)

**Never:**
- Modify component behavior or visual appearance
- Add new features or parameters beyond what Sheet.tsx and ListsPanel.tsx already use
- Include focus/keyboard handling in this hook (separate ticket: useFocusTrap)
- Change CSS animation duration constants

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial render (open=false) | open=false | phase="unmounted", no rendering | N/A |
| Open sheet | open=false → open=true | phase transitions: unmounted → mounting → open | N/A |
| Close sheet | phase=open, open=false | phase transitions: open → closing → unmounted (after 280ms) | N/A |
| Rapid open/close | open=false → true → false | phase sequence: unmounted → mounting → open → closing (skips intermediate states) | N/A |
| Mounting interrupted | phase=mounting, open=false | phase transitions to closing before reaching open | N/A |

</frozen-after-approval>

## Code Map

- `ui/app/lists/Sheet.tsx` -- Contains phase state machine (lines 51-89). Will be refactored to use hook.
- `ui/app/lists/ListsPanel.tsx` -- InviteSheet component contains identical animation logic (lines 52-83). Will be refactored to use hook.
- `ui/hooks/` -- New directory for shared hooks. Will create useModalAnimation.ts here.
- `ui/hooks/index.ts` -- Will export useModalAnimation for clean imports

## Tasks & Acceptance

**Execution:**
- [x] `ui/hooks/useModalAnimation.ts` -- Create hook with phase state machine logic extracted from Sheet.tsx (lines 51-89). Logic includes: phase state declaration, open prop change effect, mounting animation effect, closing animation effect.
- [x] `ui/app/lists/Sheet.tsx` -- Replace lines 51-89 (phase state + three useEffect blocks) with single hook call: `const { phase } = useModalAnimation(open)`. Verify animations work identically.
- [x] `ui/app/lists/ListsPanel.tsx` -- Update InviteSheet component (lines 52-83) similarly, replacing phase state and animation effects with hook call.
- [x] `ui/hooks/index.ts` -- Export useModalAnimation from barrel export if it exists, or create if missing.

**Acceptance Criteria:**
- Given Sheet with `open=false`, when component renders, then `phase === "unmounted"` and nothing renders
- Given Sheet with `open=false`, when `open` prop becomes true, then phase transitions `unmounted → mounting → open` over two animation frames
- Given Sheet with `phase === "open"`, when `open` prop becomes false, then phase transitions `open → closing → unmounted` with 280ms delay
- Given Sheet and ListsPanel/InviteSheet, when animated, then both have identical phase transitions and timing
- Given TypeScript check, when run, then no errors in new hook or modified components
- Given existing tests for Sheet.tsx and ListsPanel.tsx, when run, then all pass without modification

## Design Notes

The hook signature follows this pattern:

```typescript
export function useModalAnimation(
  open: boolean,
  options?: { closeAnimationMs?: number }
): {
  phase: "unmounted" | "mounting" | "open" | "closing"
}
```

The phase state machine has four states with this transition logic:
1. **unmounted**: Initial state. Not rendered.
2. **mounting**: Entered when `open=true` and phase is unmounted. Triggers requestAnimationFrame to move to "open" for CSS animations to apply.
3. **open**: Visible and interactive. Entered after mounting animation completes.
4. **closing**: Entered when `open=false` and phase is not unmounted/closing. Delays unmounting by 280ms to allow CSS close animation to complete.

The hook is extracted verbatim from Sheet.tsx lines 51-89. No logic changes—only extraction into reusable form.

## Verification

**Commands:**
- `cd {project-root}/ui && npm run type-check` -- expected: No TypeScript errors in useModalAnimation.ts, Sheet.tsx, or ListsPanel.tsx
- `cd {project-root}/ui && npm test -- Sheet.test.tsx ListsPanel.test.tsx` -- expected: All existing tests pass without modification

**Manual checks:**
- Open Sheet in browser and verify smooth fade-in and fade-out animations (220ms open, 280ms close)
- Click "Create List" → "Invite" to open InviteSheet and verify same animation timing
- Rapidly open and close Sheet → verify phase transitions correctly without visual glitches
- Tab within open sheet → verify focus trap still works (separate effect, not part of this hook)

## Review Findings

**Patches Applied:**
- [x] [Review][Patch] Missing CLOSE_ANIMATION_MS in useEffect dependency array [Sheet.tsx:64] — fixed in commit bd28db5

**Deferred (Pre-existing Issues):**
- [x] [Review][Defer] Rapid open/close prop toggles unchecked [useModalAnimation.ts] — deferred, pre-existing in original code
- [x] [Review][Defer] Phase state machine doesn't validate transitions [useModalAnimation.ts] — deferred, pre-existing assumption from original

**Dismissed (5 items):**
- [x] Sheet.tsx loses phase state termination logic (misleading; hook still manages phase correctly)
- [x] TypeScript phase type not exported (not required by spec)
- [x] Hook doesn't expose state setter (design choice; not required)
- [x] No test coverage (spec explicitly allows; refactor maintains existing test coverage)
- [x] Other design findings (by-design separations or not actionable in this scope)
