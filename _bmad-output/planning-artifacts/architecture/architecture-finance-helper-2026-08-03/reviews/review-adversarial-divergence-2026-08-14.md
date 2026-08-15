# Adversarial Architecture Review — Divergence Pairs (AD-24)

**Artifact reviewed:** `ARCHITECTURE-SPINE.md` (finance-helper v1, draft, updated 2026-08-14)  
**Review type:** Adversarial divergence — pairs of one-level-down units that obey every AD literally yet integrate incompatibly  
**Focus:** AD-24 Type delivery and its interaction with AD-12 (visual authority) and AD-23 (Tailwind + SCSS)  
**Reviewer stance:** Parallel UI stories / Soft-Ledger primitives / a primitive vs a page. Each side cites AD compliance. Merge fails on type recipes, font-loading ownership, or consumption path (class vs inline vs SCSS vs tags).  
**Brownfield used only as evidence of forks the spine still permits** — not as a ratification of live `fontFamily` bags.

---

## Verdict

**Not merge-safe for parallel UI work.** AD-24 names the right enemies (per-file families, inline bags, tag→face maps, a second loader, `font-ui`+metrics as a shadow system) and correctly leaves faces/roles to DESIGN.md (AD-12) and the styling stack to AD-23. It does **not** close the forks those sentences still leave open.

A conscientious Story 3.5.2 (migrate Soft-Ledger primitives), a conscientious Story 3.5.3 / 4.x feature page, and a conscientious “implement the `@theme` bridge” change can each satisfy AD-12, AD-23, and AD-24 **to the letter** and still ship:

- two CSS variables both named `--font-ui` (loader vs theme);
- two recipe sources (`:root --type-*` vs `@utility` literals vs DESIGN.md rem copy);
- two consumption APIs for the same DESIGN.md component (primitive internals vs one `type-*` on a page);
- four authoring paths that AD-23’s “utilities and/or CSS variables” plus AD-24’s “class or prop” plus Deferred grandfathering all still bless.

**Severity:** Structural for Epic 3.5 / Epic 4 UI. Not a color-token nit. Each pair below is a **hole** closable only by a tightened AD-24 (or a one-line AD-12/AD-23 specialize), not by “builders should read carefully.”

---

## Method

For each pair:

1. Name two **one-level-down units** (UI story, Soft-Ledger primitive, or primitive vs page).
2. Show how **AD-12, AD-23, and AD-24 (and any other cited AD) are satisfied literally**.
3. Describe the **integration fracture**: clashing type recipes, two owners of font loading, or conflicting consumption paths (class vs inline vs SCSS vs tags).
4. Propose a **closing AD** (tighten existing — do not mint a parallel type contract).

AD inventory referenced: AD-12, AD-23, AD-24 as in the 2026-08-14 spine. Live `ui/` cited only where it proves the fork is already instantiated.

---

## Divergence Pairs

### Pair 1 — Loaded-face variable vs `@theme --font-ui` (two owners of one custom property)

| Unit A | **Root layout (Story 3.1 already shipped)** — `next/font/google` with `variable: "--font-ui"` / `"--font-brand"` on `<html>` |
| Unit B | **Type-delivery story** — `@theme { --font-ui: …; --font-brand: … }` mapping product names to loaded faces + DESIGN.md fallbacks |

**ADs obeyed (both):**

- **AD-24 Load once:** `next/font` only at root layout. No `@import`, no per-route `next/font`, no family-name literals.
- **AD-24 Bridge:** “The same `@theme` surface … maps `--font-ui` and `--font-brand` (product names) to those loaded faces plus DESIGN.md fallbacks.”
- **AD-24 Prevents / Load once:** “Loaded-face CSS variables … are distinct from Tailwind theme keys” **and** “`next/font` and Tailwind `@theme` sharing one CSS variable.”
- **AD-12:** Faces remain Petrona / Manrope from DESIGN.md. Neither unit invents Inter.

**Incompatible outcome — two owners of font loading:**

AD-24 **contradicts itself on the variable names.**

