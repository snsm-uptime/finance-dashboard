# Rubric Walker Review — Architecture Spine UPDATE 2026-08-14

**Reviewer:** rubric-walker (independent; spine-only)
**Target:** `ARCHITECTURE-SPINE.md` (finance-helper, altitude: feature, status: draft)
**Scope of this pass:** targeted UPDATE adding **AD-24 (type delivery)**. ADs 1–23 treated as already final — re-opened only where AD-24 weakens, contradicts, or leaves a hole beside them.
**Date:** 2026-08-14
**Checklist:** good-spine (reviewer-gate)

## Gate verdict

**pass-with-fixes.** AD-24 is the right invariant: it names the real type-delivery forks (loader, CSS-variable split, role vs family, tag maps, inline bags) and keeps AD-12/AD-23 in force via the AD-12 addendum and a tighter SCSS rule. Two medium sharpens are required before finalize — the grandfathering boundary for existing inline type, and the DESIGN.md role catalog vs a frozen list in AD-24. No critical/high. No AD-24 vs AD-12/AD-23 contradiction that would fail the update.

## Checklist

| # | Test | Result |
| --- | --- | --- |
| 1 | Fixes the real divergence points for the level below and misses none | **Pass with nits.** Loader, theme bridge, role consumption, tag maps, and inline bags are the story-level forks. Residual: Tailwind default `font-sans` / `type-*`+metric overrides are implied by “Feature TSX does not set fonts” / “one `type-*` class” but not named in **Forbidden**. |
| 2 | Every AD’s Rule is enforceable and actually prevents its stated divergence | **Pass for AD-24 with one enforceability gap.** The Prevents list is matched in the Rule except “a second font loader” is only partially operationalized (`@import`, per-route `next/font`; not `@font-face` / extra `<link>`). Inline `fontFamily`, family literals, shared CSS vars, and `font-ui`+local metrics are grep/review-enforceable. |
| 3 | Nothing under Deferred could let two units diverge | **Fix.** “Backfill existing `fontFamily`…” is a valid chore, but “AD-24 binds new work” is too soft: two stories editing the same brownfield file can extend the inline bag vs migrate vs leave it. Other new Deferred rows (aliases, loader pins, class order) do not fork two units. |
| 4 | Named tech is verified-current | **Flag, not a fail.** Stack table still says “Versions verified 2026-08-03”. AD-24 asserts `next/font`, Tailwind `@theme` / `@utility`, `--font-ui` / `--font-brand` with **no 2026-08-14 evidence in the spine**. No new version pins; Next 16.2.x + Tailwind 4.x were already bound. |
| 5 | Ratifies rather than contradicts brownfield | **Intentional non-ratification, documented.** Live `ui` inline `fontFamily` is **not** adopted. That is correct (drift, not a convention) **if** grandfathering is explicit. As written, builders can read AD-24 as “the code is wrong so fix it in this story” **or** “don’t touch existing inlines.” See M1. |
| 6 | If a spec drove it, it covers that spec’s capabilities | **Pass, residual catalog risk.** Capability map row “Type / fonts” + conventions “Type” row land AD-24. Role names are attributed to DESIGN.md (AD-12). This reviewer did not re-read DESIGN.md; the parenthetical role list is treated as a snapshot. If it is a second catalog, it fights AD-12 (M2). |
| 7 | No new AD weakens or contradicts an inherited one (AD-12 / AD-23 must stay in force) | **Pass.** AD-12 addendum still owns faces/roles/look; AD-24 owns delivery only. AD-23 still owns Tailwind+SCSS; AD-24 narrows SCSS to layout/spacing for type (specialization, not override). See inheritance section. |
| 8 | Every dimension this altitude owns is decided, deferred, or an open question | **Pass for the type-delivery slice.** Load, bridge, consume, tag defaults, faces (AD-12), migration, `font-sans` aliases, loader pins, class/prop order are all placed. No silent operational envelope (AD-22 untouched). No new Open Questions section needed. |

ADs 1–23 were not re-scored except for inheritance and Deferred interaction with AD-24.

## Findings

### Critical

None.

### High

None.

### Medium

#### M1 — Deferred migration + “binds new work” lets two stories fork on brownfield files

**Checklist:** Deferred must not let two units diverge; brownfield ratification / grandfathering must be a single rule.

**What’s wrong:** Deferred says “AD-24 binds new work; migration is a chore story, not a second contract.” AD-24 **Forbidden** already bans inline `fontFamily` and SCSS `font-family` with no grandfather clause. Two builders on an existing screen can each be “compliant”:

