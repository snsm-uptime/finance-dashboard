---
name: statements-retouch
description: Behavioral delta for the Statements tab (browse/retouch), single-item move, and list-scoped direct import — companion to DESIGN.md's visual delta.
status: final
updated: 2026-09-30
sources:
  - ../ux-finance-helper-2026-08-03/EXPERIENCE.md
  - ../row-level-individual-review-2026-08-20.md
---

## Foundation

Mobile-first, desktop-capable — same form factor as the rest of Soft-Ledger. No new
UI system; inherits the existing `AppShell`/`TabBar`/`Sheet` primitives.

## Information Architecture

New surfaces, all reachable from a new 4th `TabBar` entry, **Statements** (alongside
Home / Budgets / Cards):

1. **Statements tab (home)** — statements grouped by card/IBAN (mirrors the existing
   Cards panel's own grouping), most-recent period first within each group.
   Statements with no IBAN (hand-entered / no-card imports) get their own trailing
   group, not silently dropped.
2. **Period summary** — tapping a period row opens a summary screen: period dates,
   item count, destination list(s) it's filed to, and a single "View items" action.
   This is an intermediate step, not a drill-straight-in — it's the user's chance to
   confirm which statement they meant before committing to retouch it.
3. **Retouch list** — "View items" opens the statement's committed rows as a plain
   scrollable list (not the four-direction swipe card). Each row carries inline
   edit / delete / move actions, reusing `ReceiptRow` + the same menu pattern as
   `ListReceiptMenu` today.

Two more IA additions outside the Statements tab:

4. **List detail → "Move this item"** — a new, separate entry in `ListReceiptMenu`
   alongside the existing "Move whole statement" entry (Story 5.3's action is
   unchanged). Both open the same destination-list picker `Sheet`; only the move
   scope (one entry vs. the whole batch) differs.
5. **List detail → "Import statement"** — a new entry point on the list detail page
   that starts the existing upload/review flow with this list pre-set as the
   destination for every row — no card-routing/default-list resolution needed for
   this path. It still passes through the normal review flow (comparison /
   individual-review / bulk-review, parse-failure handling, same-price-conflict and
   quarantine disclosure) exactly as today's global `/upload` entry point does;
   only how the destination list is chosen changes.

Surface closure: every stated need (retouch a past mistake, move one item without
breaking a statement, import directly into a specific list) now has a surface, and
every new surface is reached from an existing, discoverable entry point (TabBar or
list detail page) — no orphan screens.

## Component Patterns

- **ListReceiptMenu** — two move entries, distinguishable by icon and label
  ("Move this item" / "Move whole statement"); "Move whole statement" only appears
  when the row has a `statementId` (unchanged from today). Both share the existing
  `Sheet` + destination-list-picker body; only the confirm action's payload
  (`entryId` vs `statementId`) and the confirm copy differ ("This item will move to
  {list}" vs "All items from this statement will move to {list}").
- **Retouch row** — same `ReceiptRow` shell as list detail pages, with a trailing
  menu offering: edit (existing `EditExpenseForm`), delete (existing confirm-delete),
  move to another list (new — same single-item move as pattern above). No swipe
  gesture, no four-direction keyboard legend — this is a browse-and-fix list, not a
  one-at-a-time triage queue.
- **Period summary card** — read-only until "View items" is pressed; never
  auto-navigates into the retouch list, so re-opening the Statements tab after a fix
  always lands the user back at a stable, scannable list rather than mid-edit.
- **List-scoped "Import statement" entry** — visually and behaviorally identical to
  the existing `UploadButton` flow, launched with the list's id already bound; the
  review screens (`SessionReviewPanel`, `IndividualReviewPanel`, `ParseComparisonPanel`)
  render exactly as they do today, with no destination-list picker step to skip
  through.

## State Patterns

- **Empty Statements tab** — no statements at all: same empty-state tone as other
  first-run empty states in the app (a short hint + link to `/upload`), not a bare
  blank screen.
- **Card group with only hand-entered items** — statements without an IBAN still
  need a home; grouped under a explicit "No card" / "Manual entries" group rather
  than omitted.
- **Retouch list after the last item is moved/deleted** — the statement's period
  summary updates its item count live; if it reaches zero, the summary still shows
  (never silently disappears — the statement's history, e.g. its original period and
  origin, remains inspectable even with zero remaining items).
- **Move-in-flight** — both move actions (single item, whole statement) reuse the
  existing busy/disabled/error pattern from `ListReceiptMenu.confirmMove` — no new
  loading treatment needed.

## Interaction Primitives

- Single-item move and whole-statement move are two distinct destructive-adjacent
  confirmations (not literally destructive, but irreversible-without-a-second-move),
  each with its own explicit confirm copy naming what will move — never a shared,
  ambiguous "Move" confirm string.
- The retouch list's inline actions (edit/delete/move) are exposed the same way
  `ListReceiptMenu` exposes them on a list detail page — a per-row menu, not
  persistent visible icons — so the retouch list reads as a variant of a familiar
  pattern, not a new interaction vocabulary.

## Accessibility Floor

- Statements tab icon: `aria-label` follows the existing `TabBarItem.label` pattern
  (already localized, already wired to `aria-current`) — no new accessibility
  mechanism, just a new label string in both `en`/`es` message tables.
- Retouch list rows: same accessible name / menu semantics as `ListReceiptMenu`'s
  existing `ReceiptRowMenu` (`menuAria`, per-action labels) — reused verbatim, not
  redefined. The retouch row's move action reuses the "Move this item" label and
  confirm copy verbatim (below) — it does not introduce a third, differently-worded
  move string.
- Period summary → retouch list navigation must be reachable and operable via
  keyboard/focus order identically to how list detail's own receipt list is today
  (no swipe-only affordance is introduced anywhere in this delta). On activating
  "View items," focus moves to the retouch list's heading (or first row if headless);
  backing out of the retouch list returns focus to the "View items" trigger on the
  period summary card — the tab → group → period-summary → retouch-list chain never
  drops focus to `<body>`.
- Card/IBAN groups (and the trailing "No card" / "Manual entries" group) render as
  labeled headings (card/IBAN name as the heading text), not just visual section
  breaks — a screen-reader user can jump between groups the same way they already
  jump between headings on the Cards panel.
- "Move this item" and "Move whole statement" carry distinct, fully-worded
  `aria-label`s (never truncated to a shared "Move") — this is required in addition
  to their visual/icon distinction (DESIGN.md), so the two actions are
  distinguishable out of visual context, matching their already-distinct confirm
  copy.
- The list-scoped "Import statement" entry's accessible name names its destination
  (e.g. "Import statement to {list name}") — it must not share the global Upload
  button's exact label, since a screen-reader user tabbing across the list detail
  page and the app's global nav could otherwise encounter two identically-announced
  controls with different scopes.
- Removing a row from the retouch list (via move or delete) triggers a polite
  live-region announcement on the retouch list itself ("Item moved to {list}" /
  "Item deleted") — independent of, and in addition to, the period summary's own
  item-count update, since the user is looking at the retouch list, not the summary,
  at the moment the row disappears. If the period summary happens to be visible when
  its count reaches zero (an uncommon case, since the two screens aren't normally
  viewed simultaneously), that count update is announced there too; the summary
  itself never disappears at zero (per State Patterns above).

## Key Flows

**Mary re-files a mis-scanned grocery run.** Mary imported last week's BAC statement
into "Household," but one row — a personal pharmacy purchase — landed in the shared
list by mistake. She opens "Household," finds the row, opens its menu, and now sees
two move options instead of one. She taps "Move this item," picks her personal list,
confirms — the pharmacy row moves alone; the rest of the BAC statement stays exactly
where it was. Household's balance recalculates immediately; nothing else changed.

**Sebas revisits a statement two weeks after import.** From the Statements tab, Sebas
opens the Promerica card group, picks the most recent period, and sees a summary:
14 items, filed to "Household." He taps "View items," scans the plain list, notices
one row he mis-titled during the original swipe-review, opens its edit action, fixes
the title, and backs out — the Statements tab still shows the same period, item count
unchanged, ready for the next visit.

**Sebas imports straight into a shared list.** Sebas is already looking at "Trip to
Panama" and just got a new card statement covering exactly that trip. Instead of
going to the global upload screen and hoping the right list gets picked, he taps
"Import statement" right there on the list page. The familiar upload/review flow
opens, already scoped to "Trip to Panama" — no destination step to think about —
and he reviews rows exactly as he would from anywhere else.