- **A** reads “product names `--font-ui` / `--font-brand`” and the live layout: the loader **is** the owner of `--font-ui`. Tailwind v4 `@theme --font-*` also **emits** a CSS custom property of that name. A’s `--font-ui` on `<html>` is the hashed family (`__Manrope_xxxx`).
- **B** reads “distinct from Tailwind theme keys” plus the mermaid (`FACE → TH`) and introduces `--face-ui` / `--font-manrope` (or similar) on `next/font`, then `@theme { --font-ui: var(--face-ui), system-ui, sans-serif }`.
- **B′ (letter-perfect, worse):** `@theme { --font-ui: var(--font-ui), system-ui, sans-serif }` — same token, circular. Next/font and `@theme` overwrite each other depending on cascade and whether the `variable` class is present.

`font-ui` utilities, `--type-*-face: var(--font-ui), …` tokens, and `body { font-family: var(--font-ui), … }` then resolve to different stacks in tests vs the browser. Both units claim AD-24. The Rule never **names** the loaded-face custom properties.

Live evidence: `ui/app/layout.tsx` already uses `--font-ui` / `--font-brand` as next/font variables; `ui/app/globals.css` `@theme` does **not** yet map fonts. The bridge story will collide with the loader story unless names are pinned.

**Hole → tighten AD-24 — Load once + Bridge (name both layers):**

> **Loaded-face vars** (next/font `variable:`) are `--face-ui` and `--face-brand` only — never `--font-ui` / `--font-brand`. **Theme keys** `--font-ui` / `--font-brand` live only inside `@theme` and must be `var(--face-ui), <DESIGN.md fallbacks>` / `var(--face-brand), <DESIGN.md fallbacks>`. One owner per name. Rename the existing layout variables in the same change that adds the `@theme` bridge — not a later chore.

---

### Pair 2 — `@utility` recipe vs DESIGN.md extras (primitive vs page)

| Unit A | **Soft-Ledger `SectionLabel`** — applies `type-section-label` internally **and** `uppercase text-muted` (DESIGN.md component anatomy) |
| Unit B | **List detail page (non-primitive)** — receipts header is a raw `<p className="type-section-label">` because AD-24 says a non-primitive adds **one** `type-*` class |

**ADs obeyed (both):**

- **AD-24 Consume:** Role utilities apply “the full recipe **(face + size + weight + tracking + line-height)** from the existing `--type-*` tokens.” Uppercase and color are **not** in that parenthetical.
- **AD-24:** “Feature TSX does not set fonts … a non-primitive adds one `type-*` class.” B adds exactly one type class and does not set `fontFamily`.
- **AD-12:** DESIGN.md `components.section-label` owns `text-transform: uppercase` and muted ink. A expresses that on the primitive (color/transform are look, not type-delivery).
- **AD-23:** A’s `uppercase text-muted` are co-located Tailwind utilities — the preferred path.

**Incompatible outcome — clashing type recipes for one role:**

On the list surface, A’s “THIS MONTH” is 0.6rem / 550 / 0.05em / uppercase / muted. B’s “THIS MONTH” is the same metrics **without** uppercase or muted — browser/body ink, sentence case. Both are `type-section-label`. DESIGN.md who-line “sentence case” and money “tabular nums” have the same hole: AD-24’s recipe list is narrower than the role.

Live evidence: `SectionLabel` already splits the role (`uppercase text-muted` + `--type-*` inline bag). A page that “just uses the class” will not match the primitive.

**Hole → tighten AD-24 — Consume (recipe = DESIGN.md typographic notes, not a 5-tuple):**

> `@utility type-{role}` applies **every typographic note on that DESIGN.md role**: face, size, weight, tracking, line-height, `text-transform`, `font-variant-numeric` (money roles: tabular nums). **Color stays out** of `type-*` (AD-12 / color utilities). Non-primitives may add color/layout classes; they MUST NOT omit a typographic note that lives on the role. “One `type-*` class” means one **type** class, not “the only class on the node.”

---

### Pair 3 — Balance strip primitive vs page-level hero (two owners of one DESIGN.md component)

| Unit A | **Soft-Ledger `BalanceStrip`** — who-line + amount apply `type-strip-who` / `type-strip-amount` internally; page must render `<BalanceStrip />` |
| Unit B | **List settle page / loading skeleton / period summary** — no primitive; a `<p className="type-strip-amount tabular-nums text-owe">` because AD-24 explicitly allows non-primitives to apply the role class |

**ADs obeyed (both):**

