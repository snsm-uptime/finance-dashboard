---
name: custom-split-slider
description: Behavioral specification for percentage split slider. Component patterns, state machine, keyboard/touch interactions, and key user journeys.
status: final
updated: 2026-08-09
---

# EXPERIENCE.md — custom-split-slider

Behavioral spine for the custom percentage split slider in DefaultSplitPanel. Covers interaction model, state transitions, keyboard/touch mechanics, accessibility floor (WCAG 2.2 AA), and user journeys.

Reference visual identity: [`DESIGN.md`](./DESIGN.md).

---

## Foundation

**Form factor:** Mobile-first responsive. Phone is the primary narrated surface; desktop (web) inherits the same IA and interaction model, no separate "dashboard" layout.

**UI system reference:** Inherits component primitives from React / Browser standard elements (input range, div containers, event listeners). No shadcn or design-system library — this spine defines the behavioral contract; implementation chooses the rendering stack.

**When shown:** Slider appears only when:
1. User has selected "Custom" mode (radio toggle)
2. List contains 2+ members (no slider for single-person lists)
3. Replace the current form-based percentage input fields

---

## Information Architecture

**Location in DefaultSplitPanel:**
1. Top: "Even / Custom" radio toggle
2. **Below, if mode === "percentage" & members.length > 1:** Custom-split-slider component
3. Below slider: Labels row (member names)
4. Below labels: [ASSUMPTION] Summary hint (e.g. "Drag to adjust" or validation message if sum ≠ 100)
5. Bottom: Save button (enabled only if state differs from saved config)

**Surfaces:** One surface — the slider itself is the only control for setting percentages. No secondary modals, no advanced-mode toggles, no alt inputs.

---

## Voice and Tone

**Microcopy (labels & hints):**
- Segment labels: Percentages only (e.g. "45%", "55%"). No names — names appear in the labels row below.
- Tooltip text: Plain list "Name: XX%" for each affected segment (e.g. "Alice: 30% | Bob: 70%").
- Hint below slider: "Drag handles to adjust" or "Sum must equal 100%" (validation only if sum ≠ 100 on save).
- Save button: Reuse existing "Save" label (no change from current form UI).

**Tone:** Direct, no theater. The slider is a tool; the percentage is the hero. No celebration micro-interactions, no "Great job!" on save.

---

## Component Patterns

### Slider track

**Structure:**
- Horizontal bar divided into N equal-width segments (1 per member).
- Each segment is a flex container; centered percentage label (`{DESIGN.typography.segment-label}`).
- 1px border around entire track (`{DESIGN.colors.track-background}`).
- Interior background: `{DESIGN.colors.segment-background}` (surface tone).

**Behavior:**
- Segments are **tap-interactive:** Tapping a segment focuses the adjacent handle (left if first segment, right if middle/last). Provides keyboard-like access on mobile.
- Segment labels update live as handles drag (not jittery — debounce to 0.1s or update only on handle release to avoid shimmer).
- No hover state required; optional subtle background tint on segment hover (10% accent) on desktop.

### Handles (N-1 draggable bars)

**Structure:**
- Vertical bar positioned between segments (N-1 handles for N segments).
- Width 4px (idle) → 6px (dragging).
- Color `{DESIGN.colors.handle-default}` (idle) → `{DESIGN.colors.handle-active}` (dragging).

**Behavior:**
- **Drag:** Click/touch and drag left/right. Update the percentages of the segment to the left and right of the handle in real-time.
  - Left segment: decreases as handle moves right; increases as handle moves left.
  - Right segment: increases as handle moves right; decreases as handle moves left.
  - Constraint: Neither segment can go below 0% or above 100%. Handle movement is constrained to valid bounds.
- **Keyboard:**
  - Tab to cycle through handles (focus order: left to right).
  - Arrow Left / Right: Nudge ±1% (or ±5% with Shift for faster adjustment).
  - Enter / Space: [ASSUMPTION] No activation needed; handles are drag-only, not toggle buttons.
- **Tooltip:** Shown only during drag. Positioned 8px above the handle, centered. Content: "SegmentL: X% | SegmentR: Y%" (affected segments only).

### Last percentage auto-calc

The Nth (rightmost) segment's percentage is **always** calculated as `100% - sum(other N-1 segments)`. Users cannot directly drag this segment's boundary; it adjusts automatically when other handles move.

**Behavior:**
- As users drag any handle, the affected segments update live.
- Last segment = 100% - others (computed, not user-input).
- If users accidentally create a state where the last segment would be <0 (e.g. other segments sum to >100), the handle stops at the point where last segment = 0. Hard boundary.

### Labels row (member names)

**Structure:**
- Row below slider; one label per segment, centered under each.
- Typography: `{DESIGN.components.slider-labels}` (muted meta tone).
- Non-interactive (read-only display).

