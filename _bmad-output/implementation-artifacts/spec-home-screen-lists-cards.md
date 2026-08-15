---
title: 'Home: combine Lists and Cards into one screen'
type: 'refactor'
created: '2026-08-14'
status: 'done'
route: 'one-shot'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lists and Cards lived on separate pages (`/lists`, `/cards`), so checking a card's IBAN meant navigating away from your lists.

**Approach:** Add a `/home` route rendering `ListsPanel` and an embedded `CardsPanel` side by side on desktop (Lists left, Cards right) and stacked on mobile (Lists top, Cards bottom); retarget the authenticated landing and all internal "back" links from `/lists` to `/home`; permanently redirect the old bare `/lists` URL.

</frozen-after-approval>

## Suggested Review Order

**Home layout (entry point)**

- New combined server page: fetches lists, renders ListsPanel + embedded CardsPanel side by side
  [`page.tsx:54`](../../ui/app/home/page.tsx#L54)

- Responsive flex layout: column-stacked on mobile, row from the 768px breakpoint
  [`home.module.scss:22`](../../ui/app/home/home.module.scss#L22)

**CardsPanel embeddable refactor**

- New `embedded` prop lets the same component skip its own page chrome when composed into Home
  [`CardsPanel.tsx:18`](../../ui/app/cards/CardsPanel.tsx#L18)

- Heading drops to `<h3>` when embedded to keep Home's heading hierarchy valid under its own `<h2>`
  [`CardsPanel.tsx:28`](../../ui/app/cards/CardsPanel.tsx#L28)

- `useId()`-based heading ids replace hardcoded string ids for reuse-safety
  [`CardsPanel.tsx:24`](../../ui/app/cards/CardsPanel.tsx#L24)

- Embedded branch returns just the sections; standalone branch keeps the original page chrome for `/cards`
  [`CardsPanel.tsx:123`](../../ui/app/cards/CardsPanel.tsx#L123)

**Legacy `/lists` retirement**

- Bare `/lists` now permanently redirects to `/home`, forwarding any query string
  [`page.tsx:21`](../../ui/app/lists/page.tsx#L21)

**Landing & navigation retarget**

- Default authenticated landing now resolves to `/home`
  [`landing.ts:22`](../../ui/lib/landing.ts#L22)

- Post-alias-setup fallback now lands on `/home`
  [`page.tsx:18`](../../ui/app/alias/page.tsx#L18)

- Post-verify continue link now defaults to `/home`
  [`VerifyForm.tsx:29`](../../ui/app/verify/VerifyForm.tsx#L29)

- Account chrome link retargeted to `/home`
  [`AccountMenu.tsx:93`](../../ui/components/AccountMenu.tsx#L93)

- All four "back" links on the list-detail page retargeted to `/home`
  [`page.tsx:371`](../../ui/app/lists/[listId]/page.tsx#L371)

- Upload stub's back link retargeted to `/home`
  [`page.tsx:31`](../../ui/app/upload/page.tsx#L31)

**Copy updated for the merged identity**

- Page title/subtitle now describe Home (lists + cards) instead of Lists-only
  [`lists.ts:6`](../../ui/lib/i18n/lists.ts#L6)

- "Back" label now reads "Home" to match its destination
  [`lists.ts:35`](../../ui/lib/i18n/lists.ts#L35)

- AccountMenu label renamed `backToLists` → `backToHome`
  [`account.ts:23`](../../ui/lib/i18n/account.ts#L23)

**Peripherals**

- Updated expected default-landing path in existing unit tests
  [`landing.test.ts`](../../ui/lib/landing.test.ts)
  [`signupClient.test.ts`](../../ui/app/signup/signupClient.test.ts)