- leave the inline bag (chore owns it);
- migrate this file while here;
- add another `style={{ fontFamily }}` because “this file already does that.”

The third reading is the divergence AD-24 exists to stop. The first two are process forks until the chore lands.

**Disposition:** **autofix.** One sentence in the AD-24 Rule (and the Deferred row, same meaning):

> Existing inline `fontFamily` / SCSS `font-family` may remain until the backfill chore. Do not add or extend that pattern. Any new or edited typography authoring uses `type-*` (or a Soft-Ledger prop that means that role).

That keeps the chore out of the contract while closing the hole.

#### M2 — Closed role list in AD-24 can fork AD-12’s catalog

**Checklist:** new AD must not weaken an inherited one; spec/companion coverage.

**What’s wrong:** AD-12 addendum: type *faces and roles* stay in DESIGN.md; type *delivery* is AD-24. AD-24 then enumerates ten roles (`brand`, `list-title`, `strip-who`, `strip-amount`, `section-label`, `body`, `meta`, `amount-inline`, `button`, `tab`) as *the* `@utility type-*` set.

That list is useful at story altitude **if** it is a snapshot of DESIGN.md. If it is a second source of truth, a DESIGN.md add/rename and a story that invents `type-caption` vs composing `font-ui`+metrics will diverge, and AD-12 is weakened.

**Disposition:** **autofix.** Keep the names as the current DESIGN.md set; make the invariant the naming rule, not a frozen catalog:

> Each DESIGN.md type role has a matching `@utility type-{role}` (current set: …). Do not invent roles here; do not skip a DESIGN.md role.

Money-role tabular-nums can stay as a delivery rule on `strip-amount` / `amount-inline`.

### Low

#### L1 — Shadow type system not fully named in Forbidden

**Checklist:** Rule must prevent the stated divergence (`font-ui`+local metrics as a shadow type system).

**What’s wrong:** The Rule forbids composing `font-ui` / `font-brand` with local size/weight/tracking, and says feature TSX “adds one `type-*` class.” It does **not** name:

- Tailwind default `font-sans` / `font-serif` / `font-mono` on feature TSX (especially after “do not alias them to product faces” — they remain the kit stack and are an easy AD-23 “co-located utility”);
- `type-*` plus local `text-*` / `font-*` / `tracking-*` / `leading-*` overrides (same shadow system, different left-hand class).

A strict reading of “Feature TSX does not set fonts” / “one `type-*` class” already bans both. Builders skim **Forbidden**.

**Disposition:** **autofix.** Extend **Forbidden** with those two bullets. Optional: “do not override a `type-*` recipe with metric utilities.”

#### L2 — “Second font loader” is under-specified in the Rule

**Checklist:** Rule must actually prevent its stated divergence.

**What’s wrong:** **Prevents** includes “a second font loader.” **Rule** bans `@import` fonts and per-route `next/font`, and says load once at root layout. A global `@font-face` or extra `<link rel="stylesheet">` font stylesheet can still satisfy a skim-read of the Rule.

**Disposition:** **autofix.** One clause under **Load once:** no `@font-face`, no extra font stylesheets, no second loader of any kind. Root `next/font` is the only loader.

#### L3 — Named type-delivery tech has no in-spine verification dated 2026-08-14

**Checklist:** named tech is verified-current; flag assertions without evidence in the spine.

**What’s wrong:** Stack header: “Versions verified 2026-08-03 (`stack-options.md` + gate re-check).” AD-24 (2026-08-14) names `next/font`, `@theme`, `@utility`, `--font-ui` / `--font-brand` without a new version row or a re-check date. This reviewer did not fetch the web; the spine itself supplies no 2026-08-14 evidence.

Not a stack fail: no new pins, and Tailwind 4.x / Next 16.2.x already cover those APIs.

**Disposition:** **discuss** (optional). Either leave it (mechanisms, not versions) or add a one-liner that type delivery assumes Tailwind 4 `@theme`/`@utility` + Next 16 `next/font` as already pinned. Do not invent new version numbers without a check.

### Informational (not defects)

