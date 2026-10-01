---
name: statements-retouch
description: Visual identity delta for the Statements tab (browse/retouch committed statements), the per-row "move this item" action, and the list-scoped direct-import entry point.
status: final
updated: 2026-09-30
colors:
  statements-tab-icon: '{finance-helper.colors.muted}'
  statements-tab-icon-active: '{finance-helper.colors.accent}'
components:
  statements-tab-icon:
    family: file-import
    note: >-
      Visually related to the existing FileImportIcon (upload entry point) — same
      linear-stroke language, signals "this is where your imports live" continuity
      with the upload flow rather than reading as a generic document/folder icon.
  statement-period-summary-card:
    background: '{finance-helper.colors.surface}'
    border: '1px solid {finance-helper.colors.border}'
    rounded: '{rounded.card}'
  retouch-row:
    inherits: '{finance-helper.components.receipt-row}'
    note: >-
      Same ReceiptRow visual treatment already used on list detail pages — no new
      row chrome for the retouch list, only its trailing action affordances change
      (see EXPERIENCE.md Component Patterns).
---

## Brand & Style

No new brand identity. Every screen in this delta reads as the same Soft-Ledger
surface already established (warm sand surfaces, linear-stroke iconography, Manrope
body text) — inherits everything unlisted here (base palette, brand typography,
`rounded`, `spacing` scale, `button-primary`, `tab-bar`, `receipt-row`) from the
finalized [`finance-helper` spine](../ux-finance-helper-2026-08-03/DESIGN.md).

## Colors

All tokens above alias `{finance-helper.colors.*}` — no new hues. The Statements tab
icon uses `muted` at rest and `accent` when active, matching every other TabBar entry
(`home`, `budgets`, `cards`).

## Components

- **Statements tab icon** — new icon required (none of the existing `ui/app/icons/`
  set reads as "statement"); built in the same visual family as `FileImportIcon` so
  it reads as a sibling of the upload icon rather than an unrelated glyph.
- **Statement period summary card** — a simple bordered card (period dates, item
  count, destination list name, "View items" action) using the same surface/border/
  rounded tokens as other Soft-Ledger cards (e.g. `CreditCardFace`'s container, not
  its credit-card skin).
- **Retouch row** — inherits `receipt-row` wholesale; only its trailing affordances
  differ (see EXPERIENCE.md).

## Do's and Don'ts

- Do keep the Statements tab icon in the same 1.5px linear-stroke family as every
  other tab icon — it must not read as a heavier or more detailed glyph than
  `HomeIcon`/`FolderIcon`/`WalletIcon`.
- Don't invent a new row treatment for the retouch list — reuse `ReceiptRow` so a
  committed item looks the same whether seen from a list's Soft-Ledger view or from
  the Statements tab.
- Don't give the "Move this item" and "Move whole statement" menu entries the same
  icon — they must be visually distinguishable at a glance in `ListReceiptMenu`.
