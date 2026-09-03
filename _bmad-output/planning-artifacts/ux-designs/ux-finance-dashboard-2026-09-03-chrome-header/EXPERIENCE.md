---
name: chrome-header
description: Behavioral spine for the shared AppShell chrome header — when the leading slot is Back vs. Avatar vs. empty, title content rules, and trailing-slot ordering — applied consistently to every page that opts into useChromeHeader.
status: final
updated: 2026-09-03
---

# EXPERIENCE.md — chrome-header

Behavioral spine for `AppShell`'s shared header (`ui/components/AppShell.tsx`, `useChromeHeader` in `ui/components/ChromeBack.tsx`). Visual identity lives in [`DESIGN.md`](./DESIGN.md) (this run) and the base [`finance-helper` spine](../ux-finance-helper-2026-08-03/EXPERIENCE.md). This file **updates and supersedes** the chrome-related rows of [`docs-tutorials-page`/EXPERIENCE.md](../ux-finance-dashboard-2026-09-02/EXPERIENCE.md#information-architecture) — specifically the `/home` help-icon-target row, which is now stale (see Information Architecture below). Spines win on conflict with any mock or existing implementation.

## Foundation

Mobile-first responsive web, same PWA-style shell as the rest of Finance Helper. Components: `AppShell`, `IconButton`, `Avatar`, `DocsHelpButton` — all existing, no new primitives introduced. Accessibility floor: WCAG 2.2 AA (inherited).

## Information Architecture

Every authenticated page's chrome header is one of three leading-slot states, paired with a content-first title and an ordered trailing slot. This table is the source of truth — it supersedes any per-page choice made ad hoc before this spec:

| Page | Leading slot | Title | Trailing slot (order) |
|---|---|---|---|
| `/home` (Lists) | Avatar → `/account` | "Lists" *(content-first; not "Home")* | DocsHelpButton → `/docs#lists` |
| `/budgets` | Avatar → `/account` | "Budgets" | DocsHelpButton → `/docs#budgets` |
| `/budgets/[budgetId]` | Back → `/budgets` | Budget name | progress bar (own row) + DocsHelpButton → `/docs#budgets` |
| `/cards` | Avatar → `/account` | "Cards" | DocsHelpButton → `/docs#cards-imports` |
| `/account` | Avatar → `/account` *(self-link, see State Patterns)* | "Account" | — *(no matching guide content; unchanged)* |
| `/upload` | Avatar → `/account` | "Upload" | DocsHelpButton → `/docs#cards-imports` |
| `/upload/bulk/[sessionId]` | Back → prior step | Session/step label | DocsHelpButton → `/docs#cards-imports` |
| `/upload/conflicts` | Back → landing (`onBack`) | Conflicts title | DocsHelpButton → `/docs#cards-imports` |
| `/upload/review/[sessionId]` | Back (`onBack`) | Row/merchant title + remaining-count details | DocsHelpButton → `/docs#cards-imports` |
| `/upload/session/[sessionId]` | Back → prior step | Session label | DocsHelpButton → `/docs#cards-imports` |
| `/docs` | Back → referring page | "Finance Helper" *(exception — see below)* | — *(self-referential; no help-on-help)* |
| `/sign-in` | Back → `/` | "Finance Helper" *(exception — see below)* | — *(pre-auth; no docs content gated)* |
| Public landing (`/`) | none | none | — *(unchanged, no chrome)* |

**Title exceptions:** `/docs` and `/sign-in` keep the app brand name instead of content-first titles because they're not "inside" the tab-bar IA — a returning/unauthenticated user needs orientation ("what app is this") more than content labeling. Every other row follows content-first without exception, including `/home`, closing the "Home" vs. "Lists" ambiguity from the original critique.

**Superseded row:** the prior `docs-tutorials-page` spine listed `/home` as having "no matching guide content, no help icon shown." That's now incorrect — `/home` is the live Lists surface (`/lists` is a dead redirect route) and carries the Lists help icon. This table's `/home` row is the current source of truth.

**Open gaps found while grounding this table** (not yet implemented, flagged for follow-up, not invented here):
- `/budgets`, `/cards`, `/upload` currently ship with **no title and no leading slot at all** — trailing-only chrome. Under this spec they need a title added (content-first) and the Avatar leading slot wired in, matching `/home`'s pattern.
- `/account` currently has **no chrome header at all** (`app/account/page.tsx` renders `AccountMenu` directly). Under this spec it needs a title ("Account") added; its leading-slot avatar would self-link to the page already showing, so treat it as non-interactive on this one page only (see State Patterns).

## Voice and Tone

Titles are short nouns matching the page's primary content, sentence case, no punctuation ("Lists", "Budgets", "Cards", "Account", "Upload") — never a verb phrase, never restating the app name (that's `/docs`/`/sign-in`'s job only). `DocsHelpButton` tooltip/aria-label stays fixed at "Learn more" per the existing docs-tutorials-page spine — unchanged here.

## Component Patterns

