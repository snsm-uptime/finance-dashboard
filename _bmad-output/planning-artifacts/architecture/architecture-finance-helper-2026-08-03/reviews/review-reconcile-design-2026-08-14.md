---
title: "Reconcile DESIGN.md typography → AD-24 type delivery"
reviewed: 2026-08-14
input: ux-designs/ux-finance-helper-2026-08-03/DESIGN.md
spine: architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
focus: DESIGN.md Typography (faces, ten roles, tabular nums, fallbacks) vs AD-12, AD-23, AD-24
---

# DESIGN.md Typography ↔ AD-24 Reconciliation

**Question:** This spine update binds *how* type is delivered, not which faces to pick. What in DESIGN.md typography did not land in AD-24 — especially a quiet requirement (tone or constraint) the AD structure dropped?

---

## Verdict

**Aligned on delivery split and the ten roles; no face re-pick; no h1→Petrona contradiction.**

AD-12 keeps faces and roles in DESIGN.md. AD-23 still owns Tailwind-vs-SCSS. AD-24 binds loader → `@theme` product names → `@utility type-*` consumption and forbids tag→face maps that would fight DESIGN.md.

All ten DESIGN.md type roles are named in AD-24. Inter/Roboto-as-brand is forbidden. Tabular nums are attached to the two money roles. Fallbacks are pointed at DESIGN.md rather than restated.

What the AD structure **dropped** is DESIGN.md’s **type manner**, not the role list: tabular nums as a *wherever money appears* rule (narrowed to two utilities), and the Soft-Ledger case/weight register (who-line sentence case; section-label uppercase; medium-light 400–550, not Canonical 650–700). Those sit outside AD-24’s recipe of face + size + weight + tracking + line-height.

**No AD-24 rule contradicts DESIGN.md.** The `h1`→Petrona example does not occur; AD-24 forbids that map.

---

## Partition (what this update was allowed to bind)

| Concern | Owner after this update | Status |
| --- | --- | --- |
| Which faces (Petrona / Manrope) | DESIGN.md via AD-12 | Not re-opened — correct |
| Ten type roles + per-role metrics | DESIGN.md tokens; AD-24 names the roles as the consumption API | Landed |
| Tailwind vs SCSS | AD-23 | Unchanged — correct |
| How faces load and are consumed | AD-24 | In scope |
| Kit defaults as brand | AD-12 + AD-23 Forbidden | Unchanged |

AD-12 addendum: “Type *faces and roles* stay in DESIGN.md; type *delivery* is AD-24.” AD-23 does not name faces or roles. No partition leak.

---

## Type roles — DESIGN.md vs AD-24

DESIGN.md Typography table and YAML `typography:` keys (ten roles):

| DESIGN.md role | Token | Face in DESIGN.md | In AD-24 `type-*` list |
| --- | --- | --- | --- |
| Wordmark / brand chrome | `brand` | Petrona | Yes |
| List title (nav) | `list-title` | Manrope | Yes |
| Strip who-line | `strip-who` | Manrope | Yes |
| Strip amount | `strip-amount` | Petrona | Yes |
| Section label | `section-label` | Manrope | Yes |
| Body / receipt title | `body` | Manrope | Yes |
| Meta / hint / when | `meta` | Manrope | Yes |
| Inline amount | `amount-inline` | Petrona | Yes |
| Button | `button` | Manrope | Yes |
| Tab | `tab` | Manrope | Yes |

**None of the ten roles are missing from AD-24.**

AD-24 Prevents also restates the load-bearing face split without re-picking families: list title is **UI** face; money/wordmark are **brand** face. That matches DESIGN.md (list title = Manrope; brand / strip-amount / amount-inline = Petrona).

---

## Face / fallback / tabular-nums constraints

### Faces (locked in DESIGN.md)

