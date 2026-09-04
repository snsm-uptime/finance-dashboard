---
name: budgets-ghost-card-form
description: Budget-creation form redesign — the "New budget" entry becomes a skeleton budget card, not a separate input row/sheet.
status: final
updated: 2026-09-04
sources:
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md
components:
  ghost-budget-card:
    shell: 'reuses the real budget-card shell (rounded-[10px], border-border, bg-surface, px-[var(--space-3)] pt-[var(--space-4)]) with border-style: dashed to read as not-yet-real'
    submitBadge: 'w-8 h-8 rounded-full border border-border bg-surface, absolute -top-2 -right-2, same visual family as the account-page avatar action badges (AccountMenu.tsx avatarActionClass)'
    calendarSlot: 'w-[2.1rem] h-[2.1rem] rounded-full border-1.5 dashed border-border, replaces the real card's day-count circle before a period is set'
    capControl: 'inline text control at the end of the progress-bar labels row, replacing the real card's static cap end-label; dashed underline while empty, solid once filled'
  minimal-input:
    base: 'border-none border-b-[1.5px] border-border bg-transparent, text-[0.85rem], text-muted when empty/placeholder, text-foreground when filled — extracted from the existing list-rename input (ListsPanel.module.scss .listNameEdit)'
  chip-picker:
    trigger-single: 'existing ChipTrigger look (chipClassName + focus ring), unchanged from OriginChipPicker'
    trigger-multi: 'selected values render as individual accent chips inline (chipClassName["accent"], with an inline ✕); one trailing dashed add-trigger chip opens the panel'
    panel: 'existing ChipOptionsPanel/SlideDown row; gains an optional max-height (~6.4rem) with overflow-y: auto for large option counts'
  calendar-icon:
    spec: '24x24 viewBox, strokeWidth 2.1, stroke-linecap round, stroke="currentColor", no fill — same family as PlusIcon/CloseIcon (ui/app/icons)'
---

# Brand & Style

Inherits the finance-helper spine in full (`{sources[0]}`) — Soft-Ledger warm-sand palette, Petrona serif for numerals, Manrope for UI text. No new brand decisions in this delta; it only adds component patterns for the budgets-create surface.

# Components

## Ghost budget card

The "New budget" entry point is not a separate form row or sheet — it is a budget card, dashed-bordered, rendered as the first item in the `/budgets` masonry list. It shares every structural slot with a real card (identity block, corner circle, progress-bar footer) so the transition from "creating" to "created" is a state change on the same shape, not a navigation.

| Slot | Real card | Ghost card (empty) | Ghost card (filled) |
|---|---|---|---|
| Top-left | Name text + source-list chips | `{components.minimal-input.base}` placeholder "Budget name" + `+ Add list` trigger | Filled name + selected-list chips + `+` trigger |
| Top-right circle | Day count (serif numeral) | `{components.ghost-budget-card.calendarSlot}` — `{components.calendar-icon.spec}` icon, label "Period" | Resolves into the real day-count numeral once a range is chosen |
| Bar-label end (bottom-right) | Static "cap" text | `{components.ghost-budget-card.capControl}`, dashed underline, placeholder "Cap" | Solid underline, filled amount |
| Card corner | — | `{components.ghost-budget-card.submitBadge}` "+" badge, top-right, floats outside the border | Same badge; becomes the active submit control once name/cap/at least one list are set |

Overflow: selected-list chips wrap inline and let the card grow taller — no truncation — matching how real cards already behave with masonry re-measurement. Only the add-list panel gets a bounded, scrollable height (`{components.chip-picker.panel}`) so a large list count doesn't grow the panel unboundedly.

## MinimalInput (new shared component)

`{components.minimal-input.base}`. Extracted from the list-rename input pattern so the ghost card's name field and the existing lists-panel rename field share one implementation instead of two near-duplicate styles.

## ChipPicker (generalized)

`OriginChipPicker` is refactored on top of a shared, mode-aware ChipPicker: `single` mode keeps today's one-trigger-chip behavior unchanged; `multi` mode adds `{components.chip-picker.trigger-multi}`. The budgets source-list picker is the first `multi` consumer.

## CalendarIcon (new icon)

`{components.calendar-icon.spec}`. Added to `ui/app/icons` alongside `PlusIcon`/`CloseIcon`.

Visual reference: [mockups/ghost-budget-card.html](mockups/ghost-budget-card.html) — empty state, many-lists-selected state, add-list panel (scrolling) state, and the real card for comparison.
