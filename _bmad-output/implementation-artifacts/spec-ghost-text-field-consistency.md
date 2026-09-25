---
title: 'Shared ghost text field for inline renames'
type: 'refactor'
created: '2026-09-25'
status: 'done'
route: 'one-shot'
---

# Shared ghost text field for inline renames

## Intent

**Problem:** The List rename input (borderless, blends into plain text until focused), the card-label rename input (a bordered `GhostInput` forced borderless via override), and the transaction-title textarea (its own ad hoc class list) each implemented the same "ghost" inline-rename affordance with different, drifting CSS.

**Approach:** Extract the List rename input's chrome into a shared `GhostTextField`/`GhostTextArea` component (`ui/components/soft-ledger/GhostTextField.tsx`) and adopt it in `ListsPanel`, `CardRoutingControl`, and `IndividualReviewPanel`, so all three read as the same affordance.

## Suggested Review Order

**Shared component**

- New borderless field: transparent background (blends with each caller's own surface rather than a fixed color), muted-until-focus text, module-scoped disabled/placeholder rules.
  [`GhostTextField.tsx:1`](../../ui/components/soft-ledger/GhostTextField.tsx#L1)

**Adoption — list rename (source of the pattern)**

- Swaps the old `styles.listNameEdit` input for `GhostTextField`; sizing (font-weight/size/line-height) now travels as a `className`, not baked into the shared component.
  [`ListsPanel.tsx:546`](../../ui/app/lists/ListsPanel.tsx#L546)
- Removed the now-unused `.listNameEdit` rules this component's markup used to depend on.
  [`lists.module.scss:326`](../../ui/app/lists/lists.module.scss#L326)

**Adoption — card label rename**

- Replaces the bordered `GhostInput` (previously neutralized via `wrapperClassName="border-0 p-0"`) with the wrapper-less `GhostTextField`.
  [`CardRoutingControl.tsx:219`](../../ui/app/cards/CardRoutingControl.tsx#L219)

**Adoption — transaction title (auto-growing, highest risk)**

- Swaps the raw `<textarea>` for `GhostTextArea` with an inline `style={{ padding: 0 }}` override — deliberate, not an oversight: the outer container already carries its own padding, and `resizeTitleTextarea`'s `scrollHeight`-based stepping was tuned against an unpadded textarea, so the shared module's default padding would double up on both and silently inflate the auto-grow height.
  [`IndividualReviewPanel.tsx:1063`](../../ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx#L1063)
- Dropped a leftover `disabled:opacity-55` Tailwind class that would have fought the shared component's own `disabled` opacity rule.
  [`IndividualReviewPanel.tsx:1063`](../../ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx#L1063)
