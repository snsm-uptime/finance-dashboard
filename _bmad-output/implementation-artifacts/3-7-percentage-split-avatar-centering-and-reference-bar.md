---
baseline_commit: 743300b
---

# Story 3.7: Percentage split track — centered avatars + default-position reference bar

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user adjusting a percentage split,
I want each member's avatar centered under its own segment, and a muted bar showing where the list's default split originally was,
So that I can see how far I've moved from the default at a glance.

## Acceptance Criteria

1. **Given** `PercentageSplitTrack.tsx` renders member avatars below the track
   **When** it lays them out
   **Then** each avatar is horizontally centered relative to the width of its own segment's div, not left-aligned within a flex row

2. **Given** a member's percentage differs from the list's current default split (Story 2.5/2.6 default)
   **When** the track renders
   **Then** a muted bar renders at the position corresponding to the original default split, as a visual reference against the current custom position

3. **Given** a member's percentage equals the list default
   **When** the track renders
   **Then** no muted reference bar is shown for that segment (nothing to contrast against)

4. **Given** this is a UI-only refinement
   **When** implemented
   **Then** no changes to FR-9/FR-10, the split-sum-to-100 validation, or `orderPercentageSplitUserIds` ordering logic

## Amendment context

This story was appended 2026-09-02 as a UI polish addendum (Sprint Change Proposal 2026-09-02, `epics.md` line 918). It does **not** reopen Story 3.1–3.6 acceptance criteria. Epic 3 is already `done` in sprint tracking; this story lands on top of it as a follow-on refinement, same as Epic 3.5's later addition. There is no `epic-3` status transition to make (only the first story in an epic auto-flips it to `in-progress`, and Epic 3 already completed its retrospective).

## Prerequisites

Before starting, verify these are true in the live codebase (all shipped already, per Stories 2.5, 2.6, 3.1–3.6):

- [x] `ui/app/lists/PercentageSplitTrack.tsx` exists and renders segments (`.sliderSegment`, one per member, `width: ${percent}%`) and a separate `.sliderLabels` row containing one `<Avatar>` per member (`ui/components/Avatar.tsx`).
- [x] `ui/app/lists/PercentageSplitTrack.module.scss` is the co-located stylesheet (SCSS module — allowed per AD-23 since Tailwind utilities alone cannot express the dynamic per-member width math needed here).
- [x] `ui/app/lists/ManualExpenseForm.tsx` already computes `percentMapFromDefault(members, effectiveSplit)` (line ~74) to seed the *initial* percentages from the list's default split (`DefaultSplitPayload` from `listsClient.ts`, shape `{ mode, member_ids, shares: [{ user_id, percentage }] }`).
- [x] `ui/app/lists/DefaultSplitPanel.tsx` also renders `<PercentageSplitTrack>`, but there the user is editing the default itself — there is no separate "list default" to diff against in that context.

If any of these don't match, stop and re-read the live files before proceeding — this story's task text describes the current shape as observed 2026-09-02; do not assume other paths/names.

## Tasks / Subtasks

