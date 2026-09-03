---
name: docs-tutorials-page
description: Behavioral spine for the refactored /docs page — accordion IA, contextual per-page help entry points, and deep-linking between app screens and their guide.
status: final
updated: 2026-09-02
---

# EXPERIENCE.md — docs-tutorials-page

Behavioral spine for the `/docs` refactor. Visual identity lives in [`DESIGN.md`](./DESIGN.md) (this run) and the base [`finance-helper` spine](../ux-finance-helper-2026-08-03/EXPERIENCE.md); this file owns information architecture, states, and interaction — not appearance. Spines win on conflict with any mock.

## Foundation

Form factor: **mobile-first responsive web**, same PWA-style shell as the rest of Finance Helper (bottom `TabBar`, `AppShell` header with a `trailing` slot). No new UI kit — components are the existing `IconButton`, `Disclosure`, and page-header primitives already in `ui/components`. Accessibility floor: WCAG 2.2 AA (inherited from `finance-helper`).

## Information Architecture

`/docs` keeps its three existing categories — **Lists**, **Cards & imports**, **Budgets** — now rendered as collapsible accordion sections instead of a flat scroll:

- Each section has a stable hash anchor (`/docs#lists`, `/docs#cards-imports`, `/docs#budgets`).
- Each `DocEntry` within a section keeps its own anchor (`/docs#lists-splitting-an-expense`) so a help button can deep-link to one specific guide, not just its category.
- Sections are **collapsed by default** on a bare `/docs` visit. Arriving via a hash anchor auto-expands the target section, scrolls the target entry into view, **and moves DOM focus to the entry's heading** (`tabindex="-1"`, focused on mount) so keyboard and screen-reader users get the same "you're now here" signal a sighted user gets from scroll + highlight — not just a scroll with no landing confirmation.
- No global search input in this pass — the accordion collapse/expand is the primary way to reduce the page to a scannable list of category titles.

Every authenticated page that has matching guide content gets a **contextual entry point back into this IA**:

| App page | Help icon target |
|---|---|
| `/lists`, `/lists/[listId]` | `/docs#lists` |
| `/budgets`, `/budgets/[budgetId]` | `/docs#budgets` |
| `/cards` | `/docs#cards-imports` |
| `/upload`, `/upload/bulk`, `/upload/conflicts`, `/upload/review`, `/upload/session` | `/docs#cards-imports` |
| `/home`, `/account` | none — no matching guide content, no help icon shown |
| Public landing (`ui/app/page.tsx`) | unchanged existing link to `/docs` (no header icon) |

## Voice and Tone

Entry bodies keep the existing plain, second-person, task-first voice ("Start a list to…", "Register the cards you pay with so…"). Numbered steps are imperative and terse ("Tap **Add expense**", not "You can tap Add expense if you want to"). Tooltip/aria-label copy for the help affordance is fixed: **"Learn more"** — never varies per page, so it stays a recognizable, learnable affordance.

## Component Patterns

- **help-icon-button** (behavioral) — icon-only `IconButton` in the page header's `trailing` slot. Tapping navigates to that page's mapped `/docs#…` anchor in the same tab (not a new tab — this is in-product help, not external docs). On pages without a mapped guide, the slot is simply empty; no disabled/greyed icon.
- **accordion-section** (behavioral) — one open section at a time is not enforced; a user may have multiple sections open simultaneously (low cost, avoids surprising re-collapse of a section they were reading). Toggling is via tap on the header row or `Enter`/`Space` when focused.
- **doc-entry** (behavioral) — title always visible once its section is open; body, illustration, and step list render inline, no further nesting/click-to-expand within an entry. A "deep-link" affordance at the bottom of the entry (when relevant, e.g. "Creating a list" → `/lists`) navigates to the live screen where that action happens.

## State Patterns

