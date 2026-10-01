---
name: statements-retouch
kind: reviewer-gate-findings
lens: accessibility (WCAG 2.1 AA)
reviewed:
  - DESIGN.md
  - EXPERIENCE.md
status: draft
---

# Accessibility Review — Statements / Retouch Delta

Scope: DESIGN.md + EXPERIENCE.md for `statements-retouch` (2026-09-30), judged for
consistency with the `finance-helper` base spine's Accessibility Floor (WCAG 2.2 AA
per the base; this delta doesn't downgrade to 2.1 but the requested lens is applied
against 2.1 AA as the floor — no gaps found that 2.2-only criteria would catch beyond
what's listed).

## Findings

1. **[should-fix] Period summary → retouch list drill-down has no stated focus-management rule.**
   EXPERIENCE.md's Accessibility Floor says the navigation must be "reachable and
   operable via keyboard/focus order identically to... list detail's own receipt
   list," but that only covers *reaching* the retouch list — it doesn't say where
   focus lands after "View items" is activated, or where it returns to on back-navigation
   (the item that had focus in the period summary, vs. top of list). Without this, a
   screen-reader/keyboard user can lose their place across the tab → group → period
   summary → retouch list chain.
   *Fix:* add one line specifying focus moves to the retouch list's heading/first row
   on entry, and returns to the "View items" trigger (or the period card) on exit.

2. **[should-fix] Card/IBAN grouping and "No card" group have no stated heading structure.**
   IA says statements are "grouped by card/IBAN... most-recent period first within
   each group" with a trailing "No card" group, but neither doc specifies these
   groups are exposed as programmatic headings (e.g. `<h2>`/`role=heading` per group)
   so screen-reader users can jump between card groups instead of linearly reading
   every period row.
   *Fix:* state groups render as labeled headings (card/IBAN name, or "No card" /
   "Manual entries") consistent with how the Cards panel already groups, per the
   IA's own "mirrors the existing Cards panel's own grouping" claim.

3. **[blocker] "Move this item" vs. "Move whole statement" accessible names are only
   guaranteed distinguishable visually, not for assistive tech.** DESIGN.md's
   Do/Don't says the two entries "must not [share] the same icon" — a visual-only
   requirement — and EXPERIENCE.md's Component Patterns says they're "distinguishable
   by icon and label." The label text is fine (different strings), but the
   Accessibility Floor section never states this explicitly as an accessible-name
   requirement (it defers to "same accessible name / menu semantics as
   `ListReceiptMenu`'s existing `ReceiptRowMenu`... reused verbatim"). Since
   `ListReceiptMenu` today only has ONE move entry, "reused verbatim" doesn't tell an
   implementer what the *new* second entry's accessible name should be, and nothing
   rules out both entries visually differing but colliding on a generic
   `aria-label="Move"` if per-action labels aren't wired through. This is the crux
   of the review question and the spec is genuinely ambiguous here, not just thin.
   *Fix:* add an explicit line to the Accessibility Floor: "Move this item" and
   "Move whole statement" carry distinct, fully-worded `aria-label`s (not truncated
   to "Move") so they are distinguishable when read out of visual context, matching
   the distinct confirm copy already specified in Interaction Primitives.

4. **[nice-to-have] Retouch row's inline menu — spec correctly avoids a new aria
   pattern, but doesn't confirm the *scope* addition (move-to-another-list as a
   third action) fits the existing `ReceiptRowMenu` labeling scheme without
   collision with the new dual-move entries in #3.** The retouch row's menu (edit /
   delete / move) is described as reusing `ReceiptRowMenu` verbatim, but the
   retouch list's "move" is single-item-only (no "move whole statement" option
   there) — worth one line confirming the retouch row's move entry uses the same
   "Move this item" label from #3, not a third distinct string, to avoid
   fragmenting the taxonomy of move actions across two menu implementations.
   *Fix:* one sentence: retouch row's move action reuses the "Move this item" label/
   confirm copy verbatim.

