---
name: docs-tutorials-page
description: Refactor of the /docs tutorials & guides page — collapsible accordion, per-entry mini walkthroughs, linear-icon illustrations, and a contextual "?" help entry point on every page with matching docs content.
status: final
updated: 2026-09-02
colors:
  help-icon: '{finance-helper.colors.muted}'
  help-icon-hover: '{finance-helper.colors.accent}'
  help-icon-dark: '{finance-helper.colors.muted-dark}'
  help-icon-hover-dark: '{finance-helper.colors.accent-dark}'
  accordion-header-text: '{finance-helper.colors.text}'
  accordion-header-text-dark: '{finance-helper.colors.text-dark}'
  accordion-border: '{finance-helper.colors.border}'
  accordion-border-dark: '{finance-helper.colors.border-dark}'
  entry-illustration-stroke: '{finance-helper.colors.accent}'
  entry-illustration-stroke-dark: '{finance-helper.colors.accent-dark}'
  step-number-background: '{finance-helper.colors.surface}'
  step-number-background-dark: '{finance-helper.colors.surface-dark}'
  step-number-text: '{finance-helper.colors.accent}'
  step-number-text-dark: '{finance-helper.colors.accent-dark}'
  deep-link-text: '{finance-helper.colors.accent}'
  deep-link-text-dark: '{finance-helper.colors.accent-dark}'
typography:
  accordion-section-title:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 1.05rem
    fontWeight: '600'
    lineHeight: '1.3'
  entry-title:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.95rem
    fontWeight: '600'
    lineHeight: '1.3'
  entry-body:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.85rem
    fontWeight: '400'
    lineHeight: '1.5'
  step-text:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.85rem
    fontWeight: '400'
    lineHeight: '1.45'
  deep-link:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.82rem
    fontWeight: '550'
rounded:
  step-badge: '{finance-helper.rounded.full}'
  illustration-frame: '{finance-helper.rounded.md}'
spacing:
  accordion-section-gap: '{finance-helper.spacing.6}'
  entry-gap: '{finance-helper.spacing.5}'
  step-gap: '{finance-helper.spacing.3}'
  step-indent: '{finance-helper.spacing.6}'
components:
  help-icon-button:
    size: 2.25rem
    icon: question-mark, stroke-linear, {finance-helper.components.upload-button.icon-stroke}px
    color: '{colors.help-icon}'
    hover-color: '{colors.help-icon-hover}'
    background: transparent
    borderRadius: '{finance-helper.rounded.full}'
    position: top-right corner of the page header (header.trailing slot), never on the public landing page
    label: none — icon only
    disclosure: tooltip on hover/focus reads "Learn more"; aria-label reads "Learn more about {page name}"
  accordion-section:
    header-typography: '{typography.accordion-section-title}'
    header-color: '{colors.accordion-header-text}'
    border-bottom: '1px solid {colors.accordion-border}'
    default-state: collapsed
    chevron: rotates 90deg on expand, matches {finance-helper.colors.muted}
    padding-block: '{finance-helper.spacing.4}'
  doc-entry:
    title-typography: '{typography.entry-title}'
    body-typography: '{typography.entry-body}'
    illustration-frame:
      borderRadius: '{rounded.illustration-frame}'
      background: '{finance-helper.colors.surface}'
      border: '1px solid {finance-helper.colors.border}'
      stroke: '{colors.entry-illustration-stroke}'
      stroke-width: 1.5
      max-width: 100%
    step-list:
      badge-background: '{colors.step-number-background}'
      badge-text: '{colors.step-number-text}'
      badge-shape: '{rounded.step-badge}'
      badge-size: 1.5rem
      text-typography: '{typography.step-text}'
      gap: '{spacing.step-gap}'
      indent: '{spacing.step-indent}'
    deep-link:
      typography: '{typography.deep-link}'
      color: '{colors.deep-link-text}'
      icon: trailing chevron-right, 0.75rem
      underline: none, hover-underline
---

# DESIGN.md — docs-tutorials-page

Visual identity delta for the `/docs` refactor. Inherits every unlisted token (base palette, brand typography, `rounded`, `spacing` scale, `button-primary`, `top-nav`, `tab-bar`) from the finalized [`finance-helper` spine](../ux-finance-helper-2026-08-03/DESIGN.md) — this file only defines what's new: the help entry point and the accordion/entry components. Spines win on conflict with any mock.

## Brand & Style

No new brand identity. `/docs` and its contextual help buttons read as the same Soft-Ledger hybrid app — warm sand surfaces, linear-stroke iconography, Manrope body text. The only new visual note is the illustration language: simple single-color SVG diagrams in the same 1.5px linear stroke as the landing page's `FeatureCard` icons ({finance-helper.colors.accent}), never photographic screenshots — this keeps the guides visually stable across UI redesigns.

## Colors

All new tokens above alias `{finance-helper.colors.*}` directly — no new hues introduced. The help icon uses `muted` at rest so it doesn't compete with page content, and shifts to `accent` on hover/focus to confirm interactivity.

## Typography

Accordion section titles sit one step below page `h1` scale and above `entry-title`, giving the page three readable levels: section → entry → step. All typography still resolves to the `Manrope` body family from `finance-helper`; no new font is introduced.

## Layout & Spacing

Sections stack vertically with `{spacing.accordion-section-gap}` between them. Within an open section, entries stack with `{spacing.entry-gap}`. Numbered steps indent from the entry body by `{spacing.step-indent}` so they read as a nested sub-list, each step gapped by `{spacing.step-gap}`.

## Shapes

Step badges are full-round pills (`{rounded.step-badge}`) matching the app's existing pill language (tab bar, buttons). Illustration frames use `{rounded.illustration-frame}` — same radius as cards elsewhere in the app — so the diagram reads as embedded content, not a separate widget.

## Components

- **help-icon-button** — the contextual "?" affordance. Icon-only, tooltip/aria-label carries "Learn more" (no visible text label per product decision). Lives in the page header's trailing slot; appears only on pages that have matching `/docs` content (Lists, Budgets, Cards, Upload/import) — never on the public landing page, which keeps its own existing link treatment.
- **accordion-section** — one per doc category (Lists / Cards & imports / Budgets). Collapsed by default; expands on tap or via incoming deep-link hash.
- **doc-entry** — one guide within a section: title, body copy (existing "why/edge case" prose retained), optional linear-SVG illustration, optional numbered step list, and a deep-link affordance to the live app screen.

## Do's and Don'ts

- **Do** keep illustrations single-color linear SVG in `{colors.entry-illustration-stroke}` — never introduce photographic screenshots (maintenance risk called out explicitly by the user).
- **Do** keep the help icon unlabeled (tooltip only) — a visible text label was explicitly rejected in favor of a universally-recognized "?" affordance.
- **Don't** show the help icon on the public landing page — that surface keeps its own existing entry point, unchanged by this spine.
- **Don't** invent new accent colors for step badges or deep-links — reuse `{finance-helper.colors.accent}` so the page doesn't fork the palette.
