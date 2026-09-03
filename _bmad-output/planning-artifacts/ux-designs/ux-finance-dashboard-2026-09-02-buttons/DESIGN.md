---
name: button-system
description: BaseButton primitive + Primary/Accent/Ghost variants replacing the app's hand-rolled PrimaryButton/GhostButton CTA styling with one shared outline-to-filled interaction language.
status: final
updated: 2026-09-03
colors:
  primary: '{finance-helper.colors.accent}'
  primary-dark: '{finance-helper.colors.accent-dark}'
  on-primary: '{finance-helper.colors.on-accent}'
  on-primary-dark: '{finance-helper.colors.on-accent-dark}'
  accent: '#4356A3'
  accent-dark: '#ADBDFF'
  on-accent: '#FFFFFF'
  on-accent-dark: '#17140F'
  ghost-idle: '{finance-helper.colors.muted}'
  ghost-idle-dark: '{finance-helper.colors.muted-dark}'
  ghost-hover: '{colors.primary}'
  ghost-hover-dark: '{colors.primary-dark}'
typography:
  button-sm:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: '1.2'
  button-md:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.85rem
    fontWeight: '500'
    lineHeight: '1.2'
  button-lg:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.95rem
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  button: '{finance-helper.rounded.sm}'
spacing:
  button-sm: 6px 12px
  button-md: 9px 16px
  button-lg: 12px 20px
  icon-gap: 0.4em
components:
  button-base:
    display: inline-flex
    align-items: center
    justify-content: center
    gap: '{spacing.icon-gap}'
    borderRadius: '{rounded.button}'
    borderWidth: 2px
    borderStyle: solid
    cursor: pointer
    boxShadow-idle: none
    boxShadow-hover: 0 2px 6px rgba(0,0,0,.15)
    transform-hover: translateY(-1px)
    transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease
    disabled-opacity: 0.55
    disabled-cursor: not-allowed
    disabled-transform: none
    disabled-boxShadow: none
  button-primary:
    idle-background: transparent
    idle-border: '{colors.primary}'
    idle-color: '{colors.primary}'
    hover-background: '{colors.primary}'
    hover-color: '{colors.on-primary}'
  button-accent:
    idle-background: transparent
    idle-border: '{colors.accent}'
    idle-color: '{colors.accent}'
    hover-background: '{colors.accent}'
    hover-color: '{colors.on-accent}'
  button-ghost:
    idle-background: transparent
    idle-border: '{colors.ghost-idle}'
    idle-color: '{colors.ghost-idle}'
    hover-border: '{colors.ghost-hover}'
    hover-color: '{colors.ghost-hover}'
    hover-background: transparent
---

# DESIGN.md — button-system

Visual identity spine for the app-wide button primitive. Reference: [`.working/button-states.html`](./.working/button-states.html) (all variants × sizes × states, both themes). Extends [`finance-helper`](../ux-finance-helper-2026-08-03/DESIGN.md) — inherits Warm Balance palette, `rounded.sm`, and the `button` typography family; does not redefine them. Spines win if any artifact conflicts with this file.

This replaces the current hand-rolled `PrimaryButton.tsx` / `GhostButton.tsx` styling (inline Tailwind classes duplicated per usage) with one `BaseButton` primitive plus three variants, so every CTA in the app shares one hover/disabled/focus language instead of each button re-deriving it.

---

## Colors

Two of the three variant colors already exist in `finance-helper`; one is new.

| Role | Light | Dark | Use |
|---|---|---|---|
| Primary | `{colors.primary}` (= `{finance-helper.colors.accent}`) | `{colors.primary-dark}` | Primary variant — the existing moss action color. Also Ghost's hover color. |
| On-primary | `{colors.on-primary}` | `{colors.on-primary-dark}` | Primary variant label once filled on hover. |
| Accent | `{colors.accent}` | `{colors.accent-dark}` | Accent variant — **new** token, not previously in the palette. |
| On-accent | `{colors.on-accent}` | `{colors.on-accent-dark}` | Accent variant label once filled on hover. |
| Ghost idle | `{colors.ghost-idle}` (= `{finance-helper.colors.muted}`) | `{colors.ghost-idle-dark}` | Ghost variant border + label at rest. |

**Rules**

- `{colors.accent}` (`#4356A3` / `#ADBDFF`) is a **new global token** — promote it into `finance-helper.colors` the next time that base spine is touched, rather than letting it live only here.
- The name `accent` collides on purpose: here it names the new blue; in `finance-helper` it names the existing moss (aliased above as `{colors.primary}`). Always resolve through *this* file's `colors.*` when styling a button (see Do's and Don'ts).
- Ghost's hover color is `{colors.primary}`, not `{colors.accent}` — Ghost never introduces the blue.

---

## Typography

