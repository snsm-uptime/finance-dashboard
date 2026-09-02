---
title: 'Generic Tooltip component for icon buttons'
type: 'feature'
created: '2026-09-02'
status: 'done'
review_loop_iteration: 3
context: []
baseline_commit: 'fb1ad8ac9e2b90797a379a0de25ad4d7e7042b82'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Icon-only buttons across the app (IconButton and TriSwitch options) rely only on the native `title` attribute for a hover hint, which is slow to appear, unstyled, and inconsistent with the app's visual language.

**Approach:** Build a small, generic `Tooltip` component styled after the existing `CopyButton` "Copied!" bubble, and wire it centrally into `IconButton` (covers ~24 files / 42 usages for free) and directly into `TriSwitch`'s three icon-only options. Tooltip text reuses each button's existing `label`/`aria-label` string — no new copy is invented. `Tooltip` clones its single trigger child (no extra wrapper DOM node, so it never disturbs a consumer's structural CSS — see Iteration 2 change log) and portals the bubble into `document.body`, positioned from the trigger's `getBoundingClientRect()`, so it always escapes `overflow:hidden` ancestors.

## Boundaries & Constraints

**Always:**
- Remove the native `title` attribute from buttons that now render the new tooltip (it duplicates the styled bubble on sustained hover, and mobile browsers don't reliably surface `title` on long-press anyway, so it wasn't a real fallback). `aria-label` remains and continues to carry the accessible name.
- Tooltip shows on pointer hover and keyboard focus-visible only (no click/touch trigger). Since the bubble is portaled out of the trigger's DOM subtree, visibility is driven by a small `useState` + `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` on the cloned trigger, not CSS pseudo-classes (CSS `:hover`/`:has(:focus-visible)` can't reach across a portal boundary).
- Reuse existing design tokens: `bg-foreground`/`text-background`, `text-[0.7rem] font-[550]`, existing rounded radius (`rounded-[6px]`), matching `CopyButton`'s bubble.
- Suppress the tooltip when `IconButton` renders with a `caption` (visible label already shown) — only 3 usages, all in `IndividualReviewPanel.tsx`.
- Suppress the tooltip while `IconButtonPopup` is open (`aria-expanded={true}` already present on the button) — the open panel already explains the action.
- `CopyButton` keeps its own "Copied!" bubble unchanged; it gets the idle-state tooltip for free once `Tooltip` lives inside `IconButton`, and the two must never render at the same time (the bubble already only shows when `copied` is true, so this is inherent, not something to add logic for).

**Ask First:** None anticipated — the internal opt-outs above are derivable from existing props (`caption`, `aria-expanded`), so no new API surface or human judgment call is expected mid-implementation.

**Never:**
- No third-party dependency (no floating-ui, radix, popper). `createPortal` is React's own API, not a new dependency, and is required to escape `overflow:hidden` ancestors — see Iteration 2 change log.
- Tooltip does not add a wrapper DOM element around its trigger (clone the child instead) — existing structural CSS in `ButtonGroup`, `FormIconSubmit`, and `TriSwitch` depends on the trigger button being its parent's direct/first/last child; see Iteration 2 change log.
- No touch/long-press JS handling for showing the tooltip on tap — touch users still get the accessible name via `aria-label`, same as any other accessibility-tree-only label.
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
| Clipping ancestor | Trigger sits inside an `overflow:hidden` container (e.g. a rounded-corner card) | Portaled bubble still renders fully visible, not clipped | N/A |
| Grouped/structural trigger | Trigger is the direct child of a parent with structural CSS (`ButtonGroup`'s `:first-child`/`:last-child`/divider selectors, `TriSwitch`'s `1fr` grid columns) | Trigger's DOM position/adjacency is unchanged (no wrapper inserted); structural CSS keeps working | N/A |

</frozen-after-approval>

## Code Map

