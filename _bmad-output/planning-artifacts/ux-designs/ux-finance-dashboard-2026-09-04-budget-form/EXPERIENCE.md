---
name: budgets-ghost-card-form
description: Behavioral spec for the ghost-card budget-creation flow on /budgets.
status: final
updated: 2026-09-04
sources:
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md
  - ux-finance-dashboard-2026-09-04-budget-form/DESIGN.md
---

# Foundation

Web, desktop + mobile-width, inline within the existing `/budgets` route (`ui/app/budgets/page.tsx` → `BudgetsPanel.tsx`). No new route, no modal/sheet surface — the create form lives entirely inside the masonry list `BudgetsPanel` already renders. Design reference: `{DESIGN.md}`.

# Information Architecture

The ghost card replaces `BudgetsCreateForm`'s current standalone input row. It is always the first item in the budgets masonry (`BudgetsPanel`'s `input` slot today; the ghost card should instead become the first synthetic entry inside the masonry column distribution so it sits and grows exactly like a real card, not above the grid). Only one ghost card exists at a time — there is no separate "create new" trigger elsewhere on the page; the ghost card is always present at the head of the list (empty, ready to fill).

# Component Patterns

Visual specs live in `{DESIGN.md.components}`. Behavior:

- **Name field** — `MinimalInput`. Typing clears any submission error (mirrors current `clearError()` calls in `BudgetsCreateForm`).
- **Calendar slot** — click/tap opens `DateRangeField`'s existing popover (anchored to the icon instead of a text row). Before a range exists: dashed circle + calendar icon, label "Period". Once a range is chosen: the slot **resolves into the real day-count circle** (serif numeral + "days left"/"was due on" label) — same computed value `budgetDaysLeft` already produces for real cards. The period stays optional: leaving it unset keeps the calendar icon showing indefinitely (open-ended budget), matching today's `period_start`/`period_end` nullable behavior.
- **Cap control** — inline at the end of the progress-bar row, dashed underline + currency + "Cap" placeholder when empty, solid underline + entered amount once filled. Currency change happens by tapping the currency portion of the same control (small trigger, not a separate row) — reuses `SoftLedgerSelect`'s existing options (`CRC`/`USD`).
- **Source lists** — generalized `ChipPicker` in `multi` mode (see `{DESIGN.md.components.chip-picker}`). Selected lists show as individual accent chips with an inline remove (✕ toggles off directly, no panel needed to deselect). One trailing dashed "+" chip opens the panel of not-yet-selected lists only (mirrors `ChipOptionsPanel`'s existing `selectedValue` filtering, extended to filter a whole selected-set instead of one value).
- **Submit badge** — floating "+" circle, top-right corner of the card. Disabled/inert until the same validity rule as today (`name` + `cap` non-empty, at least one source list selected, not pending). While pending, badge shows the existing spinner treatment used elsewhere (`IconButton`'s pending state) instead of the "+" glyph.

# State Patterns

| State | Ghost card behavior |
|---|---|
| Empty (initial) | Dashed border, all fields at placeholder, calendar icon shown, cap dashed, badge visibly disabled |
| Partially filled | Fields fill in independently as the user interacts — no required order |
| Valid, ready to submit | Badge becomes the active accent-colored submit control |
| Pending (submitting) | Badge shows spinner; all fields disabled (matches current `pending` disabling in `BudgetsCreateForm`) |
| Error | Same `aria-live="polite"` error region as today, rendered below the card rather than below a form row; field that caused it keeps focus per existing `clearError` wiring |
| Success | Card resets to empty state (matches today's post-submit reset in `onCreated`); the newly created real budget card is inserted into the masonry immediately after the ghost card, same as today's `setBudgets((prev) => [budget, ...prev])` |

# Interaction Primitives

- Calendar-icon click/tap opens `DateRangeField`'s popover in place — no layout shift of the card itself while the popover is open (popover floats, same anchoring approach `DateRangeField` already uses).
- Chip removal (✕) is a direct click on the selected chip — single interaction, no confirmation, no panel opening.
- The "+" add-list trigger and the "+" submit badge are visually distinct (dashed muted chip vs. solid accent-bordered circle) so they're not confusable despite the shared "+" glyph.

# Accessibility Floor

- Ghost card keeps `role="group"` semantics equivalent to today's form region; the calendar slot, cap control, and chip picker each need their own accessible name (mirrors today's `sr-only` labels on currency/cap/name).
- Calendar-icon trigger: `aria-label` describing "Set budget period", `aria-expanded` reflecting the popover state (same pattern `ChipTrigger` already uses).
- Submit badge: `aria-label` "Create budget" (or the pending equivalent), `disabled` when the validity rule fails — screen-reader users get the same disabled-state signal sighted users get from the muted badge.
- Focus order: name → add-list trigger (then selected chips if any, tab-reachable for removal) → calendar/period → cap → submit badge. Matches the card's visual top-to-bottom, left-to-right reading order.
- Color is never the only signal: the dashed-vs-solid border/underline distinction (ghost vs. filled) is paired with a placeholder-vs-value text change, not color alone.

# Key Flows

**Mary creates a "Groceries" budget for the next 10 days.** She opens `/budgets`, sees the dashed ghost card already sitting at the top of her budget list. She taps the name field (styled just like renaming one of her expense lists) and types "Groceries" — the field fills in with real text color instead of the placeholder gray. She taps the "+ Add list" chip, and a small panel drops down showing her lists that aren't picked yet; she taps "Eco" and it becomes a solid accent chip inline, replacing the placeholder trigger. She taps the calendar icon in the top-right corner — a familiar date-picker popover opens right where `DateRangeField` already lives elsewhere in the app; she picks today through next Sunday. The moment she completes the range, the calendar icon **becomes** a "6 / days left" circle — the same shape her other budget cards already show, so she immediately sees this new card behaving like a real one. She taps the dashed "Cap" text at the end of the progress bar, types "150,000", and the underline turns solid. The "+" badge in the top-right corner — dim until now — turns accent-green. She taps it; the badge shows a brief spinner, then the card resets to its dashed empty state at the top of the list while her new "Groceries" card (fully real now, with a filled progress bar at 0%) appears right below it.