**Behavior:**
- Static; never updated during interaction.
- Provides context for the segments above (who is who).

---

## State Patterns

### Idle state
- All handles at their saved positions (percentages).
- No tooltip.
- No focus ring (unless keyboard user is tabbed to a handle).
- Save button: **disabled** (state has not changed from saved config).

### Dragging state (handle in motion)
- Handle under cursor: width expands to 6px, color changes to `{DESIGN.colors.handle-active}`.
- Tooltip appears 8px above handle, showing percentages in real-time.
- Segments update live (labels reflow).
- Last segment auto-calculated.
- User can release at any point; state is valid (never an invalid sum).

### Changed state (after drag, before save)
- Handles return to idle appearance (4px, `{DESIGN.colors.handle-default}`).
- Tooltip disappears.
- Save button: **enabled** (current state ≠ saved config).
- User can make further adjustments, or click Save to persist.

### Saving state (Save button clicked)
- Save button: shows loading state (e.g. "Saving..." text or disabled with spinner) while request is in flight.
- Slider remains interactive (user can adjust while saving, if UX requires; or lock it — [ASSUMPTION] lock during save for clarity).
- Server returns success or error.

### Saved state (after successful save)
- Component resets to Idle state.
- Slider now reflects the new saved configuration.
- Save button returns to **disabled**.
- No confirmation toast or success message (spines are silent; [ASSUMPTION] parent DefaultSplitPanel handles post-save feedback if needed).