5. **[blocker] No live-region / announcement rule for retouch-list item count changes.**
   State Patterns says "the statement's period summary updates its item count live"
   when an item is moved/deleted from the retouch list — but "live" here describes
   the *data* staying in sync, not an assistive-tech announcement. Since the count
   update happens on a screen the user has already navigated away from (they're
   still in the retouch list when they delete/move a row, not looking at the period
   summary), there's no stated announcement for what happens on the *current*
   screen: does the retouch list itself announce "item removed" / "3 items
   remaining"? The base spine's Accessibility Floor requires review outcomes be
   "exposed to assistive tech as labeled actions... or announcements," and this new
   flow (delete/move causing a list to shrink) is exactly the kind of dynamic content
   change WCAG 4.1.3 (Status Messages) covers, but it's unaddressed.
   *Fix:* add a State Patterns line: retouch-list row removal (move or delete)
   triggers a polite live-region announcement (e.g. "Item moved to {list}" / "Item
   deleted"), independent of the period summary's own count update.

6. **[should-fix] Zero-remaining-items summary state has no stated announcement either.**
   Related to #5: "if it reaches zero, the summary still shows" is a good rendering
   rule (avoids the item disappearing silently) but doesn't say whether reaching zero
   is itself announced when the user is on the period summary screen at that moment,
   vs. only discoverable by revisiting later. Likely low-frequency (user usually
   isn't watching the summary while emptying it from the retouch list), so should-fix
   rather than blocker.
   *Fix:* clarify the live count update on the period summary (if visible) is itself
   announced, or explicitly state it's out of scope because the two screens aren't
   normally viewed simultaneously.

7. **[nice-to-have] Color/contrast — tokens verified consistent, no issue found.**
   `statements-tab-icon` → `{finance-helper.colors.muted}` and
   `statements-tab-icon-active` → `{finance-helper.colors.accent}` both alias the
   base spine's existing tab-icon tokens (DESIGN.md's Colors table: Muted/Accent rows,
   with dark-mode variants already defined at the base). This matches "every other
   TabBar entry (`home`, `budgets`, `cards`)" as stated. No new hardcoded value, no
   contrast risk beyond what's already accepted for existing tabs. Flagging only as
   a nice-to-have reminder: the base spine has an `[ASSUMPTION]` flag on
   `on-accent-dark` needing AA validation "on real controls" — if the Statements tab
   icon's active state ever renders inside a filled-accent surface (not just as a
   linear icon against canvas), that inherited assumption should be re-verified,
   though nothing in this delta appears to trigger that case.

8. **[nice-to-have] Import-statement entry point — no explicit accessible-name
   distinction from the global Upload entry.** "Import statement" on the list detail
   page is "visually and behaviorally identical to the existing `UploadButton` flow...
   launched with the list's id already bound." If it reuses the exact same button
   label/`aria-label` as the global Upload control, a screen-reader user tabbing
   through the list detail page and the global nav could encounter two
   identically-announced "Upload"/"Import" controls with different scopes and no way
   to tell them apart out of visual context.
   *Fix:* confirm (or add a line stating) the list-scoped entry's accessible name
   includes the destination, e.g. "Import statement to {list name}," distinct from
   the global Upload button's label.

## Not flagged (spec is adequate)

- Reduce Motion / no-swipe-gesture requirement is explicitly and correctly restated
  for the retouch list ("No swipe gesture... this is a browse-and-fix list").
- Menu-as-interaction-pattern (per-row menu, not persistent icons) is consistent with
  the base spine's existing `ListReceiptMenu` precedent — no new interaction
  vocabulary introduced, so no new keyboard pattern needs specifying from scratch.
- Confirm-copy differentiation between the two move actions (distinct strings naming
  what will move) is explicit and good — this is the right pattern, just needs the
  matching `aria-label` guarantee called out in Finding 3.

## Summary of severities

- Blockers: 2 (Findings 3, 5)
- Should-fix: 3 (Findings 1, 2, 6)
- Nice-to-have: 3 (Findings 4, 7, 8)
