---
name: finance-helper
description: Household settle-up web app — calm clarity on warm sand; Soft-Ledger hybrid layout within the Ledger Strip family.
status: final
updated: 2026-08-03
colors:
  background: '#F7F3EC'
  surface: '#FFFCF7'
  text: '#2A241C'
  muted: '#6E6456'
  border: '#E2D8C8'
  accent: '#3F6B45'
  on-accent: '#FFFCF7'
  owe: '#A04936'
  owed: '#2F6E48'
  background-dark: '#17140F'
  surface-dark: '#221E17'
  text-dark: '#F0E9DC'
  muted-dark: '#A89B88'
  border-dark: '#3A342A'
  accent-dark: '#8FBB8E'
  on-accent-dark: '#17140F'
  owe-dark: '#D48B78'
  owed-dark: '#7EC794'
typography:
  brand:
    fontFamily: Petrona, 'Times New Roman', serif
    fontSize: 0.66rem
    fontWeight: '500'
    letterSpacing: 0.03em
  list-title:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.66rem
    fontWeight: '500'
  strip-who:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.72rem
    fontWeight: '500'
    letterSpacing: 0.02em
    lineHeight: '1.3'
  strip-amount:
    fontFamily: Petrona, 'Times New Roman', serif
    fontSize: 1.7rem
    fontWeight: '500'
    letterSpacing: -0.03em
    lineHeight: '1.1'
  section-label:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.6rem
    fontWeight: '550'
    letterSpacing: 0.05em
  body:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.74rem
    fontWeight: '400'
    lineHeight: '1.4'
  meta:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.62rem
    fontWeight: '400'
  amount-inline:
    fontFamily: Petrona, 'Times New Roman', serif
    fontSize: 0.74rem
    fontWeight: '500'
  button:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.66rem
    fontWeight: '550'
  tab:
    fontFamily: Manrope, system-ui, sans-serif
    fontSize: 0.58rem
    fontWeight: '500'
rounded:
  sm: 8px
  md: 10px
  lg: 12px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 10px
  '4': 12px
  '5': 14px
  '6': 16px
  strip-inset: 10px
  page-gutter: 10px
  nav-x: 14px
  row-y: 9px
components:
  balance-strip:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    borderRadius: '{rounded.md}'
    padding: '{spacing.5} {spacing.4}'
    margin-inline: '{spacing.strip-inset}'
    who-color: '{colors.muted}'
    amount-owe: '{colors.owe}'
    amount-owed: '{colors.owed}'
  button-primary:
    background: '{colors.accent}'
    color: '{colors.on-accent}'
    borderRadius: '{rounded.sm}'
    padding: '9px 12px'
    typography: '{typography.button}'
  receipt-row:
    padding: '{spacing.row-y} 4px'
    border-bottom: '1px solid {colors.border}'
    meta-color: '{colors.text}'
    when-color: '{colors.muted}'
    amount-color: '{colors.muted}'
  section-label:
    color: '{colors.muted}'
    typography: '{typography.section-label}'
    text-transform: uppercase
  top-nav:
    padding: '10px {spacing.nav-x}'
    background: transparent
    brand-color: '{colors.muted}'
    list-title-color: '{colors.text}'
  tab-bar:
    background: '{colors.surface}'
    border-top: '1px solid {colors.border}'
    inactive: '{colors.muted}'
    active: '{colors.accent}'
  hint:
    color: '{colors.muted}'
    typography: '{typography.meta}'
    margin-inline: '{spacing.strip-inset}'
---

# DESIGN.md — finance-helper

Visual identity spine. Binding reference for Soft-Ledger hybrid layout: [`.working/directions-2-warm-balance.html`](./.working/directions-2-warm-balance.html) (panel **Soft-Ledger hybrid**). Promoted key composition: [`mockups/list-settle.html`](./mockups/list-settle.html). Spines win if any artifact conflicts with this file.

Product name: **finance-helper**. Logo / wordmark assets: **TBD** (name-only for now).

Appearance: **follow system** — both light and dark Warm Balance tokens ship; UI tracks OS preference.

UI system: **unspecified**. Architecture chooses the component stack later. This spine owns Warm Balance tokens and Soft-Ledger hybrid behavior — do **not** inherit shadcn (or any kit) defaults as brand.

Accessibility floor (product decision): WCAG 2.2 AA. UI language: English and Spanish from v1 (i18n).

---

## Brand & Style

finance-helper is **calm + clear** — household money without stress theatre. The locked feel is Warm Balance: grounded domestic ease on warm sand paper with moss-green action. Layout personality is **Soft-Ledger hybrid** inside the **Ledger Strip** family: the settle amount still leads in a ruled strip, but chrome loosens into an island strip, airier receipt rows, and lighter register weight than Canonical Ledger Strip.

Steal the scan feeling of Splitwise — who owes whom is instantly readable. Reject bank-app density: no dense tables as the primary read, no bank jargon or product codes as UI language, never hide the number the user came for.

Copy register (voice) is plain and direct — e.g. “You owe Partner ₡42,500”. Visually that means the strip who-line and hero amount carry hierarchy; decoration and celebration chrome stay out.