- [x] Task 0: Confirm hard prerequisites
  - [x] **Branch:** `feat/3/3-7-percentage-split-avatar-centering-and-reference-bar` (already checked out from `main` @ `baseline_commit` 743300b per repo state). One story per branch (AD-13).
  - [x] **Mandatory reads:** this story · `project-context.md` (esp. "Verified Soft-Ledger UI conventions" section — real token names, SCSS module allowance, no barrel file) · `ui/app/lists/PercentageSplitTrack.tsx` (full file, read below) · `ui/app/lists/PercentageSplitTrack.module.scss` (full file, read below) · `ui/app/lists/PercentageSplitTrack.test.tsx` (existing test pattern: jsdom + `react-dom/client` + a `Proxy`-based `.module.scss` mock) · `ui/app/lists/ManualExpenseForm.tsx` lines 55–162 (`evenPercentMap`, `percentMapFromDefault`, `percentMapsEqual`, and how `effectiveSplit`/`percentages` state are wired) · `ui/app/lists/DefaultSplitPanel.tsx` (second, distinct call site — no default-diff needed there).
  - [x] **Current state of `PercentageSplitTrack.tsx` (read in full during Step 2 of this workflow, summarized here):**
    - Renders `orderedUserIds` (via `orderPercentageSplitUserIds` — **do not touch this ordering helper**, AC #4) as `.sliderSegment` divs inside `.sliderTrack`, each `width: ${percentValues[i]}%` (min 1%).
    - Drag handles are separate absolutely-positioned `.sliderHandle` divs between segments — untouched by this story.
    - Below the track, a **separate** `.sliderLabels` flex row (`display: flex; gap: 0`) renders one `.sliderLabel` div per member (`flex: 1; text-align: center` in the SCSS), each containing an `<Avatar size="xs">`. Because `.sliderLabel` uses `flex: 1` (equal share for every member) while `.sliderSegment` uses `width: ${percent}%` (proportional to that member's percent), **the avatar row and the segment row use two different sizing models** — an avatar only lines up under its segment when all segments happen to be equal width. This is the bug AC #1 fixes.
    - `Props` type currently: `{ userIds, currentUserId, members, percents, onChangePercents, disabled? }`. **No `defaultPercents` prop exists yet** — this story adds one (optional, so both call sites keep compiling without changes where a reference bar doesn't apply).
  - [x] **Scope — In:**
    - Fix avatar-row layout so each avatar centers under its own segment's actual rendered width (AC #1) — replace the equal-flex `.sliderLabels`/`.sliderLabel` sizing with per-member widths matching `percentValues[i]` (mirroring `.sliderSegment`'s `width: ${percent}%` approach), or an equivalent CSS technique (e.g. `display: grid` with `grid-template-columns` built from the same percent values) — pick whichever keeps the existing DOM/test structure (`.sliderLabels` / `.sliderLabel` class names) intact so `PercentageSplitTrack.test.tsx`'s existing `querySelectorAll(".sliderLabel")` assertions keep working.
    - Add an optional `defaultPercents?: Record<string, string>` prop to `PercentageSplitTrack`. When provided, render a second, visually distinct **muted** bar per segment at the x-position corresponding to that member's default-split percentage, but only where `Number(defaultPercents[userId]) !== Number(percents[userId])` (AC #2/#3).
    - Wire `ManualExpenseForm.tsx`'s existing `PercentageSplitTrack` usage (line ~436) to pass `defaultPercents={percentMapFromDefault(members, effectiveSplit)}` (reuse the function that already exists at line 74 — do not duplicate its logic).
    - Add/extend tests in `PercentageSplitTrack.test.tsx` for both AC #1 (avatar centering) and AC #2/#3 (reference bar shown/hidden).
  - [x] **Scope — Out:**
    - `DefaultSplitPanel.tsx`'s call site: do **not** pass `defaultPercents` there — the user is editing the default itself in that view, so there is nothing to diff against (per this story's own Story Summary framing). Leaving the prop `undefined` there is correct, not an oversight.
    - No changes to `orderPercentageSplitUserIds` (AC #4), the split-sum-to-100 validation in `DefaultSplitPanel.tsx`/`ManualExpenseForm.tsx`, drag/keyboard handle interaction logic, or FR-9/FR-10 domain behavior.
    - No new i18n copy — this is a purely visual reference element; if any `aria-label`/`aria-valuetext` needs a word, prefer reusing existing message keys or a static, non-user-facing internal label rather than inventing a new i18n domain key for one word (confirm with the "Files Modified" table below whether `lists.ts` needs a touch at all — likely not).

- [x] Task 1: Fix avatar-row centering (AC #1)
  - [x] Replace `.sliderLabels`'s `display: flex` / `.sliderLabel { flex: 1 }` sizing in `PercentageSplitTrack.module.scss` with a model that gives each `.sliderLabel` the **same width** as its corresponding `.sliderSegment` (`${Math.max(percentValues[i], 1)}%`), then center the `<Avatar>` within that width (`display: flex; justify-content: center` on `.sliderLabel`, width set inline via `style` from the component the same way `.sliderSegment` already does it).
  - [x] In `PercentageSplitTrack.tsx`, change the `.sliderLabels` map (around line 254) to set `style={{ width: `${Math.max(percentValues[i], 1)}%` }}` on each `.sliderLabel`, mirroring the segment loop above it exactly (same `Math.max(..., 1)` floor, so a near-zero segment's avatar isn't crushed to 0 width).
  - [x] Verify visually (or via test bounding-box math, since jsdom has no real layout engine — see Task 3) that segment width and label width use the identical formula, so they always agree even as percents change via drag.

- [x] Task 2: Add default-split reference bar (AC #2/#3)
  - [x] Extend `Props` in `PercentageSplitTrack.tsx`: `defaultPercents?: Record<string, string>`.
  - [x] Compute a `defaultPercentValues` array the same way `percentValues` is computed (`orderedUserIds.map((id) => Number(defaultPercents?.[id]) || 0)`), only when `defaultPercents` is provided.
  - [x] For each segment `i`, if `defaultPercents` is provided **and** `Math.round(defaultPercentValues[i]) !== Math.round(percentValues[i])`, render a muted reference bar positioned at that member's **absolute track position** (same `leftSum` math already used for `.sliderHandle` positioning, i.e. cumulative sum of default percents up to and including member `i`, converted to `left: %` on the track) — not at the segment's own local origin, so the bar reads as "where the boundary used to be" on the same coordinate system as the drag handles.
  - [x] Style the reference bar as clearly `muted`/secondary vs. the `--accent` drag handles — reuse the existing `--muted`/`color-mix(..., var(--foreground) ...)` token vocabulary already used elsewhere in this file's SCSS (see `.sliderSegment:hover`, `.sliderTooltip`'s shadow) rather than introducing a new hex value. A thin (`2px`–`3px`) vertical bar, lower z-index than `.sliderHandle` (`z-index: 10`) and `.sliderTooltip` (`z-index: 20`), is sufficient — this is a passive visual reference, not an interactive control (no `role="slider"`, no `tabIndex`, no drag handlers).
  - [x] Confirm equal-to-default segments render **zero** reference bars (AC #3) — this is a filter, not a "render but hide" — don't emit a DOM node just to set `display: none`, matching this codebase's existing pattern of returning nothing rather than a hidden node (see Story 3.6's `IncompleteDisclosure` `null`-return precedent in `project-context.md`).

- [x] Task 3: Wire the caller and write tests
  - [x] In `ManualExpenseForm.tsx`, pass `defaultPercents={percentMapFromDefault(members, effectiveSplit)}` on the existing `<PercentageSplitTrack>` call (line ~436). Do **not** duplicate `percentMapFromDefault`'s logic inline — import/call the existing function (already defined in this same file at line 74; no new import needed).
  - [x] Leave `DefaultSplitPanel.tsx`'s `<PercentageSplitTrack>` call (line ~220) unchanged — no `defaultPercents` passed there (see Scope — Out).
  - [x] Extend `PercentageSplitTrack.test.tsx` (same file — this codebase keeps one test file per component, not a new `__tests__/` file):
    - AC #1: assert each `.sliderLabel`'s inline `width` style matches its sibling `.sliderSegment`'s inline `width` style for the same member index, across an uneven split (e.g. `{ owner: "60", alice: "25", bob: "15" }`).
    - AC #2: with `defaultPercents` differing from `percents` for a member, assert a reference-bar element renders (pick a stable `data-*` attribute or class selector introduced in Task 2, e.g. `data-default-bar`) positioned via its `left` style at the expected cumulative default-position percentage.
    - AC #3: with `defaultPercents` equal to `percents` for all members, assert zero reference-bar elements render.
    - Regression: re-run the existing "renders the current user as the leftmost label" test unmodified — Avatar `title` lookup (`[title]`) must still resolve the same way after the width-model change.
  - [x] Run full `ui` CI: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx next build` — zero regressions in `ManualExpenseForm`/`DefaultSplitPanel`/`PercentageSplitTrack` suites.

## Dev Notes

### Critical product pins

| Pin | Rule |
|-----|------|
| **Avatar centering model** | `.sliderLabel` width must be computed with the exact same formula as `.sliderSegment` width (`Math.max(percentValues[i], 1)}%`) — two independently-drifting formulas is how this bug happened the first time |
| **Reference bar coordinate system** | Reference bars sit on the track's absolute `left: %` coordinate (same as `.sliderHandle`), not a per-segment-local offset |
| **Reference bar filter, not hide** | Equal-to-default segments render **no** DOM node for the bar (AC #3) — never a hidden/zero-opacity element |
| **`defaultPercents` is optional** | `DefaultSplitPanel.tsx`'s call site must keep compiling and behaving identically without passing it — there is no "default" to diff against when you're editing the default itself |
| **No domain/ordering changes** | `orderPercentageSplitUserIds`, the sum-to-100 validation, and FR-9/FR-10 split math are explicitly out of scope (AC #4) |
| **Styling stack** | `PercentageSplitTrack.module.scss` (SCSS module) is the existing, intentional exception to "no new `*.module.css`" (AD-23) — dynamic per-member widths aren't expressible as static Tailwind utility classes; extend the existing SCSS file, don't convert it or add a parallel Tailwind version |
| **Token reuse** | Use existing `var(--muted)`, `var(--foreground)`, `color-mix(...)` tokens already present in this file — no new hex values |

### Why this file uses `.module.scss` instead of Tailwind

Per `project-context.md`'s "Verified Soft-Ledger UI conventions": Tailwind utilities are co-located by default since Epic 3.5, with `.module.scss` reserved for genuinely custom/dynamic styling utilities can't express. `PercentageSplitTrack` computes per-member pixel/percent widths and absolute positions at render time from live drag state — this is exactly the "custom" carve-out, which is why this file (unlike most other Soft-Ledger components) was never migrated to Tailwind during Epic 3.5. Continue that pattern; don't attempt a Tailwind conversion as part of this story.

### `percentMapFromDefault` — reuse, don't reimplement

`ManualExpenseForm.tsx` (lines 74–89) already contains exactly the function needed to compute "what would the default split give this member":

```typescript
function percentMapFromDefault(
  list: ListMember[],
  defaultSplit: DefaultSplitPayload | null | undefined,
): Record<string, string> {
  if (!defaultSplit || defaultSplit.shares.length === 0) {
    return evenPercentMap(list);
  }
  const byId = Object.fromEntries(
    defaultSplit.shares.map((share) => [share.user_id, share.percentage]),
  );
  const map: Record<string, string> = {};
  for (const member of list) {
    map[member.user_id] = byId[member.user_id] ?? "0";
  }
  return map;
}
```

This already handles the even-split fallback (no custom default set) and missing-member-in-shares (`?? "0"`) edge cases. Call it directly for the new `defaultPercents` prop — do not write a second version of this logic in `PercentageSplitTrack.tsx`.

### Files Modified (expected)

| File | Change | Impact |
|------|--------|--------|
| `ui/app/lists/PercentageSplitTrack.tsx` | UPDATE | Add `defaultPercents` prop, per-member label width, reference-bar rendering |
| `ui/app/lists/PercentageSplitTrack.module.scss` | UPDATE | `.sliderLabel` width model change; new reference-bar class |
| `ui/app/lists/PercentageSplitTrack.test.tsx` | UPDATE | New AC #1/#2/#3 test cases; existing test kept passing |
| `ui/app/lists/ManualExpenseForm.tsx` | UPDATE | Pass `defaultPercents={percentMapFromDefault(members, effectiveSplit)}` at the existing call site |
| `ui/app/lists/DefaultSplitPanel.tsx` | none expected | Confirm no `defaultPercents` passed (editing the default itself) |

### Previous story intelligence (from Story 3.6)

- This codebase's dev/review cycle repeatedly found that story text assuming file paths/names not present in the live repo caused churn — this story was written by reading the actual live files first (`PercentageSplitTrack.tsx`, `.module.scss`, `.test.tsx`, `ManualExpenseForm.tsx`, `DefaultSplitPanel.tsx`) rather than the epic's abstract description, so paths/props above should already match what dev-story finds.
- Story 3.6 established the precedent of returning `null`/no-DOM-node for a "not applicable" visual state rather than a hidden element — followed here for AC #3.
- Story 3.6 also reaffirmed: real token names only (`var(--muted)`, etc.), no new hex, no barrel `index.ts`, one shared test file per component area (not a new per-component test file).

### Git intelligence

Recent commits on `main` (`743300b`, `0912d8b`, `5345021`, `0a116a8`, `bb12411`) are Epic 7 (budgets) work — unrelated to this Epic 3 UI story; no shared files, no merge-conflict risk expected against this branch's target files.

## Dev Agent Record

### Implementation Plan

- Confirmed all Prerequisites/Task 0 assumptions against the live files (`PercentageSplitTrack.tsx`, `.module.scss`, `.test.tsx`, `ManualExpenseForm.tsx`, `DefaultSplitPanel.tsx`) — all matched the story text exactly, no path/name drift.
- AC #1: replaced `.sliderLabel`'s `flex: 1` sizing with `flex: 0 0 auto` plus an inline `width: ${Math.max(percentValues[i], 1)}%` on each label, mirroring the existing `.sliderSegment` width formula exactly, and added `justify-content: center` to the label's flex classes so the `<Avatar>` centers within that width.
- AC #2/#3: added optional `defaultPercents?: Record<string, string>` prop, a `defaultPercentValues` memo mirroring `percentValues`, and a filtered `.map()` over `orderedUserIds` inside the track (same absolute `left: %` coordinate system as `.sliderHandle`, using cumulative default-percent sums) that renders a `data-default-bar` element only where `Math.round(default) !== Math.round(current)` — returns `null` (no DOM node) for equal segments, per the Story 3.6 precedent cited in Dev Notes.
- Added `.defaultReferenceBar` to the SCSS module reusing `color-mix(in srgb, var(--foreground) 30%, transparent)` (existing token vocabulary, no new hex), `z-index: 5` (below `.sliderHandle`'s 10 and `.sliderTooltip`'s 20).
- Wired `ManualExpenseForm.tsx`'s existing call site with `defaultPercents={percentMapFromDefault(members, effectiveSplit)}`, reusing the already-defined function — no duplicated logic. `DefaultSplitPanel.tsx` intentionally left unchanged (verified via `git diff`, zero lines changed).
- Extended `PercentageSplitTrack.test.tsx` with 3 new cases (label/segment width parity for an uneven split; reference bar rendered with correct `left` values when default ≠ current; zero reference bars when default === current for all members) — original test kept unmodified and passing.
- Post-review addition: wrapped each label-row `<Avatar>` with the shared `Tooltip` component (`@/components/Tooltip`, existing barrel export) showing the member alias, so hovering an avatar surfaces the alias via the app's standard tooltip UX instead of only the browser's native `title` attribute. Wrapped Avatar in a plain `<span>` (Avatar is a function component, not `forwardRef`-enabled, so `Tooltip`'s ref-cloning attaches to the wrapping span instead). Avatar's own `title`/`aria-label` are unchanged, so the existing `[title]`-based regression test still passes unmodified.

### Debug Log

- Worktree Compose stack (`--lite` mode) mounts `ui/node_modules` read-only from the primary checkout's volume, which made `vitest`/`vite` fail with `ENOENT: mkdir '/app/node_modules/.vite-temp'` when bundling `vitest.config.mts`. Worked around for local verification only by running vitest against a scratch copy of the config (hardcoded `root: "/app"`, node_modules symlinked from `/app/node_modules`) in a writable `/tmp` directory; no repo files were changed for this workaround, and the scratch directory was removed after verification.
- Full-suite `vitest run` inside the lite container showed 5 unrelated timeouts (`UploadPanel.test.tsx`, `soft-ledger.test.tsx`, `ImportReviewSheet.test.tsx`, `IndividualReviewPanel.test.tsx`) under parallel-worker resource contention; re-running those files in isolation passed cleanly (60/60), confirming they are pre-existing container-load flakiness unrelated to this story's changes.

### Completion Notes

- All 4 Acceptance Criteria implemented and verified by tests: AC #1 (label/segment width parity), AC #2 (reference bar at correct absolute position when custom ≠ default), AC #3 (no DOM node when custom === default), AC #4 (confirmed via `git diff` — `orderPercentageSplitUserIds`, sum-to-100 validation, and `DefaultSplitPanel.tsx` all untouched).
- CI green in the worktree's `ui` container: `tsc --noEmit` (0 errors), `eslint` on all touched files (0 issues), `vitest run` (679 passed / 5 pre-existing unrelated timeouts, both files retested in isolation to confirm), `next build` (succeeded, all routes compiled).
- No new dependencies, no i18n keys added, no `orderPercentageSplitUserIds`/domain logic touched.

## Completion Checklist

Before marking this story **done** and pushing for code review:

- [x] Branch created and named per AD-13: `feat/3/3-7-percentage-split-avatar-centering-and-reference-bar`
- [x] AC #1: avatar row width model matches segment width model exactly; avatars visually centered under their own segment at any split ratio
- [x] AC #2: muted reference bar renders at the correct absolute track position when a member's percent differs from their default
- [x] AC #3: no reference bar (no DOM node) when a member's percent equals their default
- [x] AC #4: `orderPercentageSplitUserIds`, sum-to-100 validation, FR-9/FR-10 untouched — confirm via `git diff` before opening PR
- [x] `ManualExpenseForm.tsx` wired with `defaultPercents`; `DefaultSplitPanel.tsx` intentionally left without it
- [x] Tests written/extended in `PercentageSplitTrack.test.tsx`; existing test still passes unmodified
- [x] CI green: `tsc --noEmit`, `eslint .`, `vitest run`, `next build`
- [x] Short how/why overview (see `story-close-overview-checklist.md`):
  - **What:** Fixed avatar-under-segment centering; added an optional muted default-position reference bar to `PercentageSplitTrack`
  - **Why:** UI polish addendum (Sprint Change Proposal 2026-09-02) — users adjusting a custom percentage split had no visual anchor to the list's default, and avatars didn't line up under uneven segments
  - **How:** Unified the label-row and segment-row width formulas; added an optional `defaultPercents` prop rendering a filtered set of muted bars at absolute track positions where current ≠ default
  - **What not to break:** Drag/keyboard handle interaction, split-sum-to-100 validation, `orderPercentageSplitUserIds` ordering, `DefaultSplitPanel`'s own (no-reference-bar) rendering
- [ ] PR ready for code review (run `/code-review` when pushed)

## File List

- `ui/app/lists/PercentageSplitTrack.tsx` (UPDATE) — `defaultPercents` prop, per-member label width, reference-bar rendering, avatar wrapped in shared `Tooltip` with alias
- `ui/app/lists/PercentageSplitTrack.module.scss` (UPDATE) — `.sliderLabel` width model change; new `.defaultReferenceBar` class
- `ui/app/lists/PercentageSplitTrack.test.tsx` (UPDATE) — new AC #1/#2/#3 test cases; existing test kept passing
- `ui/app/lists/ManualExpenseForm.tsx` (UPDATE) — passes `defaultPercents={percentMapFromDefault(members, effectiveSplit)}` at the existing call site

## Change Log

- 2026-09-02: Implemented Story 3.7 — fixed avatar-row/segment-row width-model mismatch (AC #1) and added an optional muted default-split reference bar (AC #2/#3), no domain/ordering changes (AC #4). All tasks complete, CI green, status moved to `review`.
- 2026-09-02: Post-review addition — wrapped label-row avatars with the shared `Tooltip` component to show the member alias on hover, per reviewer request.

---

## Story Summary

**Story 3.7** is a small, self-contained UI polish addendum to Epic 3's already-shipped percentage-split track (`PercentageSplitTrack.tsx`, Stories 3.2/2.5/2.6). It fixes a layout bug where member avatars sit in an equal-width flex row instead of tracking their own segment's actual (percent-proportional) width, and adds an optional muted reference bar showing where a member's share was under the list's default split — visible only when the user has actually moved away from that default. No domain logic, split math, or ordering changes; purely visual.
