---
name: custom-split-slider
description: Percentage split slider component replacing form inputs in DefaultSplitPanel. Segmented horizontal control with N-1 draggable handles for N people.
status: final
updated: 2026-08-09
colors:
  track-background: '{finance-helper.colors.border}'
  track-background-dark: '{finance-helper.colors.border-dark}'
  segment-background: '{finance-helper.colors.surface}'
  segment-background-dark: '{finance-helper.colors.surface-dark}'
  segment-text: '{finance-helper.colors.text}'
  segment-text-dark: '{finance-helper.colors.text-dark}'
  handle-default: '{finance-helper.colors.accent}'
  handle-default-dark: '{finance-helper.colors.accent-dark}'
  handle-active: '{finance-helper.colors.text}'
  handle-active-dark: '{finance-helper.colors.text-dark}'
  handle-focus-ring: '{finance-helper.colors.accent}'
  tooltip-background: '{finance-helper.colors.text}'
  tooltip-background-dark: '{finance-helper.colors.surface-dark}'
  tooltip-text: '{finance-helper.colors.on-accent}'
  tooltip-text-dark: '{finance-helper.colors.text-dark}'
typography:
  segment-label:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.66rem
    fontWeight: '500'
    lineHeight: '1.2'
  handle-label:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.62rem
    fontWeight: '400'
  tooltip:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.62rem
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  handle: 2px
  track: 8px
  tooltip: 4px
spacing:
  track-height: 48px
  track-height-mobile: 48px
  handle-width: 4px
  handle-width-active: 6px
  segment-padding: '{finance-helper.spacing.4}'
  label-gap: 8px
  tooltip-offset: 8px
  tooltip-padding: '6px 8px'
components:
  slider-track:
    background: '{colors.track-background}'
    borderRadius: '{rounded.track}'
    height: '{spacing.track-height}'
    border: '1px solid {finance-helper.colors.border}'
  slider-segment:
    background: '{colors.segment-background}'
    textColor: '{colors.segment-text}'
    typography: '{typography.segment-label}'
    padding: '0 {spacing.segment-padding}'
    display: flex
    alignItems: center
    justifyContent: center
    userSelect: none
    cursor: pointer
    minWidth: 40px
  slider-handle:
    width: '{spacing.handle-width}'
    background: '{colors.handle-default}'
    borderRadius: '{rounded.handle}'
    cursor: grab
    transition: 'width 150ms ease, box-shadow 150ms ease'
    active:
      width: '{spacing.handle-width-active}'
      background: '{colors.handle-active}'
      cursor: grabbing
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
    focus:
      outline: '2px solid {colors.handle-focus-ring}'
      outlineOffset: 2px
  slider-tooltip:
    background: '{colors.tooltip-background}'
    textColor: '{colors.tooltip-text}'
    typography: '{typography.tooltip}'
    padding: '{spacing.tooltip-padding}'
    borderRadius: '{rounded.tooltip}'
    position: absolute
    pointerEvents: none
    whiteSpace: nowrap
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
  slider-labels:
    display: flex
    marginTop: '{spacing.label-gap}'
    typography: '{finance-helper.typography.meta}'
    textColor: '{finance-helper.colors.muted}'
---

# DESIGN.md — custom-split-slider

Visual identity for percentage split slider component in DefaultSplitPanel. Replaces form-based input with interactive segmented horizontal control. Inherits Warm Balance tokens from finance-helper v1; adds slider-specific interactive colors and touch-target sizing.

Appearance: Light / Dark modes follow finance-helper system (System default).

Accessibility floor: WCAG 2.2 AA. Focus visible on all interactive elements; sufficient contrast on handles and segments in both modes; keyboard navigation support (Tab, Arrow keys).

---

## Brand & Style

Custom-split-slider integrates into the **Soft-Ledger hybrid** panel as a focused, calm percentage distributor. Rejects form-table density in favor of a single visual control: a segmented horizontal bar where users drag handles to set percentages. The interaction is instantaneous, live feedback (tooltip), and the last percentage auto-calculates to maintain 100% sum.

Personality matches finance-helper: **calm clarity**. The slider is a tool, not a game — no micro-interactions, no celebration motion, no decorative fills. Touch targets and spacing follow accessible minimums (48px height on mobile).

---

## Colors

Inherits Warm Balance base; adds interactive states.

| Role | Light | Dark | Use |
|---|---|---|---|
| Track background | `{colors.track-background}` | `{colors.track-background-dark}` | Slider rail/border 1px |
| Segment background | `{colors.segment-background}` | `{colors.segment-background-dark}` | Segment fill (interior of slider) |
| Segment text | `{colors.segment-text}` | `{colors.segment-text-dark}` | Percentage labels on segments |
| Handle (default) | `{colors.handle-default}` | `{colors.handle-default-dark}` | Idle handle color (moss accent) |
| Handle (active) | `{colors.handle-active}` | `{colors.handle-active-dark}` | Dragging handle color (text weight for emphasis) |
| Handle focus ring | `{colors.handle-focus-ring}` | `{colors.handle-focus-ring}` | 2px outline on keyboard focus |
| Tooltip background | `{colors.tooltip-background}` | `{colors.tooltip-background-dark}` | Tooltip fill during drag |
| Tooltip text | `{colors.tooltip-text}` | `{colors.tooltip-text-dark}` | Tooltip label |