---

## Colors

Warm Balance is locked. Light mode is sand canvas; dark mode is low warm charcoal. Accent is moss — action only, not decoration wallpaper.

| Role | Light | Dark | Use |
|---|---|---|---|
| Background | `{colors.background}` | `{colors.background-dark}` | Screen canvas; Soft-Ledger lets canvas show through transparent receipt zones |
| Surface | `{colors.surface}` | `{colors.surface-dark}` | Strip island, tab bar, raised paper |
| Text | `{colors.text}` | `{colors.text-dark}` | Primary ink (list titles, row titles) |
| Muted | `{colors.muted}` | `{colors.muted-dark}` | Chrome, who-line, hints, section labels, receipt amounts in Soft-Ledger |
| Border | `{colors.border}` | `{colors.border-dark}` | 1px rules — strip outline, row hairlines, tab top |
| Accent | `{colors.accent}` | `{colors.accent-dark}` | Primary actions, active tab |
| On-accent | `{colors.on-accent}` | `{colors.on-accent-dark}` | Label on filled accent controls |
| Owe | `{colors.owe}` | `{colors.owe-dark}` | Amounts the viewer owes |
| Owed | `{colors.owed}` | `{colors.owed-dark}` | Amounts owed to the viewer / settled-healthy signal |

**Rules**

- Settle hero amount uses `{colors.owe}` or `{colors.owed}` by direction — never neutral ink when polarity matters.
- Accent is for CTA and selected chrome — not for large fills behind body text.
- Borders stay 1px Warm Balance border — Soft-Ledger hybrid does not use 2px heavy register rules (that’s Dense Ink, not chosen).
- [ASSUMPTION] `{colors.on-accent-dark}` = `{colors.background-dark}` for contrast on the lighter moss accent; not enumerated in the original eight dark tokens — validate AA on real controls.

Avoid: purple finance clichés, cool slate bank blues as brand, celebration red/green blotches beyond owe/owed semantics, gradients as the main atmosphere (canvas tone carries warmth).

---

## Typography

**Faces (locked):** **Petrona** for brand wordmark, strip amounts, and inline money; **Manrope** for UI chrome, who-line, body, buttons, tabs. Chosen from `.working/type-specimens-2.html` (D). Fallbacks: Petrona → `'Times New Roman', serif`; Manrope → `system-ui, sans-serif`. Do **not** substitute Inter or Roboto as brand type.

Soft-Ledger hybrid type manner: **medium-light weights** (≈400–550), not Canonical’s 650–700 register bold. Who-line is sentence case (not uppercase tracked caps). Amounts use **tabular nums** wherever money appears.

| Role | Token | Soft-Ledger notes |
|---|---|---|
| Wordmark / brand chrome | `{typography.brand}` | Muted ink; letter-spacing ≈ 0.03em; weight 500 |
| List title (nav) | `{typography.list-title}` | Primary text; weight 500 |
| Strip who-line | `{typography.strip-who}` | Muted; sentence case; weight 500 |
| Strip amount | `{typography.strip-amount}` | Hero; weight 500; tracking −0.03em; owe/owed color |
| Section label | `{typography.section-label}` | Uppercase + tracking; muted |
| Body / receipt title | `{typography.body}` | Weight 400 |
| Meta / hint / when | `{typography.meta}` | Muted |
| Inline amount | `{typography.amount-inline}` | Weight 500; Soft-Ledger colors receipt amts muted |
| Button | `{typography.button}` | Weight ≈550 |
| Tab | `{typography.tab}` | Inactive muted; active `{colors.accent}` |

[ASSUMPTION] Rem sizes above are taken from Soft-Ledger hybrid panel CSS in a phone framed mock; absolute px remapping at implementation root may need a short calibration pass — preserve **relative** hierarchy (amount ≫ who ≫ row).

---

## Layout & Spacing

**Personality:** Soft-Ledger hybrid — looser strip island + airier rows within Ledger Strip scan order.

**List surface order (product):** settle balances / amounts first; receipts newest-first below.

**Soft-Ledger hybrid structure (phone)**

1. **Top nav** — transparent; `{spacing.nav-x}` horizontal padding; no bottom rule; brand left (muted), list title right (text).
2. **Balance strip island** — `{spacing.strip-inset}` side margin; `{colors.surface}` fill; 1px `{colors.border}` all around; `{rounded.md}`; padding `{spacing.5}` × `{spacing.4}`; two-column grid (who + amount | primary CTA).
3. **Hint** — under strip; transparent on canvas; muted meta; same side inset as strip.
4. **Receipts** — transparent over `{colors.background}`; section label then airier rows (≈ `{spacing.row-y}` vertical padding); **bottom** hairline only (no top rule crowding).
5. **Tab bar** — surface; 1px top border; three equal columns (List / Upload / Account pattern in the direction).

Desktop: **same IA**, wider layout — not a separate visual system. Phone remains the primary narrated form factor for discovery journeys.