- **Brownfield inline `fontFamily`:** AD-24 correctly refuses to ratify it. Documented as a chore, not a second type contract. Becomes a defect only if M1 is left fuzzy.
- **`font-sans` / `font-serif` aliases in Deferred:** Decision already lives in the AD-24 Rule (“do not also alias”). Deferred row is a “don’t later promote this to an AD” marker, not an open fork. Good.
- **`next/font` weight/subset/display pins in Deferred:** Single loader at root — two feature units cannot pick different pins. Safe to defer.
- **Class-attribute / JSX prop order in Deferred:** Correctly pushed to house style / linter. Not an AD.
- **“or a prop that means that role”:** Needed so Soft-Ledger can hide the class. Low impersonation risk if M2’s role set stays DESIGN.md-owned. No extra AD.
- **Capability map + conventions:** Type row and “Type / fonts” capability row cite AD-24, AD-12, AD-23 together. Tailwind stack cell now lists AD-24. Cross-links are complete.
- **Diagram:** Loader → loaded-face vars → `@theme` → `type-*`, with `--type-*` tokens feeding roles and family-only from theme, matches the Rule (including the CSS-variable split).

## AD-24 vs AD-12 / AD-23 (inheritance)

**AD-12 still in force.** Appearance, IA, Warm Balance / Soft-Ledger remain companion-owned. Architecture still does not pick faces (Petrona/Manrope appear only as negative examples of tag maps). Component kits still must not become brand. The Epic 3.5 addendum now splits type *faces/roles* (DESIGN.md) from type *delivery* (AD-24) — that is the correct seam. M2 is the only place AD-24 could quietly take catalog ownership back.

**AD-23 still in force.** Tailwind utilities co-located + SCSS modules for custom that utilities cannot express; no new `*.module.css`; no kit palettes; no re-picking hexes. AD-24 does not reopen the styling stack. It **narrows** SCSS for typography (“layout/spacing only — no `font-family` and no role metrics”), which prevents using AD-23’s SCSS escape hatch as a shadow type system. That is specialization, not a local override. `font-ui` / `font-brand` as theme bridge, with screens forbidden to compose them, stops AD-23 “co-located utilities” from becoming the type API.

**AD-1** (ui → HTTP only) untouched. Type delivery is ui-local.

No other AD-1–23 Rule is relaxed, superseded, or given an exception except the intentional brownfield grandfather in Deferred (M1).

## Dimensions (type-delivery slice)

| Dimension | Placement |
| --- | --- |
| Font load | Decided — `next/font` once at root layout |
| CSS-variable split (loader vs theme) | Decided |
| Tailwind theme keys / product names | Decided — `--font-ui` / `--font-brand`; no `font-sans` alias |
| Screen consumption API | Decided — `@utility type-*` roles; primitives apply internally |
| Tag → face map | Decided — not the API; unmarked body/controls inherit UI face |
| Faces, fallbacks, role catalog | AD-12 / DESIGN.md (M2: don’t freeze a fork in AD-24) |
| Money tabular nums | Decided on money roles |
| Existing inline / SCSS families | Deferred as chore — **needs M1 sharpen** |
| Loader weight/subset/display | Deferred (single file) |
| Class/prop order | Deferred to house style |
| Dark-mode faces | Silent; inherited from DESIGN.md token sets + Appearance convention — acceptable |
| Email / non-`ui` typography | Out of bind (“all `ui` typography”) — correct |

Operational/environmental envelope remains AD-22. This update does not skip a whole altitude dimension.

## What AD-24 gets right (do not regress)

- Prevents the actual story-level forks: per-file families, inline bags, tag maps that fight DESIGN.md, shared CSS vars between `next/font` and `@theme`, a second loader, `font-ui`+metrics as a parallel type system.
- Does not re-pick faces or hexes (AD-12/AD-23 stay the look).
- Soft-Ledger primitives vs one `type-*` on non-primitives is a clear unit-of-work rule.
- Capability map, conventions table, AD-12 addendum, and Tailwind stack cell all point at the same contract.
- Explicitly does **not** ratify live inline `fontFamily`; migration is a chore, not a second AD.

## Disposition summary

| ID | Severity | Action |
| --- | --- | --- |
| M1 | Medium | **Autofix** — grandfather existing inline; forbid extending it; new/edited type authoring = `type-*` |
| M2 | Medium | **Autofix** — DESIGN.md owns the role set; AD-24 owns `type-{role}` delivery |
| L1 | Low | **Autofix** — name `font-sans`/`serif`/`mono` and `type-*`+metric overrides in Forbidden |
| L2 | Low | **Autofix** — name `@font-face` / extra font stylesheets under Load once |
| L3 | Low | **Discuss** — optional verification note; no new pins without a check |

Apply M1 and M2 before setting `status: final`. L1/L2 are cheap and should ride along. L3 is not blocking.