- **AD-12:** Warm Balance / Soft-Ledger own look. B uses DESIGN.md roles and owe/owed color utilities — does not ship kit defaults.
- **AD-12 addendum:** Type faces/roles stay in DESIGN.md; delivery is AD-24. B did not invent a face.
- **AD-24:** “Soft-Ledger primitives apply the role class internally; a non-primitive adds one `type-*` class **(or a prop that means that role)**.” B is a non-primitive. Using the class is the allowed path.
- **AD-23:** Co-located utilities. No new `*.module.css`. No re-picked hexes.

**Incompatible outcome — dual ownership + clashing consumption:**

A owns island layout, two-column grid, CTA slot, who+amount pairing (DESIGN.md `components.balance-strip`). B owns a lone hero number that can sit full-bleed, miss the who-line, skip tabular nums (if B treats `tabular-nums` as extra — Pair 2), or use `type-amount-inline` for a “smaller strip.” Epic 4 reuses “the same settle strip”; A and B are not the same strip. Tests screenshot different chrome; both pass AD-24 grep (`no fontFamily` / has `type-strip-amount`).

The spine’s capability map says type lives in “`@utility type-*`; Soft-Ledger primitives” — two homes, no rule for when a DESIGN.md **component** is mandatory.

**Hole → tighten AD-12 addendum + AD-24 Consume:**

> If DESIGN.md defines a **component** (`balance-strip`, `top-nav`, `tab-bar`, `receipt-row`, `section-label`, `hint`, `button-primary`, …), UI MUST use the matching Soft-Ledger primitive. `type-*` on raw elements is allowed only when **no** primitive exists for that role. Forbidden: a page re-implementing strip/nav/tab/receipt typography to avoid the primitive.

---

### Pair 4 — `:root --type-*` vs `@utility` literals vs `@theme` type keys (three recipe registries)

| Unit A | **Story 3.1 tokens** — `--type-strip-amount-size: 1.7rem` etc. on `:root` in `globals.css` (already shipped); utilities (when added) read `var(--type-*)` |
| Unit B | **Story 3.5.2 primitives** — `@utility type-strip-amount { font-family: var(--font-brand), …; font-size: 1.7rem; … }` copied from DESIGN.md frontmatter so the utility is “the full recipe” without depending on a parallel token sheet |

**ADs obeyed (both):**

- **AD-12:** Both copy DESIGN.md. A via tokens named 1:1 with `typography.*`. B via the same rem/weight values in the utility body.
- **AD-23:** Tokens remain authoritative “via CSS variables **and/or** Tailwind `@theme` mapping.” A is CSS variables. B is Tailwind `@utility` (the preferred co-located stack). The **and/or** blesses both.
- **AD-24:** Utilities “apply the full recipe … from the existing `--type-*` tokens.” A treats `--type-*` as source. B argues the utility **is** the recipe; `--type-*` are “existing” leftovers from 3.1 until the backfill chore (Deferred: AD-24 binds **new** work). DESIGN.md [ASSUMPTION] even allows a “short calibration pass” at implementation root — A calibrates tokens to 1.5rem; B still has 1.7rem from DESIGN.md.

**Incompatible outcome — clashing type recipes:**

Hero amount is 1.7rem in B’s buttons/utilities and 1.5rem in A’s still-living inline bags (`var(--type-strip-amount-size)` on `BalanceStrip`). A third builder puts `--type-*` **inside** `@theme`, accidentally generating extra Tailwind utilities (`text-type-strip-amount-size` or equivalent) that C uses as a fourth API.

AD-23’s “and/or” is the permission slip. AD-24 never says `--type-*` are the **only** writeable source, never forbids DESIGN.md literals inside `@utility`, never names the file that owns the registry.

**Hole → tighten AD-23 (type slice) + AD-24:**

> **One registry.** `--type-{role}-{face,size,weight,tracking,lh}` live on `:root` only (not inside `@theme`). `@theme` maps **families only** (`--font-ui` / `--font-brand`). `@utility type-{role}` references those `--type-*` vars — never DESIGN.md rem/weight literals. Calibration that changes a rem **updates DESIGN.md and the tokens together**. Stories consume this surface; they do not add a second copy.

---

### Pair 5 — `font-sans` + metric utilities vs `type-*` (shadow system via the door AD-24 left open)

| Unit A | **`BalanceStrip` / `ReceiptRow`** — `type-strip-who`, `type-amount-inline` (no family utility on the screen) |
| Unit B | **Cards / account / upload chrome (feature TSX)** — `className="font-sans text-[0.72rem] font-medium tracking-[0.02em]"` for a who-line equivalent |

