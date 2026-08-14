---
title: 'IconButton fill-container via FormIconSubmit'
type: 'feature'
created: '2026-08-13'
status: 'draft'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `IconButton` and `FormIconSubmit` are parallel `<button>` implementations. The desktop manual-expense save is a 2.5rem square hugged to the end of the side pane, so it cannot span the pane width.

**Approach:** Add an opt-in fill-container (auto width) mode on `IconButton`. Render `FormIconSubmit` as that primitive so form saves inherit layout from the smaller control. Use `fill` only on the desktop inline save in `ManualExpenseForm`.

## Boundaries & Constraints

**Always:**
- Default `IconButton` (no `fill`) stays a compact ghost control: `type="button"`, no border, transparent, `flex-shrink-0`. Sheet close and ShareTitleButton must not change size or look.
- `FormIconSubmit` keeps bordered surface chrome, accent glyph, and ~2.5rem height. `fill` changes width only.
- `FormIconSubmit` renders `IconButton` (not a second native button) and forwards `type`, `label`, `disabled`, `onClick`, `className`, `fill`, and remaining button attrs.
- Desktop inline save (`ManualExpenseForm` when `formRef` is omitted) is the only call site that passes `fill`.
- Disabled/enabled gating (`canSubmit`) is unchanged.

**Ask First:**
- Restyling `IconButton` default chrome (padding, ghost background, `type`) to make composition easier.
- Passing `fill` to TemporalNavigation, ListDetailMobileActions, or any other `FormIconSubmit`.
- Introducing a new IconButton visual variant (e.g. surface) if className overrides cannot make form chrome win.

**Never:**
- Touch `FormIconField` suffix markup (InviteForm).
- Stretch mobile Sheet corner saves or TemporalNavigation header saves.
- Change default IconButton width/height for existing callers.
- Recompute settle/FX in the UI; this is layout-only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default IconButton | no `fill` | Compact ghost button; does not stretch | N/A |
| Filled IconButton | `fill` + parent with defined width | Button width ≈ 100% of parent | N/A |
| Compact FormIconSubmit | no `fill` (nav / Sheet corners) | Still ~2.5rem bordered save/send | N/A |
| Desktop expense save | `!formRef`, `fill` | Save spans form/sidebar content width | N/A |
| Mobile expense | `formRef` set | No inline submit; Sheet corner stays compact | N/A |
| Submit gate | amount+description empty vs filled | Save disabled vs enabled unchanged | N/A |

</frozen-after-approval>

## Code Map

- `ui/components/IconButton/IconButton.tsx` -- add opt-in `fill`; keep ghost defaults
- `ui/components/IconButton/IconButton.module.scss` -- hover/focus stay here; do not duplicate in FormIconSubmit unless chrome-specific
- `ui/components/FormIconSubmit/FormIconSubmit.tsx` -- compose IconButton; pass `fill` through; keep save/send glyph + form chrome classes
- `ui/components/FormIconSubmit/FormIconSubmit.module.scss` -- bordered/surface hover; must win over IconButton ghost utilities when composed
- `ui/app/lists/ManualExpenseForm.tsx` -- pass `fill` on inline `FormIconSubmit` only
- `ui/app/lists/ManualExpenseForm.module.scss` -- `.submitRow` currently `justify-content: flex-end`; a full-width child will not span until the row stretches (e.g. drop flex-end / `width: 100%`)
- `ui/app/lists/Sheet.tsx` / `ui/app/lists/ShareTitleButton.tsx` -- IconButton callers; regression surface only
- `ui/app/lists/TemporalNavigation.tsx` / `ui/app/lists/ListDetailMobileActions.tsx` -- compact FormIconSubmit; do not pass `fill`
- `ui/app/lists/ManualExpenseForm.test.tsx` -- existing submit-gate test; extend for fill vs formRef
- `ui/components/IconButton/` -- no tests today; add coverage for default vs `fill`

## Tasks & Acceptance

**Execution:**
- [ ] `ui/components/IconButton/IconButton.tsx` -- add `fill?: boolean` (default false). When true: `w-full min-w-0`, neutralize `flex-shrink-0` / hugging `inline-flex`. Default path unchanged.
- [ ] `ui/components/IconButton/IconButton.test.tsx` -- cover default compact vs `fill` stretching in a width-constrained parent; `type` remains overridable via rest (submit).
- [ ] `ui/components/FormIconSubmit/FormIconSubmit.tsx` -- render `IconButton` with `IconGlyph`, forward `fill` + form chrome `className`. Do not rewrite `FormIconField`.
- [ ] `ui/app/lists/ManualExpenseForm.tsx` + `ManualExpenseForm.module.scss` -- pass `fill` on the `!formRef` save; make `.submitRow` allow a full-width child to span the pane.
- [ ] `ui/app/lists/ManualExpenseForm.test.tsx` -- assert desktop inline save present without `formRef`; omitted with `formRef`; `canSubmit` gate still works.

**Acceptance Criteria:**
- Given IconButton without `fill`, when rendered as today, then size, type, and ghost chrome are unchanged.
- Given IconButton with `fill` inside a parent of known width, when it renders, then its used width matches the parent (minus the parent's padding only).
- Given FormIconSubmit without `fill`, when used in TemporalNavigation or ListDetailMobileActions, then it stays a ~2.5rem bordered icon.
- Given ManualExpenseForm without `formRef`, when the inline save renders, then that control spans the side-pane form content width.
- Given ManualExpenseForm with `formRef`, when the form renders, then there is no inline save.
- Given empty vs filled amount+description, when the desktop save is shown, then disabled/enabled matches `canSubmit`.

## Design Notes

`fill` is layout-only. Form chrome (border, `--surface`, accent glyph, 2.5rem height) stays on `FormIconSubmit` via `className`. Ghost utilities on `IconButton` (`border-0`, `bg-transparent`) must not defeat that chrome — if Tailwind source order cannot make form classes win, stop and use Ask First rather than inventing a new visual variant unprompted.

`.submitRow { justify-content: flex-end }` will keep even a `w-full` button from looking full-pane unless the row itself stretches.

```tsx
<FormIconSubmit
  type="submit"
  variant="save"
  fill
  label={...}
  disabled={!canSubmit}
/>
```

## Verification

**Commands:**
- `cd ui && npx vitest run components/IconButton/IconButton.test.tsx app/lists/ManualExpenseForm.test.tsx` -- expected: pass
- `cd ui && npm run typecheck` -- expected: no errors
- `cd ui && npm run lint` -- expected: no new errors in touched files

**Manual checks (if no CLI):**
- Desktop list detail sidebar: manual-expense save is a full-width ~2.5rem-tall bar, not a trailing 2.5rem square.
- Mobile sheet: expense/split corner saves stay compact; no duplicate inline save.
- Sheet close and share-title IconButtons unchanged.
