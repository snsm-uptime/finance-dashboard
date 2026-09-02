---
title: 'Generic Tooltip component for icon buttons'
type: 'feature'
created: '2026-09-02'
status: 'in-progress'
review_loop_iteration: 1
context: []
baseline_commit: '0bcebffd54057aea197200c31561b3be7dcff7f8'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Icon-only buttons across the app (IconButton and TriSwitch options) rely only on the native `title` attribute for a hover hint, which is slow to appear, unstyled, and inconsistent with the app's visual language.

**Approach:** Build a small, generic `Tooltip` component (CSS-only show/hide, no new dependency) styled after the existing `CopyButton` "Copied!" bubble, and wire it centrally into `IconButton` (covers ~24 files / 42 usages for free) and directly into `TriSwitch`'s three icon-only options. Tooltip text reuses each button's existing `label`/`aria-label` string — no new copy is invented.

## Boundaries & Constraints

**Always:**
- Remove the native `title` attribute from buttons that now render the new tooltip (it duplicates the styled bubble on sustained hover, and mobile browsers don't reliably surface `title` on long-press anyway, so it wasn't a real fallback). `aria-label` remains and continues to carry the accessible name.
- Tooltip shows on `:hover` and `:focus-visible` only (no click/touch trigger, no new touch-handling subsystem).
- Reuse existing design tokens: `bg-foreground`/`text-background`, `text-[0.7rem] font-[550]`, existing rounded radius (`rounded-[6px]`), matching `CopyButton`'s bubble.
- Suppress the tooltip when `IconButton` renders with a `caption` (visible label already shown) — only 3 usages, all in `IndividualReviewPanel.tsx`.
- Suppress the tooltip while `IconButtonPopup` is open (`aria-expanded={true}` already present on the button) — the open panel already explains the action.
- `CopyButton` keeps its own "Copied!" bubble unchanged; it gets the idle-state tooltip for free once `Tooltip` lives inside `IconButton`, and the two must never render at the same time (the bubble already only shows when `copied` is true, so this is inherent, not something to add logic for).

**Ask First:** None anticipated — the internal opt-outs above are derivable from existing props (`caption`, `aria-expanded`), so no new API surface or human judgment call is expected mid-implementation.

**Never:**
- No new dependency (no floating-ui, radix, popper, portal). Positioning is a relative wrapper + absolute-positioned bubble, same convention as `CopyButton`.
- No touch/long-press JS handling — native `title` covers mobile.
- `Avatar.tsx` and `ChipTrigger`/`ChipOptionsPanel` are out of scope (not icon-only buttons or not buttons at all).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Idle hover | Pointer hovers a plain `IconButton` | Tooltip bubble fades in showing `label` | N/A |
| Keyboard focus | Tab focuses an `IconButton` | Tooltip bubble shows via `:focus-visible` | N/A |
| Caption present | `IconButton` rendered with `caption` prop | Tooltip suppressed (visible caption already labels it) | N/A |
| Popover open | `IconButtonPopup` trigger has `aria-expanded="true"` | Tooltip suppressed while expanded | N/A |
| Copy in progress | `CopyButton` in `copied` state | Existing "Copied!" bubble shows; generic tooltip does not also render | N/A |
| TriSwitch option | Pointer hovers or focuses a `TriSwitch` option button | Tooltip bubble shows `option.label` | N/A |

</frozen-after-approval>

## Code Map

- `ui/components/Tooltip/Tooltip.tsx` -- new generic component; wraps a trigger element, renders an absolutely-positioned bubble shown via CSS on hover/focus-visible
- `ui/components/Tooltip/Tooltip.module.scss` -- new; positioning + fade transition, mirrors `CopyButton`'s bubble styling
- `ui/components/IconButton/IconButton.tsx` -- wrap the rendered `<button>` in `Tooltip`; remove `title`; suppress tooltip when `caption` is set, `aria-expanded === true`, `label` is empty, or the button is `disabled`; forward layout classes (`flex-shrink-0`, `fill`'s width classes) to Tooltip's wrapper
- `ui/components/TriSwitch/TriSwitch.tsx` -- wrap each of the 3 option `<button>`s (lines ~93-101) in `Tooltip` using `option.label`; remove `title`; pass the switch's `disabled` through
- `ui/components/CopyButton/CopyButton.tsx` -- no changes; verify idle-state tooltip and "Copied!" bubble don't visually collide

## Tasks & Acceptance

**Execution:**
- [x] `ui/components/Tooltip/Tooltip.tsx` -- create generic `Tooltip` component (`{ label: string; disabled?: boolean; children: ReactNode }`, relative wrapper + absolute bubble, CSS-only visibility) -- reusable primitive for all icon buttons
- [x] `ui/components/Tooltip/Tooltip.module.scss` -- style the bubble (bg-foreground/text-background, 0.7rem/550 weight, rounded-[6px], fade-in transition, `pointer-events-none`, `z-10`) -- visual consistency with `CopyButton`'s existing bubble
- [x] `ui/components/IconButton/IconButton.tsx` -- wrap `<button>` in `Tooltip`, pass `label`, remove `title={label}`, set `disabled` on the tooltip when `caption` is truthy, `rest["aria-expanded"] === true`, `label` is empty, or the button itself is `disabled` -- centrally covers all ~24 consumer files with zero call-site changes; forward IconButton's layout classes (`flex-shrink-0`, `fill`'s width classes) onto Tooltip's wrapper element so the extra wrapper span doesn't change how the button sizes inside flex/grid parents
- [x] `ui/components/TriSwitch/TriSwitch.tsx` -- wrap each option `<button>` in `Tooltip` using `option.label`, remove `title={option.label}`, pass the switch's own `disabled` through to suppress the tooltip on disabled options -- only non-IconButton icon-only buttons identified in the app
- [x] `ui/components/Tooltip/Tooltip.test.tsx` -- unit tests for the I/O matrix scenarios (hover shows, focus shows, `disabled` suppresses, empty `label` suppresses) -- covers the new component's edge cases
- [x] `ui/components/IconButton/IconButton.test.tsx` -- add cases: tooltip suppressed when `disabled`, when `caption` is set, when `aria-expanded` is true -- closes coverage gap flagged in review
- [x] `ui/components/TriSwitch/TriSwitch.test.tsx` -- add a case asserting the three options keep their existing DOM/keyboard behavior (roving `tabIndex`, `role="radio"`) once wrapped in `Tooltip` -- closes coverage gap flagged in review