**ADs obeyed (both):**

- **AD-24:** “screens MUST NOT compose those family utilities [`font-ui` / `font-brand`] with local size/weight/tracking.” B did **not** use `font-ui` or `font-brand`. B did **not** alias `font-sans` to Manrope (explicitly forbidden / Deferred). B did **not** write `style={{ fontFamily }}` or Inter/Roboto.
- **AD-23:** Prefer Tailwind utilities co-located. `font-sans`, `text-[…]`, `font-medium`, `tracking-[…]` are exactly that.
- **AD-12:** B did not pick a new brand face; Tailwind’s default `font-sans` is the kit system stack — AD-12 forbids kit **palettes**, not this utility, and AD-24 forbade **aliasing** it to the product face.

**Incompatible outcome — conflicting consumption + clashing recipes:**

A’s who-line is Manrope 0.72rem / 500 / 0.02em / 1.3. B’s is `ui-sans-serif` (often something Inter-adjacent on Apple/Google) at similar metrics. AD-24’s “do not alias `font-sans`” **preserves** the kit face as a tempting AD-23 utility. The Prevents line (“`font-ui`+local metrics as a shadow type system”) is implemented only for the two product family classes. The shadow system just changed clothes.

**Hole → tighten AD-24 Forbidden:**

> Feature TSX / Soft-Ledger primitives MUST NOT use `font-sans`, `font-serif`, `font-mono`, or any `font-*` family utility except as an implementation detail **inside** `@utility type-*` / the root `body` rule. MUST NOT compose `type-*` with local `text-*` / `font-*` (weight) / `tracking-*` / `leading-*` / arbitrary metric classes to impersonate or tweak a role. Impersonating a role with **any** family utility + metrics is the same violation as `font-ui` + metrics.

---

### Pair 6 — Grandfathered SCSS `font-family` vs new `type-*` on the same list surface

| Unit A | **Story 4.x / 3.5.3 editing `lists.module.scss`** — file already has `font-family: var(--font-ui)` / `var(--font-brand), Georgia, serif`; new labels/copy extend that pattern (“this file’s convention”) |
| Unit B | **Story 3.5.2 migrated primitives** — `type-brand` / `type-list-title` with DESIGN.md fallback `'Times New Roman'` |

**ADs obeyed (both):**

- **AD-24 Deferred:** “Backfill existing `fontFamily` inline / SCSS `font-family` onto `type-*` — AD-24 binds **new work**; migration is a chore story, not a second contract.” A is editing an existing SCSS module, not greenfield.
- **AD-23:** SCSS modules are allowed for custom styles utilities cannot express; A claims wordmark layout is custom. AD-24 says SCSS is layout/spacing only **for new type**, which A files under grandfathering.
- **AD-12:** Both intend Warm Balance. A’s Georgia fallback is already in the file (brownfield), not a newly invented Inter.

**Incompatible outcome — class vs SCSS vs fallback stack:**

Same viewport: TopNav primitive wordmark (Petrona → Times New Roman) next to lists header `.brand` (Petrona → **Georgia**). Title metrics in SCSS (`font-size` in the module) vs `type-list-title` (0.66rem / 500). AD-24 **Forbidden** already bans SCSS `font-family` with **no** grandfather clause; Deferred says the opposite. Two lawyers, two outcomes. The third reading — “this file already uses `font-family`, so one more selector is fine” — is how the shadow system grows during Epic 4.

Live evidence: `lists.module.scss` / `signup.module.scss` use Georgia; `--type-brand-face` uses Times New Roman; `AccountMenu` uses Georgia in an inline bag. Three fallbacks, one DESIGN.md.

**Hole → tighten AD-24 Rule + Deferred (same sentence):**

> Existing inline `fontFamily` / SCSS `font-family` may **remain until the backfill chore**. Do **not** add or extend that pattern. Any **new or edited** typography authoring uses `type-*` (or a Soft-Ledger prop that means that role). SCSS touched for layout may not gain new `font-*` / `letter-spacing` / `font-size` / `font-weight` / `line-height` rules. Fallback stack is DESIGN.md only (`Times New Roman` / `system-ui`) — Georgia is drift, not a convention.

---

### Pair 7 — New Soft-Ledger primitive copies 3.1 inline bags vs migrated `type-*` (two primitives)