- `ui/components/Tooltip/Tooltip.tsx` -- new generic component; clones its single trigger child (adds ref + hover/focus handlers, no wrapper element), portals an absolutely-positioned bubble into `document.body` on hover/focus, positioned from the trigger's `getBoundingClientRect()`
- `ui/components/Tooltip/Tooltip.module.scss` -- new; bubble styling + fade transition, mirrors `CopyButton`'s bubble styling (positioning itself is inline style, computed in JS, not CSS-anchored)
- `ui/components/IconButton/IconButton.tsx` -- pass the `<button>` as `Tooltip`'s single child (no structural change to what IconButton renders as its own root); remove `title`; suppress tooltip when `caption` is set, `aria-expanded === true`, `label` is empty, or the button is `disabled`
- `ui/components/TriSwitch/TriSwitch.tsx` -- wrap each of the 3 option `<button>`s (lines ~93-101) as `Tooltip`'s child using `option.label`; remove `title`; pass the switch's `disabled` through
- `ui/components/CopyButton/CopyButton.tsx` -- no changes; verify idle-state tooltip and "Copied!" bubble don't visually collide

## Tasks & Acceptance

**Execution:**
- [x] `ui/components/Tooltip/Tooltip.tsx` -- create generic `Tooltip` component (`{ label: string; disabled?: boolean; children: ReactElement }`). Clone the single child via `cloneElement` to attach `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` and a merged ref (combine any ref already on `children` with Tooltip's own measurement ref — do not clobber `IconButton`'s forwarded ref); no wrapper DOM element. On show, read the trigger's `getBoundingClientRect()` and `createPortal` the bubble into `document.body`, `position: fixed` at the computed coordinates (centered above the trigger, matching prior styling); suppress entirely when `disabled` or `label` is falsy -- reusable primitive for all icon buttons, DOM-structure-neutral, clipping-safe
- [x] `ui/components/Tooltip/Tooltip.module.scss` -- style the bubble (bg-foreground/text-background, 0.7rem/550 weight, rounded-[6px], fade-in transition, `pointer-events-none`, `z-10`) -- visual consistency with `CopyButton`'s existing bubble; positioning itself stays inline (computed coordinates), only visual chrome lives here
- [x] `ui/components/IconButton/IconButton.tsx` -- pass the existing `<button>` as `Tooltip`'s child unchanged (IconButton's own render root stays the `<button>`, nothing wraps it), `label`, remove `title={label}`, set `disabled` on the tooltip when `caption` is truthy, `rest["aria-expanded"] === true`, `label` is empty, or the button itself is `disabled` -- centrally covers all ~24 consumer files with zero call-site changes and no structural DOM change, so `ButtonGroup`'s `cloneElement(child, { className })` and `FormIconSubmit`'s `className` forwarding keep working exactly as before
- [x] `ui/components/TriSwitch/TriSwitch.tsx` -- wrap each option `<button>` as `Tooltip`'s child using `option.label`, remove `title={option.label}`, pass the switch's own `disabled` through to suppress the tooltip on disabled options -- the button stays the direct `1fr` grid-column child, so equal-width layout is unaffected
- [x] `ui/components/Tooltip/Tooltip.test.tsx` -- unit tests for the I/O matrix scenarios (hover shows, focus shows, `disabled` suppresses, empty `label` suppresses, no wrapper element inserted around the child, bubble portaled to `document.body` rather than nested under the trigger) -- covers the new component's edge cases
- [x] `ui/components/IconButton/IconButton.test.tsx` -- add cases: tooltip suppressed when `disabled`, when `caption` is set, when `aria-expanded` is true; assert `IconButton`'s root rendered node is still the `<button>` itself (no wrapper) -- closes coverage gap flagged in review
- [x] `ui/components/TriSwitch/TriSwitch.test.tsx` -- add a case asserting the three options keep their existing DOM/keyboard behavior (roving `tabIndex`, `role="radio"`, still the direct grid child) once wrapped in `Tooltip` -- closes coverage gap flagged in review
- [x] `ui/components/ButtonGroup/ButtonGroup.test.tsx` -- add/confirm a case that `cloneElement`-based `className` forwarding (the `.item` class) still lands on the actual `IconButton` root button after this change -- regression guard for the structural-CSS finding, since `ButtonGroup` has no other consumer yet to catch this in the running app