- **chrome-leading-avatar** (behavioral) — on top-level tab roots, the `Avatar` is wrapped in a real navigational link to `/account` (Next.js `Link`, not a button+router.push, so it's a true anchor — middle-click/open-in-new-tab works). Pointer cursor, hover/focus ring per DESIGN.md. On `/account` itself, the same avatar renders but is **not** wrapped in a link (navigating to the page you're already on is a no-op that would still show a misleading interactive affordance) — render as a static, non-focusable element on that one page only.
- **chrome-leading-back** (behavioral) — unchanged from current `AppShell` implementation: ghost `IconButton`, runs `onBack()` if provided else `router.push(backHref)`. Takes priority over `leading` if both are somehow set (back semantics always win — a page mid-flow should never lose its way back).
- **chrome-trailing-order** (behavioral) — when a trailing slot has more than one action, `DocsHelpButton` is always last (outermost/rightmost). No page currently combines it with another trailing action, but this ordering rule is the contract for any future addition (e.g. a page-specific menu button would go *before* the help icon, not after).
- **chrome-title-content** (behavioral) — title text is owned by the page/panel component closest to the actual content (mirrors current pattern: `*Chrome.tsx` wrapper components or the panel itself calls `useChromeHeader`), not hardcoded in `AppShell`. This spec doesn't change *where* the call happens, only *what* title string it must pass.

## State Patterns

- **Leading avatar — default**: shows the signed-in user's `Avatar` (photo or initials), no ring.
- **Leading avatar — hover/focus**: 2px accent ring appears (`{components.chrome-leading-slot.avatar-hover-ring}`), cursor becomes pointer — the fix for "looks tappable but isn't."
- **Leading avatar — on `/account`**: static, no ring, no pointer cursor, not in tab order (since it performs no action there).
- **Leading — empty**: reserved box, no visual placeholder (not a skeleton, not a dot) — just whitespace matching the box width.
- **Title — loading**: pages that fetch a name before showing a title (e.g. `/budgets/[budgetId]`) keep prior behavior: show nothing in the title slot until the name resolves, rather than a flashing skeleton (unchanged from current implementation, codified here as intentional).
- **Trailing help icon**: unchanged from `docs-tutorials-page` spine — present when a docs mapping exists for the page, otherwise the slot is simply narrower (no disabled/greyed icon).

## Interaction Primitives

- Tap/click on the leading avatar (top-level tabs only) → standard in-app navigation to `/account`.
- Tap/click on the leading Back button → `onBack()` if set, else `router.push(backHref)` — unchanged.
- Tap/click on the trailing help icon → unchanged, navigates to the mapped `/docs#anchor`.
- No swipe-to-go-back or other gesture is introduced by this spec.

## Accessibility Floor

- Leading avatar link: `aria-label="Go to Account"` in addition to the `Avatar` component's own `aria-label={alias}` — screen reader users get both "whose avatar" and "where this goes" without relying on the visual ring.
- Leading avatar on `/account`: `aria-hidden="true"` (or no `aria-label`, no `tabindex`) since it performs no action on that page — must not appear as a focusable, purposeless stop.
- Both leading (avatar-link and Back button) and trailing (help icon) controls clear the WCAG 2.2 SC 2.5.8 24×24px target-size floor via the shared 40px slot box; adjacent-target spacing (`{spacing.header-gap}`, 8px) also clears the same SC's spacing requirement.
- Focus ring on the leading avatar link and the Back `IconButton` uses the same app-standard focus ring (3:1 non-text contrast against the transparent chrome background, per WCAG 1.4.11) — one focus-ring treatment for both slots, not two.
- Title truncation (`text-overflow: ellipsis`) must never hide the *only* label for the page — pages relying on a long dynamic title (e.g. a budget name) should keep the full string in the document `<title>` even when the visible chrome truncates it (existing Next.js metadata pattern, unchanged, just called out as a requirement here).

## Key Flows

**Priya, checking her spending between errands.** Priya opens the app mid-day to check Budgets before deciding whether to buy something. She lands on `/home` first (default route), sees "Lists" as the title — immediately she knows she's looking at her shared lists, not a generic dashboard, because the title matches what's actually on screen. She taps the Budgets tab; the header now reads "Budgets" with the same avatar in the same top-left spot. Climax: without reading any instructions, she taps her own avatar out of habit-formed muscle memory from *every other screen looking the same way* and lands on `/account` — she wasn't hunting for account settings, but the header's consistency made the avatar a reliable, learnable shortcut rather than a page-specific surprise.

**Devon, lost mid-import, wants out.** Devon is three screens deep in `/upload/review/[sessionId]`, reviewing a flagged transaction. He doesn't want to finish this row right now. The leading slot shows a Back arrow (not his avatar) because this is a sub-page with a clear parent step — he taps it and returns to the prior review screen, exactly where he'd expect. Climax: the leading slot never showed his avatar mid-flow, so he was never tempted to tap it and accidentally abandon the review session by navigating to `/account` instead of stepping back.