| Unit A | **Story 3.5.2 `PrimaryButton` / `Hint`** — internals: `className="type-button"` / `type-meta` |
| Unit B | **Epic 4 new primitive** (card row, PDF-compare chrome, origin chip) — copies Story 3.1 house style: `style={{ fontFamily: "var(--type-meta-face)", fontSize: "var(--type-meta-size)", … }}` |

**ADs obeyed (both):**

- **AD-24:** B does not set a family **name** literal (no `"Manrope"`). B does not use `style={{ fontFamily: "var(--font-ui)" }}` as a one-off — it uses `--type-*` tokens, i.e. the “existing” recipe. Forbidden says “repeating `--type-*` as inline style bags” — B claims this **is** how Soft-Ledger primitives still look in HEAD until 3.5.2 merges, and AD-24 “or a prop that means that role” is unmet so the bag **is** the primitive applying the role.
- **AD-12:** Tokens 1:1 with DESIGN.md. No kit theme.
- **AD-23:** Inline style is not a new `*.module.css`. Utilities “cannot express” the bag because `@utility type-*` may not exist yet in B’s branch.

**Incompatible outcome — conflicting consumption (inline vs class):**

Two primitives, both “Soft-Ledger,” two APIs. A is overridable with Tailwind variants (`dark:`, `md:`). B’s inline bags win against utilities (specificity / inline). A 3.5.2 PR and an Epic 4 primitive PR merge: half the design system is classes, half is the 3.1 bag. Grep for `type-meta` misses B. Deferred backfill targets `fontFamily` / SCSS `font-family`, **not** `--type-*` inline bags — B can survive the chore.

Live evidence: every current file under `ui/components/soft-ledger/` except layout chrome uses the `--type-*` inline bag. That pattern is exactly what AD-24 forbids — and exactly what a parallel primitive author will copy.

**Hole → tighten AD-24 Consume + Forbidden:**

> Soft-Ledger primitives apply **exactly** `@utility type-{role}` (and color/layout classes). Forbidden: inline `style` bags of `--type-*` or `fontFamily`, including “tokenized” bags. New primitives in Epic 4+ follow 3.5.2, not 3.1. The backfill chore includes `--type-*` inline bags, not only `fontFamily` / SCSS `font-family`.

---

### Pair 8 — Tag defaults (face only) vs `type-body` (face + metrics) on forms

| Unit A | **`SoftLedgerSelect` / unmarked `<input>`** — no `type-*`; AD-24 “unmarked `body` and form controls inherit the UI face” |
| Unit B | **`ManualExpenseForm` page** — labels/hints get `type-meta`; values get `type-body`; amount gets `type-amount-inline` |

**ADs obeyed (both):**

- **AD-24 Tag defaults:** Inherit **the UI face**. Tags are not the type API — A does not map `input`→Manrope via a tag rule (body already has `--font-ui`). A does not add `type-*` because form controls are the documented exception.
- **AD-24 Consume:** B is feature TSX / a non-primitive; it adds one `type-*` per text node. Amount is a money role (tabular nums).
- **AD-12:** No `type-input` / `type-label` role exists in DESIGN.md — A must not invent one (if we also take Pair 11). B maps labels to `meta` (muted chrome) as the nearest role.

**Incompatible outcome — clashing recipes on one form:**

`body` in `globals.css` sets **family only**, not `type-body` size/weight/lh. A’s select options render at UA ~16px / inherited weight, Manrope. B’s labels render at 0.62rem. Side-by-side in the same sheet: two type systems, both “correct.” A third builder adds `input, button, select { font: inherit }` and thinks that is tag defaults; a fourth adds `@utility type-body` on `<body className="type-body">` which then fights UA headings (Pair 10-adjacent).

There is no DESIGN.md role for field labels. Nearest-role mapping (`meta` vs `body` vs `section-label` uppercase) is unbounded.

**Hole → tighten AD-24 Tag defaults + a DESIGN.md gap flag:**

> `body` applies the **`body` role metrics** (not merely `--font-ui`). Form controls `font: inherit` from `body` unless a money/button role applies. Unmarked `h1`–`h6` are **not** a type API and MUST NOT be left at UA heading metrics when a DESIGN.md role exists (list title → `type-list-title` or TopNav). **Do not invent** `type-label` / `type-input` in architecture; if DESIGN.md lacks a field-label role, use `body` (values) and `meta` (hints) only — document that mapping here so A and B cannot pick differently.