**Acceptance Criteria:**
- Given a plain `IconButton` (no `caption`), when hovered or keyboard-focused, then a styled tooltip bubble appears showing its `label`.
- Given an `IconButton` rendered with `caption`, when hovered, then no tooltip bubble appears (the visible caption already labels it).
- Given an `IconButtonPopup` trigger with its popover open, when hovered, then no tooltip bubble appears.
- Given a `CopyButton` in its `copied` state, when observed, then only the existing "Copied!" bubble renders, not a duplicate tooltip.
- Given a `TriSwitch` option, when hovered or focused, then a tooltip bubble appears showing that option's `label`.
- Given an `IconButton` (or `TriSwitch` option) inside an `overflow:hidden` ancestor (e.g. a rounded-corner card), when hovered, then the tooltip bubble renders fully visible, not clipped.
- Given an `IconButton` rendered inside `ButtonGroup`, when observed, then `ButtonGroup`'s `.item` class still lands on the button itself (structural CSS — corner radii, dividers, equal-width tiling — is unaffected by the tooltip).

## Spec Change Log

- **Iteration 1 (intent_gap, unresolved — pending human decision):** Blind Hunter + Edge Case Hunter review of the first implementation found that the frozen "Always: keep native `title` alongside the new tooltip" constraint, combined with the frozen CSS-only `:hover`/`:focus-visible` trigger, means the browser's native title tooltip and the new styled bubble can both render on a sustained hover — the exact scenario (pausing on an icon to understand it) this feature targets. Root cause is inside `<frozen-after-approval>`; code was reverted pending human resolution of the `title` question.
  - **KEEP for re-derivation once resolved** (implementation-quality fixes identified during the same review, applicable regardless of how the `title` question resolves):
    - Suppress the tooltip when the trigger button itself is `disabled` (IconButton's `disabled` prop, TriSwitch's `disabled` prop), not just for `caption`/`aria-expanded`.
    - Suppress the tooltip when `label` is an empty string.
    - `Tooltip`'s wrapper must forward IconButton's layout-relevant classes (`flex-shrink-0`, and `fill`'s `!w-full`/`min-w-0`) so wrapping the button in an extra `<span>` doesn't change how it sizes inside existing flex/grid parents across ~24 consumer files — IconButton's own code comments call out `flex-shrink-0` as load-bearing.
    - Add regression tests for `IconButton` (tooltip suppressed for `disabled`/`caption`/`aria-expanded`) and `TriSwitch` (radio roving-tabIndex/keyboard behavior intact after wrapping) — neither had dedicated coverage in the first pass.
    - The overall approach (CSS-only Tooltip, relative-wrapper + absolute-bubble, central wiring via `IconButton`, mirroring `CopyButton`'s bubble styling, no new dependency) held up well under review and should be preserved as-is.

- **Iteration 2 (bad_spec — root cause outside frozen block, plus one intent renegotiation the human resolved):** Blind Hunter + Edge Case Hunter review of the iteration-1-fixed implementation, corroborated by a user screenshot of a real tooltip clipped by a rounded-corner card, found two further problems:
  1. **Design-Notes-level bug (bad_spec):** wrapping the trigger in a new `<span>` (as iteration 1's Design Notes specified) broke existing structural CSS in three consumers not originally in the Code Map's blast-radius: `ButtonGroup` (`cloneElement`-based `.item` className forwarding relies on the button being `.group`'s direct/first/last child — divider borders, corner radii, and equal-width tiling all silently stop applying), `FormIconSubmit`'s suffix button (same `className`-forwarding assumption), and `TriSwitch` (the option button was the direct `1fr` grid-column child; wrapping it meant only the *wrapper* got stretched by the grid, not the button, so buttons would shrink to icon-content size instead of filling/centering their column). Fixed by amending Design Notes/Code Map: `Tooltip` now clones its single child instead of wrapping it (no new DOM node at all), so every existing consumer's DOM structure is byte-identical to before this feature.
  2. **Intent renegotiation (human-resolved):** the frozen "Never: no portal" rule conflicted with the Problem statement's goal once real usage showed the bubble gets clipped by any `overflow:hidden` ancestor (rounded-corner cards, `ButtonGroup`'s `.group`) — a portal is the standard fix and CSS alone can't escape clipping. The human chose to allow `createPortal` (React's own API, not a new dependency) rather than accept partial clipping or expand scope to loosen `overflow:hidden` on affected containers case-by-case. The frozen "Never" and the Approach/Always sections were amended accordingly; this was not silently patched — the human made the call.
  - **KEEP for re-derivation** (in addition to everything kept from iteration 1): the `disabled`/`aria-expanded`/`caption`/empty-`label` suppression logic, the removal of native `title`, and all iteration-1 test coverage additions are unaffected by this change and should carry forward unchanged — only `Tooltip`'s internal DOM/positioning strategy changes (wrap → clone + portal).

- **Iteration 3 (patch — all findings trivially fixable in place, no spec change needed):** Blind Hunter + Edge Case Hunter review of the clone+portal implementation found six real, narrow bugs, all fixed directly in `Tooltip.tsx` without touching the frozen block or Design Notes: (1) `onFocus` fired `show()` for mouse-click focus too, not just keyboard — gated behind `event.target.matches(':focus-visible')`; (2) hover and focus were tracked as one combined flag, so either alone leaving could hide the tooltip while the other was still active — split into independent `hoveredRef`/`focusVisibleRef`, hidden only when both are false; (3) suppressing then un-suppressing without a fresh hover/focus could resurrect a stale bubble position — reset on the render-time suppressed-transition; (4) `cloneElement` failed opaquely on a non-single child — swapped for `Children.only`; (5) a trigger near the viewport top could position the bubble off-screen — added a below-flip past `TOP_FLIP_THRESHOLD_PX`; (6) found during final self-review, not by either subagent: the suppressed and unsuppressed branches returned different element shapes (bare element vs. `Fragment`), which would make React remount the trigger on every `disabled`/`aria-expanded` toggle — e.g. every `IconButtonPopup` open/close — unified to always return the same `Fragment` shape. Also added regression tests for `FormIconSubmit`'s suffix-button `className` forwarding and `IconButton`'s external `ref` forwarding, both flagged as unverified by Blind Hunter.

## Design Notes

`Tooltip` clones its single child (`cloneElement(children, { ref: mergedRef, onMouseEnter, onMouseLeave, onFocus, onBlur, ... })`) rather than wrapping it, so `IconButton`/`TriSwitch` option buttons keep their exact prior DOM position — this is what preserves `ButtonGroup`'s and `FormIconSubmit`'s structural CSS and `TriSwitch`'s grid-column stretching (see Iteration 2 change log for why the wrapper-span approach from iteration 1 broke these). On show, compute `trigger.getBoundingClientRect()` and `createPortal` a `position: fixed` bubble into `document.body`, centered above the trigger with the same ~4px gap the old `-top-7` offset implied; recompute on `scroll`/`resize` while visible (a `window` listener added on show, removed on hide) so the bubble tracks the trigger if the page scrolls mid-hover. Bubble visual chrome (bg-foreground/text-background, 0.7rem/550, rounded-[6px], ~150ms opacity fade) matches `CopyButton`'s bubble and stays in `Tooltip.module.scss`; only the `top`/`left` coordinates are inline styles since they're computed per-instance. `Tooltip`'s child must be a single element (not a fragment or array) since `cloneElement` requires exactly one target — this holds for every current call site (`IconButton`'s own `<button>`, each `TriSwitch` option `<button>`).

## Verification

**Commands:**
- `cd ui && npm run lint` -- expected: no new lint errors
- `cd ui && npm test -- Tooltip IconButton TriSwitch CopyButton` -- expected: all pass, including new Tooltip tests

**Manual checks (if no CLI):**
- Run the app, hover/focus a handful of `IconButton` instances across different pages (lists, upload, cards) and confirm the tooltip appears, is legible in both light and dark theme, and doesn't clip at viewport edges for buttons near the top of the screen.
- Specifically re-check the "Add expense" button (and any other icon button inside a rounded-corner card) that was previously observed clipped — confirm the bubble now renders fully visible above the card.

## Suggested Review Order

**Core positioning & visibility logic**

- Entry point: clones the trigger instead of wrapping it, and keeps a consistent return shape across suppressed/unsuppressed so toggling `disabled`/`aria-expanded` never remounts the trigger.
  [`Tooltip.tsx:164`](../../ui/components/Tooltip/Tooltip.tsx#L164)

- Independent hover/focus tracking so being both hovered and focused at once survives either one alone ending.
  [`Tooltip.tsx:60`](../../ui/components/Tooltip/Tooltip.tsx#L60)

- `:focus-visible` gate on the focus handler — the fix for the click-triggers-tooltip regression found in review.
  [`Tooltip.tsx:192`](../../ui/components/Tooltip/Tooltip.tsx#L192)

- Position computation with the viewport-top flip (renders below instead of above near the screen edge).
  [`Tooltip.tsx:115`](../../ui/components/Tooltip/Tooltip.tsx#L115)

- Ref merge — combines Tooltip's own measurement ref with any ref already on the trigger (e.g. `IconButton`'s forwarded ref).
  [`Tooltip.tsx:102`](../../ui/components/Tooltip/Tooltip.tsx#L102)

**Portal & clipping fix**

- Bubble portaled into `document.body`, `position: fixed`, so it escapes any `overflow:hidden` ancestor — the fix for the clipped-tooltip screenshot.
  [`Tooltip.tsx:205`](../../ui/components/Tooltip/Tooltip.tsx#L205)

- Bubble visual chrome only; positioning itself is inline (computed in JS), not CSS-anchored.
  [`Tooltip.module.scss:5`](../../ui/components/Tooltip/Tooltip.module.scss#L5)

**Wiring into consumers**

- `IconButton` passes its own `<button>` as `Tooltip`'s child unchanged — no structural DOM change, so `ButtonGroup`/`FormIconSubmit` keep working.
  [`IconButton.tsx:78`](../../ui/components/IconButton/IconButton.tsx#L78)

- Suppression logic: `caption`, `aria-expanded`, `disabled`, or empty `label` all suppress the tooltip.
  [`IconButton.tsx:71`](../../ui/components/IconButton/IconButton.tsx#L71)

- `TriSwitch` options wrapped the same way, native `title` removed.
  [`TriSwitch.tsx:92`](../../ui/components/TriSwitch/TriSwitch.tsx#L92)

**Regression guards (peripherals)**

- `ButtonGroup` structural-CSS regression guard — confirms `.item` still lands on the actual button, not a wrapper.
  [`ButtonGroup.test.tsx:128`](../../ui/components/ButtonGroup/ButtonGroup.test.tsx#L128)

- `FormIconSubmit` suffix-button `className` forwarding, flagged as unverified in review.
  [`FormIconSubmit.test.tsx:163`](../../ui/components/FormIconSubmit/FormIconSubmit.test.tsx#L163)

- `IconButton` external `ref` forwarding through the Tooltip ref-merge.
  [`IconButton.test.tsx:248`](../../ui/components/IconButton/IconButton.test.tsx#L248)

- Full behavioral coverage: hover/focus-visible/click-focus/viewport-flip/suppression.
  [`Tooltip.test.tsx:1`](../../ui/components/Tooltip/Tooltip.test.tsx#L1)