| DESIGN.md constraint | AD-24 | Landed? |
| --- | --- | --- |
| Petrona = brand wordmark, strip amounts, inline money | Product names `--font-brand` / `font-brand`; role list implies money+wordmark use brand face; Petrona named only in the *negative* tag example | **By reference** (AD-12), not restated as load targets |
| Manrope = UI chrome, who-line, body, buttons, tabs | `--font-ui` / `font-ui`; unmarked `body` inherits UI face | **By reference** |
| Do **not** substitute Inter or Roboto as brand type | Forbidden: “inventing Inter/Roboto or any face not in DESIGN.md” | **Yes** |

Not naming Petrona/Manrope as the chosen load is **intentional** (bind delivery, don’t re-pick faces). A builder who reads AD-24 alone still cannot invent Inter/Roboto, but must open DESIGN.md to know *which* two families `next/font` loads. That is the AD-12 contract, not a miss of the delivery AD — unless implementers treat AD-24 as a self-contained font spec.

### Fallbacks

| DESIGN.md | AD-24 | Landed? |
| --- | --- | --- |
| Petrona → `'Times New Roman', serif` | “loaded faces plus DESIGN.md fallbacks” | **Pointer only** — stacks not enumerated |
| Manrope → `system-ui, sans-serif` | Same clause | **Pointer only** |

The constraint is not contradicted and not deleted. It is also not mechanically in the AD: two units could attach different generic fallbacks and still satisfy AD-24’s wording if they never open DESIGN.md. Quiet drop relative to a delivery AD that already says fallbacks belong on the `@theme` bridge.

### Tabular nums

| DESIGN.md | AD-24 | Landed? |
| --- | --- | --- |
| “Amounts use **tabular nums wherever money appears**” | “Money roles (`strip-amount`, `amount-inline`) also set tabular nums” | **Narrowed** |

If every money glyph goes through those two roles, the DESIGN.md rule is operationalized. AD-24 also forbids impersonating a role with `font-brand` + local metrics, which pushes money onto the money utilities.

The **quiet requirement** the AD structure dropped: tabular nums is a *money-rendering manner*, not a property of two class names. DESIGN.md also stamps tabular on receipt-row amounts in Components (“weight 500 tabular”) without requiring the reader to remember `amount-inline`. Lists homepage balances are money too. AD-24 does not say: money outside `type-strip-amount` / `type-amount-inline` is still tabular (or is a contract violation). Two primitives could set a total in `type-body` or unmarked text and pass AD-24 while breaking DESIGN.md.

DESIGN.md YAML tokens do **not** include `fontVariantNumeric`. AD-24 is the first spine artifact that *places* tabular nums on the delivery surface — good — but only on those two roles.

---

## Quiet requirements the AD structure dropped

These are DESIGN.md type *manner* (tone/constraint), not extra roles. AD-24’s utility recipe is explicitly “face + size + weight + tracking + line-height.” That list is the drop.

### 1. Soft-Ledger weight register (tone) — **dropped**

DESIGN.md: medium-light weights **≈400–550**, not Canonical Ledger Strip **650–700** register bold. Who-line/buttons live at 500/550; body at 400.

AD-24 applies whatever weight the `--type-*` tokens already carry, and forbids composing local weight on `font-ui` / `font-brand`. It never says “do not ship 650–700 as UI register.” A `type-button` implemented as `font-bold` (700) plus DESIGN.md size would still look like a role class and would violate the locked manner.

This is the quietest miss: a **feel** constraint the role table assumes and the AD recipe does not bind.

### 2. Who-line sentence case — **dropped**

DESIGN.md: strip who-line is **sentence case**, not uppercase tracked caps. That is how Soft-Ledger differs from Canonical register labels.

AD-24 lists `strip-who` as a `type-*` role and includes tracking in the recipe. It does not mention case. Sentence case is partly copy, but DESIGN.md treats it as type manner. Nothing in AD-24 prevents `type-strip-who` from shipping `uppercase` + tracking (Canonical), which would be a visual regression AD-12 would still “own” only if builders re-read DESIGN.md.

### 3. Section-label uppercase — **partial / recipe hole**