---

### Pair 9 — Second loader that is not `next/font` and not `@import`

| Unit A | **Root layout** — sole `next/font` Manrope + Petrona (`latin`, `display: swap`) |
| Unit B | **PDF comparison / print / Storybook / a route-level `<head>`** — `@font-face` in an SCSS module, or `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`, or `document.fonts.load`, to get `latin-ext` for Spanish amounts / a print-accurate Petrona |

**ADs obeyed (both):**

- **AD-24 Load once:** “`next/font` only at the root layout. … No `@import` fonts, no per-route `next/font`, no family name literals in TSX or SCSS.” B used none of those three. `@font-face` is not `@import`. A `<link>` is not `next/font`. SCSS has no `font-family: Petrona` literal if it uses `local("Petrona")` / `url(...)` inside `@font-face`.
- **AD-24 Prevents:** “a second font loader” — stated, **not** operationalized beyond `@import` / per-route `next/font`.
- **Deferred:** “`next/font` weight/subset/display pins — Loader already exists; tweak at implementation without a new AD.” B cannot edit layout (owned by A’s story) so “tweak” becomes a second loader. i18n convention (EN+ES) pressures `latin-ext`.
- **AD-23:** SCSS for custom the utilities cannot express (font-face loading).

**Incompatible outcome — two owners of font loading:**

Two Petronas, two metric-overrides (`adjustFontFallback` vs `@font-face` `ascent-override`), FOUT vs swap vs block. Spanish glyphs work on B’s PDF pane and tofu on A’s strip. AD-1 is untouched (ui-local) but NFR/i18n is not.

**Hole → tighten AD-24 Load once:**

> Root `next/font` is the **only** font loader in `ui`. Forbidden: `@font-face`, extra font `<link>` / CSS `@import`, `FontFace` API, per-route `next/font`. Subset/weight/display changes (including `latin-ext` for ES) edit the **root layout loader only**.

---

### Pair 10 — Weight 550 token vs Tailwind `font-medium` on `type-button`

| Unit A | **`PrimaryButton`** — `type-button` → `font-weight: var(--type-button-weight)` with token `550` (DESIGN.md ≈550) |
| Unit B | **Feature page button / `type-button font-medium`** — AD-23 “prefer Tailwind utilities”; Tailwind has no 550; `font-medium` (500) is the nearest co-located utility. B also believes “one `type-*` class” plus a **weight** utility is look (AD-12), not a shadow type system (which only named `font-ui`+metrics) |

**ADs obeyed (both):**

- **AD-12:** DESIGN.md button weight ≈550. A is literal. B is the implementable Tailwind approximation (same [ASSUMPTION] as rem calibration).
- **AD-23:** Prefer utilities. `font-medium` is a utility. SCSS `font-weight: 550` would be a role metric — forbidden by AD-24 — so B uses Tailwind, not SCSS.
- **AD-24:** A’s utility reads `--type-*`. B did not compose `font-ui` with metrics. Optional extra class on a primitive is not “screens composing family utilities.”

**Incompatible outcome — clashing recipes:**

CTA on the strip (A) vs CTA on the manual-expense sheet (B): 550 vs 500 (or 600 if B picks `font-semibold`). Cascade: `font-medium` may override `type-button` depending on source order. Same role name, two weights.

**Hole → tighten AD-24 Consume:**

> Role weight is the `--type-*` token (DESIGN.md 550 stays 550; do not round to Tailwind’s 100-step scale in feature TSX). `@utility` sets `font-weight` from the token. Forbidden: adding `font-medium` / `font-semibold` / `font-[550]` on a node that already has `type-*`.

---

### Pair 11 — Frozen AD-24 role list vs invented `type-caption` / skipped `tab`

| Unit A | **AD-24 literalist** — only the ten names in the Rule: `brand`, `list-title`, `strip-who`, `strip-amount`, `section-label`, `body`, `meta`, `amount-inline`, `button`, `tab`. Upload stepper chrome uses `type-meta` |
| Unit B | **AD-12 literalist** — DESIGN.md owns roles; a new EXPERIENCE note needs “caption.” B adds `@utility type-caption` (or skips `type-tab` and styles tabs as `type-button` because both are chrome) |

**ADs obeyed (both):**