### Error state (save failed)
- Slider stays in Changed state (user's edits are not lost).
- Save button shows error or re-enables for retry.
- Error text appears below slider (same error container as in DefaultSplitPanel).

---

## Interaction Primitives

### Drag
- Click/touch a handle; move left/right.
- Update percentages in real-time.
- Release to end drag.
- Cursor feedback: `grab` → `grabbing` → back to `grab` on release.

### Tap
- Tap a segment to focus an adjacent handle (e.g. tap left segment → focus left handle; tap right segment → focus right handle).
- Provides mobile-friendly access (easier than precise handle drag on small screens).
- [ASSUMPTION] Tapping a segment could also open a mini-keyboard to type percentage directly; for v1, treat tap as focus-only.

### Keyboard (Tab, Arrow keys)
- **Tab:** Cycle focus through handles (left to right, then wrap).
- **Shift+Tab:** Cycle focus backwards.
- **Left Arrow:** Nudge focused handle left by 1% (or 5% with Shift).
- **Right Arrow:** Nudge focused handle right by 1% (or 5% with Shift).
- **Enter / Space:** [ASSUMPTION] No effect; handles are drag-only.
- **Escape:** [ASSUMPTION] Blur current handle without making changes (or discard edits and return to saved state — [NOTE FOR UX] clarify intent if undo is desired).

### Touch (mobile)
- Same drag semantics as mouse.
- Touch target: 48px height (minimum; actual is `{DESIGN.spacing.track-height}`).
- Long-press on handle: [ASSUMPTION] not required; plain touch-drag is enough.

---

## Accessibility Floor

**Standard:** WCAG 2.2 AA. Verified contrast, keyboard nav, focus visible, screen-reader support.

### Contrast
- Handles vs track: `{DESIGN.colors.handle-default}` on `{DESIGN.colors.segment-background}` ≥ 4.5:1 (text) / 3:1 (UI) AA compliant.
- Handle focus ring vs background: `{DESIGN.colors.handle-focus-ring}` outline ≥ 3:1 contrast, 2px thickness visible.
- Tooltip text: `{DESIGN.colors.tooltip-text}` on `{DESIGN.colors.tooltip-background}` ≥ 4.5:1.
- Labels: `{DESIGN.components.slider-labels}` color ≥ 3:1 vs segment background.

### Keyboard navigation
- All handles focusable via Tab.
- Focus order: left to right (natural reading order).
- Focus visible: 2px outline, 2px offset (sufficient prominence).
- Arrow keys: Left/Right nudge by 1% (Shift accelerates to 5%).

### Screen reader
- Slider wrapped in `<div role="group" aria-label="Custom split: [list name or default]">`.
- Each handle: `<div role="slider" aria-label="[Member Name] percentage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="[current]" aria-valuetext="[X%]" tabindex="0">`.
- Tooltip: aria-live="polite" or aria-label on handle, updated on drag.
- Labels row: Each label associated with its segment via ID / aria-labelledby.

### Touch target sizing
- Minimum 48px height (semantic WCAG 2.5.5 AAA).
- Handle width expandable to 6px active (larger tap target).
- Segments: each at least 40px wide (calculated as 100% / N).

### Color independence
- Do not rely on color alone to convey state. Handles change width + color on drag (both perceivable).
- Segments do not use color to show state; use focus ring on handles instead.

---

## Key Flows

### Flow 1: Splitting equally among 3 friends (Mary's first custom split)

**Protagonist:** Mary, setting up a shared house expense list with Alice, Bob, and Carol. She wants to split the cost equally, but the app defaulted to "Even" mode. She switches to Custom to see the breakdown and adjusts them manually.

**Journey:**
1. Mary opens the house list and taps "Custom" in the split mode toggle.
2. Slider appears, showing 33%, 33%, 34% (equal split, last auto-calc'd).
3. Labels below show "Mary", "Alice", "Bob" … wait, it's "Alice", "Bob", "Carol" (the other members).
4. Mary realizes she wants Alice to pay 40% (Alice had higher income). She drags the first handle (between Alice and Bob) to the right.
5. Tooltip appears: "Alice: 40% | Bob: 27%".
6. Mary releases. Slider stays at Alice 40%, Bob 27%, Carol 33%.
7. **Save button is now enabled** (state differs from saved "even").
8. Mary taps Save.
9. Button shows "Saving..."; request sent.
10. Server confirms; button re-disables.
11. Next time Mary opens this list, it remembers "Alice 40% / Bob 27% / Carol 33%".

**Climax:** Mary taps Save and sees the percentages persist — the custom split is now the default.

---

### Flow 2: Adjusting splits via keyboard (Bob on desktop)

**Protagonist:** Bob, a desktop user editing his list. He prefers keyboard over mouse.

**Journey:**
1. Bob opens the custom split section. Slider is visible with handles at 50%, 50% (two people: Bob and Alice).
2. Bob presses Tab to focus the first handle (between Bob and Alice).
3. Focus ring appears around the first handle.
4. Bob presses Right Arrow three times (+3%).
5. Tooltip shows "Bob: 53% | Alice: 47%".
6. Bob presses Shift+Right Arrow once (+5%).
7. Tooltip shows "Bob: 58% | Alice: 42%".
8. Bob releases keyboard focus; tooltip disappears. Handles show idle appearance.
9. **Save button is enabled.**
10. Bob presses Tab until he lands on the Save button and presses Enter.
11. Changes persist.

**Climax:** Bob adjusts splits entirely via keyboard; no mouse needed.

---

### Flow 3: Rejecting changes (Carol, on mobile)

**Protagonist:** Carol, viewing the list on her phone. She accidentally adjusts the split and wants to cancel.

**Journey:**
1. Carol views the house list on her phone. Custom split shows 33%, 33%, 34%.
2. She accidentally drags a handle; tooltip shows "Alice: 40% | Bob: 26%".
3. Carol releases. Slider resets to idle. **Save button is now enabled** (state changed).
4. Carol realizes she made a mistake. She does not tap Save.
5. Carol navigates away from this section (or taps the "Even" toggle to switch modes).
6. [ASSUMPTION] Changes are discarded (slice re-initializes from saved state if user navigates away without saving).
7. On next visit, split is back to "even".

**Climax:** Carol's accidental change is not persisted because she didn't confirm.

---

## Responsive & Platform

### Mobile (phone)
- Track height: 48px (touch-friendly).
- Handle active width: 6px (more tappable).
- Labels row: stacks under slider; same width as slider.
- Tooltip: positioned above handle, does not overflow viewport (nudge horizontally if needed).
- Landscape: same IA; slider may compress, but track height stays 48px minimum.

### Desktop (web)
- Track height: 48px (no reduction; generous for precision).
- Handle active width: 6px (same as mobile).
- Labels row: same layout.
- Tooltip: positioned above handle; wider viewport means tooltip fits without nudging.
- Wide screens (>768px): Slider width may be constrained to a sensible max (e.g. 600px) to avoid excessive segment width; [ASSUMPTION] no separate "dashboard" layout for v1.

### Interactions across platforms
- Mouse: Click + drag (grab cursor).
- Touch: Touch + drag (same mechanics).
- Keyboard: Tab, Arrow keys (same on all).
- No platform-specific interactions; same experience across phone, tablet, desktop.

---

## Notes & Assumptions

- **[ASSUMPTION]** Segment labels update on drag release, not in real-time, to avoid visual jitter. Tooltip is real-time; labels update when drag ends.
- **[ASSUMPTION]** Single-person lists: DefaultSplitPanel does not render the custom split section at all (checked in parent component).
- **[ASSUMPTION]** Undo/discard: Pressing Escape or navigating away without saving discards changes. No in-component undo button.
- **[ASSUMPTION]** Error handling: Server-side validation (sum = 100%) is authoritative. Client validates only for UX feedback (tooltip, button enable/disable).
- **[ASSUMPTION]** Saving: No in-component post-save toast. Parent DefaultSplitPanel handles confirmation feedback if needed.
- **[NOTE FOR UX]** Segment tap behavior: Current spec treats tap as focus-only. If direct percentage input is desired (e.g. tap to open a mini-keyboard), clarify interaction model in next iteration.