Spacing tokens follow a ~4px rhythm observed in Soft-Ledger hybrid paddings (`{spacing.1}`…`{spacing.6}`). Prefer gutters `{spacing.page-gutter}` / `{spacing.strip-inset}` over edge-flush Canonical strips.

[ASSUMPTION] Full responsive breakpoint sheet (exact desktop max-width / column grid) not locked — widen Soft-Ledger patterns without inventing a dashboard chrome.

---

## Elevation & Depth

Depth is **tonal layering**, not shadow theatre.

- Canvas `{colors.background}` vs paper `{colors.surface}` separates strip island and tab bar from receipts.
- Soft-Ledger hybrid drops full-bleed strip rules in favor of a **bordered island**; receipts sit on transparent canvas so the sand (or dark charcoal) breathes between chrome.
- Product UI in the Soft-Ledger panel does **not** rely on drop shadows for hierarchy — 1px borders and surface/canvas contrast do the work.

[ASSUMPTION] If a modal or sheet needs lift later, use a soft warm-tinted shadow at low opacity keyed to `{colors.text}` / sand — never cold pure black stacks or multi-layer glow. Not evidenced in Soft-Ledger hybrid; keep optional and rare.

---

## Shapes

Soft-Ledger hybrid corners are **soft but not pill**:

| Token | Value | Evidenced use |
|---|---|---|
| `{rounded.sm}` | 8px | Primary CTA in Soft-Ledger hybrid |
| `{rounded.md}` | 10px | Balance strip island |
| `{rounded.lg}` | 12px | [ASSUMPTION] Larger sheets / secondary panels (12px appears on board “glimpse” cards) |
| `{rounded.full}` | 9999px | Reserved; Soft-Ledger hybrid primary chrome does **not** use pill CTAs |

No sharp zero-radius bank grid. No default rounded-full action buttons for settle CTAs.

---

## Components

Specs below distill the Soft-Ledger hybrid panel. Dark mode swaps `*-dark` color tokens; structure unchanged.

### Balance strip (`components.balance-strip`)

Hero of the shared-list surface. Anatomy: who-line (`{typography.strip-who}`, `{colors.muted}`) · amount (`{typography.strip-amount}`, owe/owed) · primary CTA (grid column 2, vertically centered). Island inset from screen edges. Always show the settle number — never bury it below receipts.

### Button — primary (`components.button-primary`)

Moss fill `{colors.accent}`, label `{colors.on-accent}`, `{rounded.sm}`, compact padding `9px 12px`. List strip may omit a primary CTA when the amount itself is the climax (J2 balances-only). Never label a control “paid”, “mark settled”, or anything that records settlement in v1. Secondary/ghost buttons: [ASSUMPTION] text or border-only using `{colors.border}` / `{colors.text}` — not drawn in Soft-Ledger hybrid strip.

### Receipt row (`components.receipt-row`)

Two-column grid: title + when stacked left; amount right spanning both rows. Title `{colors.text}` weight 400; when `{colors.muted}`; amount `{colors.muted}` weight 500 tabular. Bottom hairline only; airier `{spacing.row-y}` padding.

### Section label (`components.section-label`)

Uppercase tracked label above receipt groups (e.g. “Receipts · newest first”). Muted; never competes with strip amount.

### Top nav (`components.top-nav`)

Minimal account chrome elsewhere; list surface nav is brand + list title only in the Soft-Ledger frame. Transparent over canvas — no bottom border.

### Tab bar (`components.tab-bar`)

Three-tab pattern evidenced (List / Upload / Account). Inactive `{colors.muted}`; active `{colors.accent}`. Surface bar with top hairline.

### Hint (`components.hint`)

Short muted line under the strip (e.g. payment happens outside the app). Not a second hero.

### Lists homepage (secondary glimpse)

Same Warm Balance tokens: list name + balance in owe/owed (or settled/zero). Instant who-owes-whom scan — Splitwise feeling, Soft-Ledger air.

### Incomplete disclosure

Not redrawn on Soft-Ledger hybrid panel; Soft Type panel showed disclosure under the strip. [ASSUMPTION] When needed on Soft-Ledger, place calm muted disclosure **below** the island strip (same inset), not over the amount — balances still lead.

---

## Do's and Don'ts

| Do | Don't |
|---|---|
| Lead every list surface with the settle amount in the Soft-Ledger strip island | Hide the number behind dense tables, charts, or long receipt scrolls |
| Use `{colors.owe}` / `{colors.owed}` for polarity | Color-code money with unsemantic rainbow badges |
| Keep Soft-Ledger air: inset island, transparent receipts, 1px borders | Canonical full-bleed heavy rules or Dense Ink 2px chrome as default |
| Follow system appearance with both token sets | Ship light-only or invent a third “brand” mode |
| Plain type hierarchy; tabular amounts | Inter/Roboto-as-brand theatre; emoji celebration chrome |
| Accent for actions and active tabs only | Moss washes behind body copy; purple/gradient finance clichés |
| Same IA on desktop, wider Soft-Ledger | Separate desktop “dashboard” visual language for v1 |
| Name-only brand until mark lands (TBD) | Invent a logo lockup in implementation |