- **AD-12 addendum:** “Type *faces and roles* stay in DESIGN.md; type *delivery* is AD-24.” B refuses to treat AD-24’s parenthetical list as a catalog. A treats the list as the closed `@utility` set (“are Tailwind `@utility type-*` classes”).
- **AD-24:** “Do not invent Inter/Roboto.” Inventing a **role** is not forbidden. Skipping a listed role is not forbidden.
- **AD-23:** New `@utility` is Tailwind, not a second stack.

**Incompatible outcome — clashing recipes / two catalogs:**

Tab bar in A is 0.58rem / 500 (`type-tab`). Tab bar in B is 0.66rem / 550 (`type-button`). Caption in B has no token in A’s `:root` sheet (Pair 4). DESIGN.md updates (add/rename a role) do not flow through AD-24’s frozen list. This is the AD-12 inheritance cut: AD-24 quietly re-owns the catalog.

**Hole → tighten AD-24 Consume (catalog rule, not a second list):**

> Each DESIGN.md `typography.*` key has exactly one `@utility type-{key}`. Do not invent roles in architecture or in stories. Do not skip a DESIGN.md role. The names in this AD are a **snapshot**, not a competing catalog. New roles require a DESIGN.md change first (AD-12), then the matching `--type-*` + `@utility`.

---

### Pair 12 — Money that is not a “money role” (tabular nums + face)

| Unit A | **`BalanceStrip` / `ReceiptRow` amount** — `type-strip-amount` / `type-amount-inline` (Petrona + tabular nums per AD-24) |
| Unit B | **Hint, FX audit, split-percent, incomplete disclosure, “₡” in meta** — `type-meta` because DESIGN.md paints those surfaces muted meta; AD-24 only **requires** tabular nums on `strip-amount` and `amount-inline` |

**ADs obeyed (both):**

- **AD-12 / DESIGN.md:** “Amounts use **tabular nums wherever money appears**.” A implements via money roles. B’s copy is a hint/disclosure; the number is incidental. Role is `meta`.
- **AD-24:** “Money roles (`strip-amount`, `amount-inline`) also set tabular nums.” B did not use a money role, so the extra rule does not bind. Using Petrona on a hint would fight “meta is Manrope.”
- **AD-23:** No SCSS metrics.

**Incompatible outcome — clashing recipes for “a number the user came for”:**

Strip ₡42,500 is Petrona tabular. The hint “Includes ₡3,200 unreviewed” is Manrope proportional — different glyph widths, different face, same CRC. EXPERIENCE steal-from-Splitwise (“who owes whom is instantly readable”) vs a second money face in chrome. Both cite the spine.

**Hole → tighten AD-24 (money is a role, not a place):**

> Any **amount** (including FX parentheticals, split totals, disclosure figures) uses `type-amount-inline` or `type-strip-amount` — never `type-meta`/`type-body` for the numeric run. Surrounding copy stays `meta`/`body`. Tabular nums travel with those roles; do not add a third money utility.

---

### Pair 13 — Prop API vs class API vs tag (`or a prop that means that role`)

| Unit A | **`<Copy typeRole="body">` / `<Text variant="body">`** — a generic type primitive so feature TSX “does not set fonts” |
| Unit B | **Page + DESIGN.md primitives** — `<p className="type-body">` or `<Hint>` (baked `type-meta`) |

**ADs obeyed (both):**

- **AD-24:** “or a prop that means that role” — A’s entire library **is** that clause. Prop name unspecified (`role` vs `typeRole` vs `variant` vs `typography`).
- **AD-24:** B’s page adds one `type-*` class; B’s Hint applies the class internally.
- **AD-12:** Component kits may supply unstyled primitives only — A’s `<Text>` is unstyled except type. AD-23: classes co-located.

**Incompatible outcome — three consumption paths:**

Stories import different wrappers. `typeRole="strip-amount"` on `<Text>` bypasses `BalanceStrip` (Pair 3). `variant="hero"` in A maps to `strip-amount`; in a sibling primitive it maps to `amount-inline`. Deferred: “Class-attribute / JSX prop order — house style, never an AD” — that correctly refuses **order**, and accidentally refuses to pin **prop name and whether a generic Text exists**.

**Hole → tighten AD-24 Consume (kill the generic type primitive):**

> There is no product `<Text>` / `<Copy>` type wrapper. Prop form is allowed **only on an existing Soft-Ledger DESIGN.md component** (e.g. a slot that must switch `meta` vs `body`), and the prop **value is the DESIGN.md role key**. Pages use the primitive or one `type-*` class — not a third API.

