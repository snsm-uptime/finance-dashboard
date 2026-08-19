---
title: 'Cards panel: list below register on mobile'
type: 'refactor'
created: '2026-08-18'
status: 'done'
route: 'one-shot'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On a phone, Home's Cards column led with the existing-cards list, so Register card and Default review destination sat below the fold.

**Approach:** Put Register, then Default review destination, then the cards list in source order so mobile visual, keyboard, and heading order match. Reverse that stack from the `md` (768px) breakpoint to keep the original desktop order.

</frozen-after-approval>

## Suggested Review Order

**Source order (mobile) vs reverse (desktop)**

- Register → default slot → list in the DOM; `md:flex-col-reverse` restores desktop. Comment records the 768px Home contract.
  [`CardsPanel.tsx:88`](../../ui/app/cards/CardsPanel.tsx#L88)

- Register is the first flex child so phone tab order hits the form first.
  [`CardsPanel.tsx:96`](../../ui/app/cards/CardsPanel.tsx#L96)

**Stable default-destination slot**

- Wrapper stays in the tree when the control returns null, without adding a gap (`empty:hidden`).
  [`CardsPanel.tsx:116`](../../ui/app/cards/CardsPanel.tsx#L116)

**Register announcement**

- Polite live region after a successful register; focus stays in the form (no auto-scroll).
  [`CardsPanel.tsx:78`](../../ui/app/cards/CardsPanel.tsx#L78)

- EN/ES status copy for that live region.
  [`cards.ts:13`](../../ui/lib/i18n/cards.ts#L13)

**Tests**

- Asserts wrapper classes and heading source order when lists exist.
  [`CardsPanel.test.tsx:103`](../../ui/app/cards/CardsPanel.test.tsx#L103)

- Asserts the empty default slot still occupies the middle child.
  [`CardsPanel.test.tsx:122`](../../ui/app/cards/CardsPanel.test.tsx#L122)
