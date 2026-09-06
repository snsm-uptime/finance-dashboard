---
name: budget-history-receipt-row
description: Behavioral spec for replacing the budget-detail history <li> with ReceiptRow.
status: final
updated: 2026-09-05
sources:
  - ux-finance-dashboard-2026-09-05-budget-history-row/DESIGN.md
  - ui/app/budgets/[budgetId]/page.tsx
---

# Foundation

Web, desktop + mobile-width, inline within the existing `/budgets/[budgetId]` route. No new route or surface — this replaces the `<li>` block inside the history `<ul>` (`page.tsx` lines ~360-391) with `ReceiptRow`. Design reference: `{DESIGN.md}`.

# Information Architecture

Each history entry is one `ReceiptRow` inside the existing `<ul>`. The row now carries three data points it didn't before: rule/manual attribution (chip), payer identity when the viewer isn't the sole payer (avatar), and the viewer's own share of the amount instead of the transaction total (net label + direction caption). The unassign action moves from a labeled button to an icon-only control inside the row's menu slot.

# Component Patterns

Visual specs live in `{DESIGN.md.components}`. Behavior:

- **Attribution chip** — always present, one of two states (rule / manual), driven by `line.attributed_via` — same source field as today's `historyRowAttribution()`, just rendered as a chip instead of plain text.
- **Payer origin** — conditionally present. When `line.payer_id` resolves to someone other than the signed-in viewer, render their avatar + alias via `originAction` (same `payerAliasFrom`/`Avatar` wiring the list-detail page already uses for its rows). Omitted entirely when the viewer is the payer — no empty slot, no placeholder.
- **Split amount** — `netLabel` = formatted `viewer_share_crc` (not `amount_crc` total). `directionLabel`/`netPolarity` = "you owe" / "you're owed" via the existing `directionLabelFrom`/`viewer_net_polarity` pattern, shown only when the row is actually split (payer isn't solely the viewer, or someone else owes the viewer). When the viewer paid the full amount alone, the row falls back to `ReceiptRow`'s plain `amount` slot (no direction caption) — same as any non-split soft-ledger row.
- **Unassign control** — rendered in `menuSlot`, `CloseIcon` only, `aria-label={t.budgetsUnassign}`. Visibility condition is unchanged from today: only when `attributed_via === "manual"` (rule-attributed rows can't be unassigned here). Clicking it triggers the same unassign action `UnassignButton` performs today — this delta only changes the control's visual form, not its behavior or confirmation flow.

# State Patterns

| State | Row behavior |
|---|---|
| Manual, viewer paid solo | Muted "Manual" chip, plain amount (viewer's share, which equals the total here), unassign icon button visible |
| Manual, split with others | Muted "Manual" chip, payer avatar shown if someone else paid, direction caption + viewer's share amount, unassign icon button visible |
| Rule-attributed, any split state | Accent "Regla"/"Rule" chip, same payer/split rendering as above, **no** unassign control (rule rows aren't unassignable, unchanged from today) |
| Empty history | Unchanged — existing empty-state block with `BudgetAssignPanel` stays as-is; this delta only touches populated rows |

# Interaction Primitives

- Unassign icon click is a single, direct action — no confirmation added or removed versus today's `UnassignButton` (whatever confirmation/error behavior `UnassignButton` already wraps stays intact; only its trigger becomes an icon).
- Payer avatar is presentational only in this view — not a click target (budgets history isn't a place to reassign the payer, just to see who it was).

# Accessibility Floor

- Unassign icon button carries `aria-label={t.budgetsUnassign}` so screen-reader users get the same affordance name the old text button provided — this is a strict requirement of swapping a label for an icon, not optional polish.
- Attribution chip text remains real text content (not color-only) — accent vs. muted tone is a reinforcing signal, not the only one.
- Direction caption ("you owe"/"you're owed") is real text, consistent with how list rows already satisfy color-isn't-the-only-signal for owed/owe polarity.
- Payer avatar keeps its existing alt/tooltip behavior from `Avatar`/`OriginPayerAlias` — no regression versus list rows.

# Key Flows

**Sebastian reviews his "Groceries" budget and sees a shared trip to the store.** He opens a budget's history list. Most rows look almost like before — a description, a date, a muted "Manual" chip, an amount. One row now shows a small avatar next to the date: a flatmate's photo. Above the amount, a caption reads "you owe" in the owe color, and the number itself is smaller than the trip's actual total would have been — it's just his share. He recognizes immediately that this entry isn't fully his expense, without opening anything. Further down, a row carries an accent "Rule" chip instead of "Manual" — he knows this one was auto-assigned and, correctly, sees no unassign icon next to it. On a manual row that's entirely his own, he taps the small ✕ icon at the row's edge to unassign it from the budget — the same action as before, just a cleaner control that doesn't compete visually with the chip and amount already on that line.
