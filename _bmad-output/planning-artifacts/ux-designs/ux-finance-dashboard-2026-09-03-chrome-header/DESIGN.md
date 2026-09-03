---
name: chrome-header
description: Visual identity for the shared AppShell chrome header — leading slot (Back or Avatar-as-account-link), title, and trailing slot (DocsHelpButton + page actions) — used consistently across every authenticated page.
status: final
updated: 2026-09-03
colors:
  leading-avatar-ring: '{finance-helper.colors.accent}'
  title-text: '{finance-helper.colors.text}'
  title-text-dark: '{finance-helper.colors.text-dark}'
  details-text: '{finance-helper.colors.muted}'
  details-text-dark: '{finance-helper.colors.muted-dark}'
  trailing-icon: '{finance-helper.colors.muted}'
  trailing-icon-hover: '{finance-helper.colors.accent}'
  trailing-icon-dark: '{finance-helper.colors.muted-dark}'
  trailing-icon-hover-dark: '{finance-helper.colors.accent-dark}'
typography:
  chrome-title:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 1.5rem
    fontWeight: '550'
  chrome-details:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.85rem
    fontWeight: '400'
spacing:
  slot-box: 40px
  header-gap: 8px
  header-padding-block: '8px 4px'
components:
  chrome-header:
    background: transparent
    padding: '{spacing.header-padding-block} max(1rem,env(safe-area-inset-right)) max(0.5rem,env(safe-area-inset-left))'
    gap: '{spacing.header-gap}'
  chrome-leading-slot:
    box: '{spacing.slot-box}'
    back-icon: '{trailing-icon}'
    back-icon-hover: '{trailing-icon-hover}'
    avatar-hover-ring: '2px solid {colors.leading-avatar-ring}'
  chrome-title:
    typography: '{typography.chrome-title}'
    color: '{colors.title-text}'
    color-dark: '{colors.title-text-dark}'
  chrome-details:
    typography: '{typography.chrome-details}'
    color: '{colors.details-text}'
    color-dark: '{colors.details-text-dark}'
  chrome-trailing-slot:
    box: '{spacing.slot-box}'
    icon-color: '{colors.trailing-icon}'
    icon-color-hover: '{colors.trailing-icon-hover}'
    icon-color-dark: '{colors.trailing-icon-dark}'
    icon-color-hover-dark: '{colors.trailing-icon-hover-dark}'
---

# DESIGN.md — chrome-header

Visual identity for the header row every authenticated screen shares via `AppShell`'s `useChromeHeader`. Base palette, type, and spacing tokens inherit from the [`finance-helper` spine](../ux-finance-helper-2026-08-03/DESIGN.md); this file adds only the chrome-specific tokens above. Extends the `top-nav` component already defined there — this is that component's full spec, not a replacement.

## Brand & Style

The chrome header is a quiet frame, not a feature. It should never compete with page content for attention: no fills, no shadows, no borders — a transparent strip that sits above the scroll area. The one place it's allowed personality is the **leading slot avatar** on top-level tabs, which carries the app's existing deterministic avatar-color palette (`{finance-helper.lib.avatarColor}`) — the header's single spot of saturated color, functioning as a wayfinding anchor ("this is you") rather than decoration.

## Colors

- `{colors.title-text}` / `{colors.details-text}` inherit directly from finance-helper `text` / `muted` — no new hues introduced for typography.
- `{colors.trailing-icon}` and `{colors.leading-avatar-ring}` both resolve to the same `accent` green used for focus rings and active tab-bar state elsewhere in the app — reused deliberately so hover/focus on chrome controls reads as "the same kind of interactive" as the rest of the app, not a one-off.
- Dark-mode pairs (`-dark` suffix) mirror the base spine's dark palette; no chrome-specific dark overrides.

## Typography

`chrome-title` matches the existing `1.5rem / 550` weight already shipping in `AppShell.tsx` — codified here, not changed. `chrome-details` (used for e.g. a remaining-count on review screens) stays visually subordinate: smaller size, `muted` color, never bold.

## Layout & Spacing

Three-slot row, fixed leading/trailing box widths so title truncation is predictable regardless of which slot state is active:

```
[ leading: 40×40 ] [ title (+ optional details), flex-1, truncates ] [ trailing: 40×40+ ]
```

- **Leading slot** is a fixed `{spacing.slot-box}` (40px) box, `justify-start` — same footprint whether it holds a Back `IconButton` or an Avatar `md` (40px). This is the fix for the visual-weight complaint: the box itself never changes size, so title position is stable across pages.
- **Trailing slot** is `justify-end`, minimum `{spacing.slot-box}`, grows rightward if more than one action is present (help icon is always last/outermost — see EXPERIENCE.md Component Patterns).
- **Header gap** (`{spacing.header-gap}`, 8px) separates leading / title-block / trailing consistently; no per-page overrides.
- Row keeps the existing safe-area-aware padding (`env(safe-area-inset-*)`) already in `AppShell.tsx` — codified, not changed.

## Elevation & Depth

None. The chrome header has no shadow, no elevation change on scroll, no sticky-shadow-on-scroll treatment. It sits flush with the page background; only the `TabBar` at the bottom carries a border/surface distinction (`{finance-helper.components.tab-bar}`).

## Shapes

- Leading Back `IconButton`: circular ghost hit-area (existing `IconButton` `variant="ghost"` shape — unchanged).
- Leading Avatar: `{finance-helper.rounded.sm}`-ish 8px rounded square (existing `Avatar` shape — unchanged), gains a 2px accent ring on hover/focus once it becomes a live link (new — see Components below).
- Trailing help icon: circular ghost hit-area, matching the leading Back button exactly, so leading and trailing read as the same control family from opposite ends.

## Components

**chrome-leading-slot** (visual)
| State | Content | Visual |
|---|---|---|
| Sub-page (has a parent to return to) | Back `IconButton` | Ghost circle, `{colors.trailing-icon}` idle, `{colors.trailing-icon-hover}` on hover/focus |
| Top-level tab root (Home/Lists, Budgets, Cards, Account) | Avatar, `size="md"`, wrapped as a link to `/account` | Existing avatar fill; **on hover/focus gains `{components.chrome-leading-slot.avatar-hover-ring}`** — the visual cue that closes the "looks tappable but isn't" gap |
| Neither (rare) | Empty | Slot box stays reserved (title never shifts left to fill it) |

**chrome-title** (visual) — single-line, `truncate`, always plain text content (no icons inline). Optional `chrome-details` sits to its right, same row, `shrink-0`.

**chrome-trailing-slot** (visual) — one or more icon-only ghost buttons, `gap-1` between them if more than one; `DocsHelpButton` (the "?" icon) is always the visually last (rightmost/outermost) element in this slot on every page that has one — see `references/design-md-spec.md` component-ordering convention mirrored in EXPERIENCE.md.

## Do's and Don'ts

- **Do** keep the leading and trailing slots the same fixed box size, even on pages where one is empty — this is what makes the header feel balanced across the whole app, not just on any single page.
- **Do** give the avatar a visible hover/focus state once it's a live link — an interactive element with zero visual feedback is worse than a static one.
- **Don't** add a border, background fill, or shadow to the chrome header — it must stay a quiet frame.
- **Don't** let `chrome-details` compete with `chrome-title` in size or weight — it's supporting text, always.
- **Don't** introduce a second color for trailing icons distinct from the leading Back icon — one `{colors.trailing-icon}` family for both keeps the "same control language, opposite ends" read intact.
