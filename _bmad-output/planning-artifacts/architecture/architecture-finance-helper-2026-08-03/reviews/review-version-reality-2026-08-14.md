# Version / tech-reality review — AD-24 (2026-08-14)

**Reviewer:** parent (version-reality subagent interrupted; check completed inline from the same sources)
**Date:** 2026-08-14

## Verdict

**Pass.** AD-24 binds mechanisms already covered by existing pins (Next.js 16.2.x, Tailwind CSS 4.x). No new version rows. APIs exist and fit.

## Checks

| Named tech | Evidence | Fit |
| --- | --- | --- |
| Tailwind v4 `@theme --font-*` → `font-*` utilities | [tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme) and [font-family](https://tailwindcss.com/docs/font-family) (fetched 2026-08-14) | `--font-ui` / `--font-brand` in `@theme` generate `font-ui` / `font-brand`. Product names are valid `--font-*` keys. |
| Tailwind v4 `@utility` | Same Tailwind v4 CSS-first docs (2026-08-14) | Custom `type-*` classes participate in variants. Correct vehicle for DESIGN.md role recipes. |
| `next/font` (google) | Live `ui/app/layout.tsx` already loads Manrope + Petrona; Next 16.2.x already pinned | Loader is brownfield-real. AD-24 renames its CSS vars to `--face-*` so they do not collide with `@theme --font-*`. |
| Stack pins | Unchanged from 2026-08-03 table | No new pins invented. Spine now notes the 2026-08-14 re-check. |

## Findings

None blocking. Live layout still uses `--font-ui` / `--font-brand` as `next/font` variables — AD-24 now requires renaming those in the same change as the `@theme` bridge (not a version issue).

## Disposition

No stack-table edits beyond the 2026-08-14 re-check sentence already in the spine.
