---
name: budget-history-receipt-row
description: Budget-detail history rows adopt ReceiptRow instead of a bespoke <li>, gaining attribution, split-share, and payer signals.
status: final
updated: 2026-09-05
sources:
  - ui/components/soft-ledger/ReceiptRow.tsx
  - ui/app/lists/[listId]/page.tsx
components:
  attribution-chip:
    spec: 'Chip, tone="accent" for attributed_via === "rule", tone="muted" for "manual" — replaces the current plain-text "via rule/manual" caption'
  unassign-control:
    spec: 'icon-only IconButton rendered in ReceiptRow menuSlot, CloseIcon (ui/app/icons/CloseIcon), aria-label = t.budgetsUnassign — replaces the current text UnassignButton; visible only when attributed_via === "manual" (unchanged condition)'
  payer-origin:
    spec: 'reuses ReceiptRow.OriginPayerAlias (Avatar + alias) via originAction, populated only when payer_id !== viewer id — same avatar/seed/photo wiring list rows already use via payerAliasFrom'
  split-amount:
    spec: 'ReceiptRow netLabel/netPolarity + directionLabel, fed by viewer_share_crc/viewer_net_polarity — same fields and helper (directionLabelFrom) that already drive list-row net amounts'
---

# Brand & Style

Inherits the Soft-Ledger spine already established for `ReceiptRow` (`{sources[0]}`) and the list-detail page's payer/split conventions (`{sources[1]}`). No new visual language — this delta is about reusing an existing row shape on a new screen and surfacing two data points (rule/manual attribution, split ownership) it didn't show before.

# Components

## Attribution chip

`{components.attribution-chip.spec}`. Sits in `ReceiptRow`'s `meta` area, next to the date, exactly where the payer chip already lives for list rows — budget history rows don't have both today, so there's no collision. Accent tone for rule-attributed rows makes automation visually distinct at a glance; muted tone for manual keeps it quiet since manual is the default/expected state.

## Unassign control

`{components.unassign-control.spec}`. Placed in `ReceiptRow`'s `menuSlot` region (top-right, same slot the soft-ledger row reserves for its row menu). An icon button rather than a text button matches the density of a history list where every row already carries a chip, an amount, and now a payer signal — a text label would crowd the row on narrow viewports.

## Payer origin

`{components.payer-origin.spec}`. When the transaction wasn't fully the viewer's own (someone else paid, viewer owes a share — or the reverse), the row shows who paid via the same avatar treatment list rows use. When `payer_id === viewer id` (the normal case — viewer paid the whole thing, or it's unambiguously theirs), no payer chip renders; the row looks exactly as it does today aside from the attribution chip.

## Split amount

`{components.split-amount.spec}`. The amount shown is always **the viewer's share**, never the transaction total — `ReceiptRow`'s `netLabel` slot (bottom-right, large numeral) takes `viewer_share_crc`, and `directionLabel` (top-right, small caption above it) takes the localized "you owe" / "you're owed" string when the row is a split; both are omitted (falls back to plain `amount` styling) when the viewer paid the full amount solo, matching `ReceiptRow`'s existing behavior for non-split rows elsewhere in the app.

Visual reference: none produced as a static mockup — this delta is a direct swap onto an already-shipped, already-styled component (`ReceiptRow`), so the existing soft-ledger list screens serve as the visual reference for every state described here.