- **Default (no hash)**: all three sections collapsed, showing just titles — the page is a short scannable list on first load.
- **Deep-linked (hash present)**: target section expanded, target entry scrolled to and given a persistent non-color-only highlight — a left border/outline in `{finance-helper.colors.accent}` matching the app's existing focus-ring style, paired with (not replaced by) a fade-in of `{finance-helper.colors.accent}` background at low opacity. The border persists until the user's next scroll or focus change, not on a fixed timer — a 1-second-only cue is too easy to miss for a user still re-orienting after navigation. With `prefers-reduced-motion`, the highlight appears instantly (no fade) but still persists per the same rule — never the sole arrival cue, so nothing load-bearing is lost. Other sections remain collapsed.
- **Keyboard focus**: accordion headers are focusable and show the app's existing focus ring; `help-icon-button` uses that same app-standard focus ring (must clear 3:1 non-text contrast, WCAG 1.4.11, against both the page background and the icon's transparent-background hover fill). Expand/collapse state is announced via `aria-expanded` on the header button, and collapsed panels are removed from the accessibility tree (native `hidden`, or `aria-hidden` kept in sync with `aria-expanded`) — not just visually collapsed via CSS. Chevron rotation also respects `prefers-reduced-motion` (snaps instead of animating).
- **No empty/error/loading state** — this page is static content, no network fetch, so these states don't apply.

## Interaction Primitives

- Tap/click on an accordion header toggles that section; no swipe gestures introduced.
- Tap/click on a deep-link affordance is a standard in-app navigation (Next.js `Link`), not a modal or new tab.
- Tap/click on a contextual help icon is a standard in-app navigation to `/docs#<anchor>`.

## Accessibility Floor

- Help icon: `aria-label="Learn more about {page name}"` (e.g. "Learn more about Budgets") even though the visible affordance is icon-only with a hover tooltip — screen reader users get the same "Learn more" intent without relying on hover.
- Accordion headers are real buttons (or `Disclosure`-pattern elements) with `aria-expanded` / `aria-controls`, keyboard-operable, matching the existing `Disclosure` component's a11y contract already in `ui/components/Disclosure`.
- Illustrations are `aria-hidden` decorative SVG (mirrors the landing page's `FeatureCard` icon treatment) — they restate the adjacent text, not new information, so they carry no independent alt text.
- Deep-link affordances use descriptive link text ("Go to Lists", not "Click here"), rendered only as a standalone block-level row at the bottom of the entry — never inline within `entry-body` prose — since the color+icon distinction it relies on (no underline at rest) is only sufficient outside running text (WCAG 1.4.1).
- Illustrations may never be the sole carrier of any step or branch not already present in the entry's body or step-list text — if a future illustration encodes information beyond what the adjacent prose states, it can no longer be `aria-hidden` and must gain real alt text instead.
- `help-icon-button` touch target: the 2.25rem (36px) box already includes padding beyond the visual glyph and clears the WCAG 2.2 SC 2.5.8 24×24px floor; header layouts must additionally keep no other interactive element within the icon's own box width of spacing, since SC 2.5.8 also applies to adjacent-target spacing, not just individual target size.

## Key Flows

**Mara, mid-import, unsure what happens to a leftover cent.** Mara is reviewing an imported bank statement on `/upload/review` and just split a shared grocery run three ways — $10.01 doesn't divide evenly. She taps the **"?"** icon in the header. It drops her straight into `/docs#cards-imports`, but she actually wanted the splitting-cents answer — she taps back to `/docs`, opens the **Lists** section, and finds **"Splitting an expense"**, which explicitly states the leftover cent goes to whoever created the list. Climax: she closes `/docs`, returns to her import, and finishes the review confident about a number that used to look like a bug.

**Devon, brand new, deciding whether to sign up.** Devon lands on the public marketing page, skims the three feature cards, and clicks the existing "Tutorials & accessibility guide" link before committing to creating an account. `/docs` loads with everything collapsed — a short, three-line list of what's possible, not an overwhelming manual. He opens **Budgets**, reads "Reading budget progress," and the numbered steps plus the small linear illustration convince him the feature is as simple as it sounds. Climax: he goes back and taps **Create an account**, having self-served the answer to "is this too complicated for me?" without ever signing in.