**Acceptance Criteria:**
- Given a plain `IconButton` (no `caption`), when hovered or keyboard-focused, then a styled tooltip bubble appears showing its `label`.
- Given an `IconButton` rendered with `caption`, when hovered, then no tooltip bubble appears (the visible caption already labels it).
- Given an `IconButtonPopup` trigger with its popover open, when hovered, then no tooltip bubble appears.
- Given a `CopyButton` in its `copied` state, when observed, then only the existing "Copied!" bubble renders, not a duplicate tooltip.
- Given a `TriSwitch` option, when hovered or focused, then a tooltip bubble appears showing that option's `label`.

## Spec Change Log

- **Iteration 1 (intent_gap, unresolved — pending human decision):** Blind Hunter + Edge Case Hunter review of the first implementation found that the frozen "Always: keep native `title` alongside the new tooltip" constraint, combined with the frozen CSS-only `:hover`/`:focus-visible` trigger, means the browser's native title tooltip and the new styled bubble can both render on a sustained hover — the exact scenario (pausing on an icon to understand it) this feature targets. Root cause is inside `<frozen-after-approval>`; code was reverted pending human resolution of the `title` question.
  - **KEEP for re-derivation once resolved** (implementation-quality fixes identified during the same review, applicable regardless of how the `title` question resolves):
    - Suppress the tooltip when the trigger button itself is `disabled` (IconButton's `disabled` prop, TriSwitch's `disabled` prop), not just for `caption`/`aria-expanded`.
    - Suppress the tooltip when `label` is an empty string.
    - `Tooltip`'s wrapper must forward IconButton's layout-relevant classes (`flex-shrink-0`, and `fill`'s `!w-full`/`min-w-0`) so wrapping the button in an extra `<span>` doesn't change how it sizes inside existing flex/grid parents across ~24 consumer files — IconButton's own code comments call out `flex-shrink-0` as load-bearing.
    - Add regression tests for `IconButton` (tooltip suppressed for `disabled`/`caption`/`aria-expanded`) and `TriSwitch` (radio roving-tabIndex/keyboard behavior intact after wrapping) — neither had dedicated coverage in the first pass.
    - The overall approach (CSS-only Tooltip, relative-wrapper + absolute-bubble, central wiring via `IconButton`, mirroring `CopyButton`'s bubble styling, no new dependency) held up well under review and should be preserved as-is.

## Design Notes

`Tooltip` renders as: `<span className="relative inline-flex">{children}<span className="tooltip-bubble">{label}</span></span>`, where the bubble uses `opacity-0 group-hover:opacity-100 peer-focus-visible:opacity-100` (or CSS module `:hover`/`:focus-within` selectors, whichever is simpler to keep `pointer-events-none` correct) transitioning over ~120ms, matching the codebase's existing transition durations (e.g. `IconButton`'s `duration-150`). Position above the trigger (`-top-7`, centered) unless a specific consumer needs a different side — start with "above" only since no scroll-clipping cases were found in the investigated call sites.

## Verification

**Commands:**
- `cd ui && npm run lint` -- expected: no new lint errors
- `cd ui && npm test -- Tooltip IconButton TriSwitch CopyButton` -- expected: all pass, including new Tooltip tests

**Manual checks (if no CLI):**
- Run the app, hover/focus a handful of `IconButton` instances across different pages (lists, upload, cards) and confirm the tooltip appears, is legible in both light and dark theme, and doesn't clip at viewport edges for buttons near the top of the screen.