**Rules:**
- Handle default (idle) is `{finance-helper.colors.accent}` (moss) — consistent with action buttons.
- Handle active (dragging) is `{finance-helper.colors.text}` — stronger visual feedback for drag state.
- Tooltip appears only during drag; disappears on release.
- Focus ring always visible when handle receives keyboard focus (Tab).

---

## Typography

Inherits Manrope from finance-helper; adds slider-specific scales.

| Role | Token | Notes |
|---|---|---|
| Segment labels (%) | `{typography.segment-label}` | Centered inside each segment; medium weight; no tabular nums required (whole percentages) |
| Handle label | `{typography.handle-label}` | [future] if inline labels are added; lighter than segment |
| Tooltip | `{typography.tooltip}` | Meta-weight; shown on drag (e.g. "Alice: 45% | Bob: 55%") |

---

## Layout & Spacing

Slider sits within the DefaultSplitPanel, below the "Even / Custom" radio toggle and above the Save button. Takes full width of the panel (inset with `{finance-helper.spacing.strip-inset}` on left/right).

**Mobile (phone)**
- Track height: `{spacing.track-height}` (48px minimum touch target)
- Handle width (idle): `{spacing.handle-width}` (4px); active `{spacing.handle-width-active}` (6px for visual feedback)
- Segment labels centered, padding `{spacing.segment-padding}` horizontal
- Labels row below track, gap `{spacing.label-gap}` (8px top margin)
- Tooltip offset `{spacing.tooltip-offset}` (8px above track during drag)

**Desktop (tablet / wide)**
- Same track height (48px) — no reduction for desktop; generous touch target aids precision
- Segment labels remain centered
- Labels row layout unchanged

Spacing rhythm: all gaps follow finance-helper `{spacing.*}` tokens. No custom px values outside this table.

---

## Elevation & Depth

Depth is **tonal**, not shadow-based (matches Soft-Ledger philosophy).

- Track uses `{finance-helper.colors.border}` 1px rule (same hairline as receipt rows).
- Segments stack on `{colors.segment-background}` (surface tone).
- Handles are solid color (no gradients).
- Tooltip gets soft shadow `0 2px 8px rgba(0, 0, 0, 0.15)` on drag (rare raised chrome, warmly tinted).
- Active handle gets subtle shadow feedback; no drop-shadow on idle.

---

## Shapes

Soft but not pill.

| Token | Value | Use |
|---|---|---|
| `{rounded.track}` | 8px | Track ends (matches `{finance-helper.rounded.md}`) |
| `{rounded.handle}` | 2px | Handle bar; subtle roundness |
| `{rounded.tooltip}` | 4px | Tooltip corners (soft not rounded-full) |

No zero-radius track. No pill handles. Shapes reinforce calm simplicity.

---

## Components

### Slider track (`components.slider-track`)

Horizontal segmented bar. Anatomy:
- Background: `{colors.segment-background}`
- Border: 1px `{colors.track-background}`
- Height: 48px (mobile-first)
- Radius: 8px
- Interior: N segments (divs), each 1/N width

Segments:
- Flex container; centered label (percentage %) 
- Text color: `{colors.segment-text}`
- Hover background: slight muted tint (10% opacity of accent, optional)
- Tap to select/focus a segment (visual feedback via focus ring on adjacent handle)

### Slider handle (`components.slider-handle`)

Draggable vertical bar between segments. Anatomy:
- Width (idle): 4px
- Width (active/dragging): 6px
- Background: `{colors.handle-default}` (idle) → `{colors.handle-active}` (dragging)
- Radius: 2px
- Cursor: `grab` idle; `grabbing` while dragging
- Transitions: width + box-shadow 150ms ease (smooth feel)
- Focus ring: 2px `{colors.handle-focus-ring}` outline, 2px offset (visible on Tab)
- Tooltip: positioned 8px above track center during drag

### Tooltip

Shown only during drag. Anatomy:
- Background: `{colors.tooltip-background}`
- Text: `{colors.tooltip-text}`
- Padding: 6px 8px (snug)
- Radius: 4px
- Position: absolute, centered above the handle
- Content: e.g. "Alice: 45% | Bob: 55%" (current percentages of affected segments)
- Disappears on mouse/touch up (handle release)

### Labels row

Below the track. Anatomy:
- Flex row, equal width columns (1 per segment)
- Text: `{finance-helper.typography.meta}`, `{finance-helper.colors.muted}`
- Centered under each segment
- Non-interactive (read-only display of member names)

---

## Do's and Don'ts

| Do | Don't |
|---|---|
| Show handles as thin vertical bars; drag updates both sides live | Make handles fat circles or pill-shaped |
| Display percentage labels centered on each segment | Hide the percentage during interaction |
| Light tooltip on drag with affected segments only | Show constant tooltips or complex state machines |
| Use `{colors.handle-active}` for visual drag feedback (weight change) | Add shadows or glow to make handles "pop" |
| Keep segment labels constant; live-update tooltips | Update segment labels in real-time (jitter risk) |
| Tab through handles; arrow keys nudge percentages | Require mouse-only interaction; ignore keyboard |
| Focus visible on all handles (2px outline) | Hide focus ring; rely on color-only feedback |
| Same layout mobile/desktop; adjust touch target spacing | Shrink track height or handles on desktop |
| Inherit Warm Balance colors; add interactive states only | Invent new colors outside Warm Balance palette |
| Tooltip disappears on release | Persist tooltip or show success animation |