DESIGN.md role notes: section-label is **uppercase + tracking**. YAML `components.section-label` sets `text-transform: uppercase`; the typography token itself does not.

AD-24 recipe omits `text-transform`. Tracking can land on `type-section-label`; uppercase can be left on the primitive or forgotten. Two units can split: one bakes uppercase into the utility, one relies on the component token. That is exactly the divergence AD-24 exists to stop for face/size/weight.

### 4. Relative hierarchy (amount ≫ who ≫ row) — **not in AD-24**

DESIGN.md [ASSUMPTION]: rem sizes may be calibrated; **preserve relative hierarchy**. Delivery AD does not bind hierarchy — acceptable (metrics stay in DESIGN.md) — but it is another manner line implementers will not get from AD-24.

---

## Contradictions (AD-24 vs DESIGN.md)

**None.**

| Probe | DESIGN.md | AD-24 | Result |
| --- | --- | --- | --- |
| Map `h1` → Petrona | List title / body hierarchy is **Manrope**. Petrona is wordmark + money only. Headings are not a face API. | “Tags are **not** the type API — do **not** map `h1`→Petrona / `p`→Manrope.” | **Aligned** (forbids the bad map) |
| Unmarked `body` / form controls | Manrope is the UI face, including body | Inherit UI face | **Aligned** |
| List title face | Manrope (`list-title`) | Prevents tag→face maps that fight DESIGN.md; “list title is UI face” | **Aligned** |
| Money / wordmark face | Petrona | “money/wordmark are brand face” | **Aligned** |
| `font-sans` / `font-serif` aliases | Not in DESIGN.md (families are Petrona/Manrope + fallbacks) | Do not alias `font-sans` / `font-serif` to the same faces | **Compatible** — avoids a second name, does not rename DESIGN.md faces |
| Inter / Roboto | Do not substitute as brand | Forbidden | **Aligned** |

AD-24’s Petrona/Manrope mention is a **negative example**, not a positive HTML-tag map. It does not assign `h1` to Petrona.

AD-23 has no type-face rule. No Tailwind-vs-SCSS clash with DESIGN.md typography.

---

## What landed well (delivery, as intended)

- Single `next/font` at root layout; no per-route loader; no family literals in TSX/SCSS.
- `@theme --font-ui` / `--font-brand` as product names, fallbacks from DESIGN.md, no `font-sans`/`font-serif` double name.
- Ten roles consumed as `@utility type-*` full recipes from `--type-*` tokens — screens do not restyle families locally.
- Soft-Ledger primitives own the role class; non-primitives add one `type-*` (or a prop that means that role).
- Money roles additionally set tabular nums (partial encoding of the DESIGN.md money manner).
- Inter/Roboto (and any face not in DESIGN.md) forbidden.
- Explicit anti-pattern: HTML tags are not the type API; do not map `h1`→Petrona.
- Existing inline `fontFamily` / SCSS `font-family` called out as chore-story migration, not a second contract.

---

## Recommendations (only if the spine is tightened)

1. **Keep faces out of AD-24** — do not add “load Petrona/Manrope” as a new pick. If a one-line pointer is needed: “loaded families are DESIGN.md’s two faces (brand / UI), with DESIGN.md fallback stacks on the `@theme` bridge.”
2. **Restore the money manner in one clause:** tabular nums on every money glyph — money roles must set it; money must not appear on a non-money `type-*`.
3. **Extend the `type-*` recipe** with the DESIGN.md manner the tokens already imply: `font-variant-numeric` on money roles; `text-transform` where the role specifies it (section-label uppercase; strip-who **not** uppercase); weights stay inside ≈400–550 (no Canonical 650–700 register).

None of these are required to conclude the reconcile: the update did its job on *how* type is delivered. The miss is manner, not roles, and not a contradictory face map.

---

## Files reviewed

| File | Role |
| --- | --- |
| `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` | Typography section + YAML `typography:` + related component type notes |
| `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` | AD-12 (incl. Epic 3.5 addendum), AD-23, AD-24, Consistency / Deferred type rows |