`button-sm` / `button-md` / `button-lg` are weight `500` (not bold — the base `{finance-helper.typography.button}` token is `600`; buttons in this system intentionally read lighter). `lineHeight: 1.2` on all three, paired with flex centering in Layout & Spacing — required to keep the label vertically centered inside the padded box (default button line-height does not center reliably, especially once an icon sits beside the label).

---

## Layout & Spacing

Three sizes, no separate "default" — `md` is the size every current call site (`Sign in`, `Create an account`, `Sign Up`) maps to.

| Size | Padding | Typography |
|---|---|---|
| `sm` | `{spacing.button-sm}` | `{typography.button-sm}` |
| `md` | `{spacing.button-md}` | `{typography.button-md}` |
| `lg` | `{spacing.button-lg}` | `{typography.button-lg}` |

`{spacing.icon-gap}` (`0.4em`) sits between the label and an optional leading/trailing icon.

Root layout: `display: inline-flex; align-items: center; justify-content: center;` — required for vertical centering, not optional flourish.

---

## Elevation & Depth, Shapes

Flat at rest. `{components.button-base.boxShadow-idle}` is `none` on every variant, every size. On hover, a single soft lift applies uniformly: `{components.button-base.boxShadow-hover}` + `{components.button-base.transform-hover}`. Active/pressed flattens the shadow and transform back toward idle. Disabled state carries no shadow and no hover transform regardless of variant.

Corners: `{rounded.button}` (= `{finance-helper.rounded.sm}`, 8px) — square-ish, never pill, matching the existing `PrimaryButton.tsx` comment ("rounded.sm only; never pill"). Border: `2px solid`, up from the `1–3px` mixed values in the current codebase — locked at `2px` uniformly across all three variants so weight reads consistently.

---

## Components

### button-base

Shared shell for all three variants — shadow, border-radius, border-width, flex layout, transition timing, and the disabled treatment live here once instead of being copy-pasted per variant.

- Idle: no shadow, no transform.
- Hover: `{components.button-base.boxShadow-hover}` + `{components.button-base.transform-hover}` — suppressed entirely when disabled.
- Disabled: `opacity: {components.button-base.disabled-opacity}` (0.55), `cursor: {components.button-base.disabled-cursor}`, all hover behavior inert. Uniform across variants — a disabled button never reads as "still its color," it always dims.
- Transition: `{components.button-base.transition}` — background-color, border-color, box-shadow, transform. Deliberately **not** a blanket `transition: all` (that includes non-animatable or unwanted properties and is where the earlier Primary hover flicker came from when combined with `background-clip: text`).

### button-primary

`{components.button-primary}`. Idle: transparent fill, `{colors.primary}` border + label. Hover: fills solid `{colors.primary}`, label flips to `{colors.on-primary}`.

Historical note: an earlier direction had Primary's hover use a `background-clip: text` knockout effect (fill solid, label punched out transparent to show the page through the glyphs). Dropped after repeated visual review — it produced a white flash on both hover-enter and hover-exit in WebKit that could not be resolved by scoping the transition or forcing a compositing layer. Primary now shares `button-accent`'s exact mechanic, differing only by color token.

### button-accent

`{components.button-accent}`. Idle: transparent fill, `{colors.accent}` border + label — **outline by default**, matching Primary's idle so the two variants read as siblings until you look at color. Hover: fills solid `{colors.accent}`, label flips to `{colors.on-accent}`.

Historical note: the first pass had Accent idle *filled* and hover *outlined* — inverted from what's specified above. In review this read backwards: the filled idle state looked already-activated/hovered, and the outlined hover state looked like the button had reverted to idle. Swapped to match Primary's idle-outline → hover-fill direction.

### button-ghost

`{components.button-ghost}`. Idle: transparent fill, `{colors.ghost-idle}` border + label. Hover: border and label shift to `{colors.ghost-hover}` (= `{colors.primary}`, the moss color — **not** the new Accent blue); fill stays transparent at every state, the only variant that never fills.

### Disabled (all variants)

`{components.button-base.disabled-opacity}` applied uniformly; see button-base above. No variant-specific disabled treatment.

---

## Do's and Don'ts

- Do keep Ghost's fill `transparent` in every state — it's the one variant that never fills; filling it on hover would make it indistinguishable from Primary/Accent.
- Do resolve `{colors.accent}` through *this* file, not `finance-helper.colors.accent` — the same word means a different color depending on which spine you're in (see Colors rules above).
- Do use `2px` border on all three variants — don't reintroduce the `1px`/`3px` mix from the current `PrimaryButton.tsx`/`GhostButton.tsx`.
- Don't use `transition: all` on the button shell — scope the transition to the specific properties in `{components.button-base.transition}`.
- Don't give Primary and Accent different idle/hover directions from each other — they're intentionally the same mechanic, recolored. If a future variant needs a genuinely different interaction (not idle-outline → hover-fill), that's a fourth variant, not a tweak to these two.
- Don't skip the flex-centering / `line-height: 1.2` pairing — a bare `padding` + default line-height does not reliably vertically center the label, especially once an icon sits in the row.