---

## Summary — Holes and Recommended Closures

| # | Fracture | Units | Close with |
| --- | --- | --- | --- |
| 1 | Two owners of `--font-ui` (loader vs `@theme`) | Root `next/font` vs type-bridge story | **Tighten AD-24** — name `--face-ui` / `--face-brand` vs `--font-ui` / `--font-brand` |
| 2 | Recipe 5-tuple vs DESIGN.md extras | `SectionLabel` vs page `type-section-label` | **Tighten AD-24** — utility includes transform + tabular nums; color stays out |
| 3 | Dual ownership of DESIGN.md components | `BalanceStrip` vs page hero | **Tighten AD-12/24** — primitive mandatory when a component exists |
| 4 | Three recipe registries | `:root --type-*` vs `@utility` literals vs `@theme` | **Tighten AD-23/24** — one registry; `@theme` families only |
| 5 | Shadow system via `font-sans`+metrics | Strip primitives vs feature chrome | **Tighten AD-24 Forbidden** — no kit family utilities; no `type-*`+metric overrides |
| 6 | SCSS vs class vs Georgia fallback | `lists.module.scss` vs migrated primitives | **Tighten AD-24 + Deferred** — no extend; edited type = `type-*`; DESIGN.md fallbacks only |
| 7 | Inline `--type-*` bags vs `type-*` class | 3.5.2 primitives vs new Epic 4 primitive | **Tighten AD-24** — bags forbidden; chore includes them |
| 8 | Tag face-only vs `type-body` metrics | `Select` vs `ManualExpenseForm` | **Tighten AD-24** — `body` gets body recipe; form `inherit`; nearest-role map for fields |
| 9 | Second loader (`@font-face` / `<link>`) | Root layout vs PDF/print/ES pane | **Tighten AD-24 Load once** — only root `next/font` |
| 10 | 550 vs `font-medium` | `PrimaryButton` vs page button | **Tighten AD-24** — token weight wins; no weight utilities on `type-*` |
| 11 | Two role catalogs | Frozen AD-24 list vs DESIGN.md / invented roles | **Tighten AD-24** — snapshot + 1:1 with DESIGN.md |
| 12 | Money face only on two roles | Strip/row vs hint/FX/disclosure | **Tighten AD-24** — any amount run is a money role |
| 13 | Class vs prop vs `<Text>` | Generic type wrapper vs primitives vs pages | **Tighten AD-24** — no generic Text; prop only on DESIGN components |

---

## What AD-24 / AD-12 / AD-23 still get right (do not regress)

- Faces and role **names** belong in DESIGN.md (AD-12). Delivery belongs in architecture. Do not put Petrona/Manrope in the AD as a pick — only as a negative example (tag maps / Inter).
- AD-23’s Tailwind-first + SCSS-custom stack is the right vehicle; AD-24 should **narrow** SCSS for type, not reopen CSS Modules.
- Forbidding `font-ui`+local metrics, tag→face maps that fight list-title-vs-brand, and a second `next/font` are the correct story-level enemies — they are just not fully named in **Forbidden** / **Load once**.
- Not ratifying live inline `fontFamily` is correct. The miss is leaving grandfathering in Deferred without a “do not extend” rule (Pair 6–7).

---

## Recommended next action

Before treating Epic 3.5.2 / 3.5.3 / Epic 4 as parallelizable on type:

1. **Name the two CSS layers** (`--face-*` loader vs `--font-*` theme). Do this in the same change as the `@theme` bridge; do not leave layout.tsx as a second owner of `--font-ui`.
2. **One recipe registry** (`:root --type-*` → `@utility type-*` only). Kill AD-23 “and/or” for **type** (colors may stay variables + `@theme`).
3. **Primitive-mandatory** for DESIGN.md components; `type-*` on raw nodes only when no primitive exists; no generic `<Text>`.
4. **Forbidden list** that a skimming agent will actually grep: `font-sans`/`serif`/`mono`; `type-*`+metric overrides; `--type-*` inline bags; `@font-face` / extra font links; extending SCSS `font-family`.
5. **Grandfather in the Rule**, not only Deferred: remain until chore; do not extend; edited typography = `type-*`.

Until those tightens land, label AD-24 **adopted but not parallelizable**.

---

*Review completed: 2026-08-14*
