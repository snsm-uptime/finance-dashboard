---
name: button-system
description: Behavioral spec for BaseButton and its Primary/Accent/Ghost variants — props, states, link-vs-action semantics, accessibility floor.
status: final
updated: 2026-09-03
---

# EXPERIENCE.md — button-system

Behavioral spine for the app-wide button primitive. Visual identity lives in [`DESIGN.md`](./DESIGN.md) — this file owns props, state machine, and interaction rules only. Spines win if any artifact conflicts with this file.

---

## Foundation

Form-factor: responsive web (existing app is Next.js / React, no native surface). No UI kit — `BaseButton` is a from-scratch primitive per `finance-helper` DESIGN.md's "do not inherit shadcn or any kit defaults as brand." Replaces `ui/components/soft-ledger/PrimaryButton.tsx` and `ui/components/soft-ledger/GhostButton.tsx`; `AccentButton` is new.

No new user-facing flow — this is a primitive swap under existing flows (sign-up/sign-in CTAs on the landing page today; any future button call site). Correctness is verified per call site, not as a standalone journey.

---

## Component Patterns

**`BaseButton`** — the shell every variant renders through. Not used directly by feature code; `PrimaryButton`, `AccentButton`, `GhostButton` each wrap it with a fixed `variant`.

Props:

| Prop | Type | Default | Behavior |
|---|---|---|---|
| `variant` | `"primary" \| "accent" \| "ghost"` | — (required, set by the wrapping component) | Selects the DESIGN.md color/hover mapping. |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Selects padding + typography from DESIGN.md Layout & Spacing. |
| `case` | `"none" \| "uppercase" \| "lowercase"` | `"none"` | Pure `text-transform`. Never mutates the label string — a `loading` announcement or `aria-label` reads the original casing regardless of this prop. |
| `href` | `string \| undefined` | `undefined` | When set, renders as a link (`next/link`) instead of a `<button>`. Mutually exclusive with `onClick`-as-primary-action — see Interaction Primitives. |
| `disabled` | `boolean` | `false` | Standard disabled state. Ignored (has no effect) when `href` is set — links can't be natively disabled; see Accessibility Floor. |
| `loading` | `boolean` | `false` | Shows a spinner and forces disabled-equivalent behavior. See State Patterns. |
| `iconLeft` / `iconRight` | `ReactNode \| undefined` | `undefined` | Optional icon slots either side of the label, laid out via `{spacing.icon-gap}`. |
| `children` | `ReactNode` | — (required) | The label. |
| ...rest | native `button`/`anchor` attrs | — | Passed through (`onClick`, `type`, `aria-*`, `target`, etc.), same pattern as the current `PrimaryButton`/`GhostButton`. |

`PrimaryButton`, `AccentButton`, `GhostButton` are thin wrappers: `<BaseButton variant="primary" {...props} />` etc. — kept as named exports so call sites read `<PrimaryButton href="/signup">` rather than `<BaseButton variant="primary" href="/signup">` everywhere, matching how the codebase already calls them today.

---

## State Patterns

| State | Trigger | Visual (→ DESIGN.md) | Behavioral |
|---|---|---|---|
| Idle | default | `{components.button-{variant}}` idle colors, no shadow | Interactive, focusable |
| Hover | pointer over, not disabled/loading | fills solid (Primary/Accent) or border+label shift (Ghost) + lift shadow | Suppressed entirely when `disabled` or `loading` |
| Focus-visible | keyboard focus | idle/hover colors unchanged + focus ring (see Accessibility Floor) | Same as idle otherwise |
| Active/pressed | pointer down | shadow flattens, transform returns toward idle | Momentary, releases to hover or idle |
| Disabled | `disabled={true}` (button only) | `opacity: 0.55`, uniform across variants | `cursor: not-allowed`, not focusable, click/keyboard activation is a no-op, `aria-disabled="true"` |
| Loading | `loading={true}` | spinner replaces `iconLeft` (or sits before the label if no `iconLeft` given); label stays visible unless space-constrained at `sm` | Forces disabled-equivalent: not clickable, not activatable via focus, `aria-busy="true"`. Distinct from `disabled` in the a11y tree — a loading button is busy, not permanently unavailable. |

A button is never simultaneously showing hover chrome and disabled/loading chrome — hover is gated on `!disabled && !loading` at the CSS level (`:hover:not(:disabled)`), not just by convention.

---

## Interaction Primitives

- **Link vs. action**: if `href` is provided, `BaseButton` renders an `<a>` (via `next/link`) styled identically to the `<button>` form — this is the pattern already established by the `PrimaryButton`/`GhostButton` `href`-renders-as-Link work on the landing page. If both `href` and `onClick` are given, `onClick` still fires (e.g. for analytics) but navigation via `href` is the primary action — don't use this combination to fake a confirm-before-navigate flow; that needs a real dialog.
- **Disabled links**: native anchors can't be `disabled`. If a future call site needs a "disabled-looking" link, that's a product decision to make explicitly (e.g. render a real disabled `<button>` instead, or gate the route) — `BaseButton` does not silently ignore `disabled` on links without saying so; treat it as a gap to flag, not a supported state.
- **Keyboard activation**: `Enter`/`Space` on `<button>` form; `Enter` on `<a>` form — standard native behavior, no custom key handling.
- **Case prop and screen readers**: `text-transform: uppercase` is purely visual in every modern screen reader (they read the underlying string casing) — no extra `aria-label` needed to compensate for the `case` prop.

---

## Accessibility Floor

Inherits `finance-helper`'s WCAG 2.2 AA floor.

- Focus-visible ring on every variant, every state (including disabled-adjacent hover-suppressed): `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`, colored to the variant's idle border color — matches the existing `PrimaryButton`/`GhostButton` pattern, carried into `BaseButton`.
- Disabled buttons: `aria-disabled="true"` in addition to the native `disabled` attribute (belt-and-suspenders for AT that doesn't fully honor native disabled semantics on custom-styled buttons).
- Loading buttons: `aria-busy="true"`; do not also set `aria-disabled` — "busy" and "disabled" read differently to AT users and the button should be understood as temporarily, not permanently, unavailable.
- Contrast: `{colors.accent}` (`#4356A3` light / `#ADBDFF` dark) against its filled-hover `{colors.on-accent}` and against the page background at idle (text-on-background) both need an AA contrast check before this ships — **[ASSUMPTION]** not verified against real contrast tooling in this pass; verify against both `{finance-helper.colors.background}`/`background-dark` (idle, text on canvas) and `{colors.on-accent}`/`on-accent-dark` (hover, text on fill) before implementation ships.
- Icon-only usage (`iconLeft`/`iconRight` with no visible label) is not covered by this pass — every current call site has a text label. If an icon-only button is needed later, it requires an explicit `aria-label`, which isn't modeled in the props table above.
