---
name: ux-decisions
description: Centralized, topic-organized reference of durable UX/UI decisions for finance-helper. Compacted from 7 per-feature ux-designs/ runs (2026-08-03 → 2026-09-05). Consult this before consulting any individual run folder.
status: living-reference
updated: 2026-09-06
---

# UX Decisions — finance-helper

Single lookup for **what's true today** across visual design and behavior. Source-of-record spines remain in their dated `ux-designs/<run>/` folders (kept as historical record); this file exists so future UI work doesn't have to read all of them. Where a later run changed an earlier decision, only the current rule appears here — see "Superseded decisions" at the bottom for what changed and why.

---

## 1. Design tokens & visual system

**Brand:** finance-helper, "Warm Balance" palette — calm/clear household money app, no bank-app density, no celebration chrome. Name-only brand (no logo yet).

**Theme:** Light / Dark / System, default **System**. Preference remembered on the account (not per-device). Both token sets are locked — never ship light-only.

**Core colors** (light → dark):
| Role | Light | Dark | Use |
|---|---|---|---|
| Background | `#F7F3EC` | `#17140F` | Screen canvas |
| Surface | `#FFFCF7` | `#221E17` | Cards, islands, tab bar |
| Text | `#2A241C` | `#F0E9DC` | Primary ink |
| Muted | `#6E6456` | `#A89B88` | Chrome, captions, hints, section labels |
| Border | `#E2D8C8` | `#3A342A` | 1px hairlines only |
| Accent (moss) | `#3F6B45` | `#8FBB8E` | Primary actions, active tab, focus rings |
| On-accent | `#FFFCF7` | `#17140F` | Label on filled accent |
| Owe | `#A04936` | `#D48B78` | Amounts the viewer owes |
| Owed | `#2F6E48` | `#7EC794` | Amounts owed to the viewer |

Rules: owe/owed color is mandatory whenever polarity is shown (never neutral ink). Accent is for actions/selected-chrome only, never large fills behind body text. Borders are always 1px — never the 2px "Dense Ink" register. Avoid: purple finance clichés, cool slate bank blues, celebration red/green outside owe/owed semantics, gradients as atmosphere.

**Second accent (button-system, 2026-09-03):** a **new**, deliberately-colliding token also named `accent` — `#4356A3` light / `#ADBDFF` dark — used only for the `AccentButton` variant. It is **not** the same accent as the moss brand accent; always resolve `colors.accent` through the button-system spine when styling a button, through the base spine everywhere else. Promote this into the global palette next time the base spine is touched.

**Typography:** Petrona (serif) for brand wordmark, hero/strip amounts, inline money — tabular nums always. Manrope (sans) for everything else: chrome, body, buttons, tabs, labels. Never substitute Inter/Roboto as brand type. Weight range is medium-light (400–550); who-lines are sentence case, not tracked caps.

**Shape:** soft-but-not-pill. `sm`=8px (primary buttons), `md`=10px (cards/islands), `lg`=12px (larger sheets), `full` reserved (no pill CTAs). Buttons use a locked **2px** border uniformly (not the old 1–3px mix).

**Elevation:** tonal layering, not shadow theater. Canvas vs. surface contrast + 1px borders do the hierarchy work; no drop shadows for structure. The one sanctioned shadow is a soft, warm-tinted, low-opacity hover lift on buttons/drag handles — never cold black stacks or glow.

**Spacing:** ~4px rhythm (`space-1`..`space-6` = 4/8/10/12/14/16px), plus named insets (`strip-inset`, `page-gutter`, `nav-x`, `row-y`). Prefer these gutters over edge-flush layouts.

**Accessibility floor:** WCAG 2.2 AA everywhere, phone and desktop. UI ships in English and Spanish from v1.

---

## 2. Layout & navigation patterns

**IA:** mobile-first responsive web (not native). Desktop shares the **same IA** as phone, just wider — never a separate "dashboard" visual language. Phone is the primary narrated journey surface.

**Chrome header** (`AppShell` / `useChromeHeader` — current source of truth, supersedes any older per-page ad hoc choice):
- Three-slot row: `[leading 40×40] [title (+ optional details), flex-1, truncates] [trailing 40×40+]`. Fixed slot widths so title position never shifts based on state.
- Transparent, no fill/border/shadow — a quiet frame, never competing with content.
- **Leading slot**: Avatar (→ `/account`, gains 2px accent hover/focus ring) on top-level tab roots (`/home`, `/budgets`, `/cards`, `/upload`, `/account`); Back `IconButton` on sub-pages (back semantics always win if both are somehow set); empty/reserved box on `/docs` and `/sign-in`-adjacent edge cases. On `/account` itself the avatar renders but is **not** a link (no self-navigation affordance).
- **Titles are content-first**, short nouns, sentence case, no punctuation: "Lists" (not "Home"), "Budgets", "Cards", "Account", "Upload". Only `/docs` and `/sign-in` keep the app brand name instead (pre-auth / not "inside" the tab-bar IA).
- **Trailing slot**: page actions, with `DocsHelpButton` ("?" icon) always last/outermost. Icon-only, `aria-label="Learn more about {page}"`, tooltip text fixed to "Learn more". Shown only on pages with matching `/docs` content: Lists↔`/docs#lists`, Budgets↔`/docs#budgets`, Cards & Upload↔`/docs#cards-imports`. Never on `/account`, `/docs` itself, `/sign-in`, or the public landing page.

**Docs (`/docs`) IA:** three categories (Lists / Cards & imports / Budgets) as collapsible accordions, **collapsed by default**, each with a stable hash anchor; entries within a section also get their own anchor for deep-linking. Multiple sections may be open simultaneously (no forced single-open). No global search in this pass.

**Account menu:** sign out, password reset, Language (EN/ES), Theme (Light/Dark/System) — remembered on the account, first visit defaults from browser. No profile/settings surface beyond this.

---

## 3. Component conventions

**Buttons (`BaseButton` + Primary/Accent/Ghost variants):**
- Shared shell: flex-centered, `2px` border, `rounded.sm` (8px, never pill), flat idle (no shadow), hover = solid lift shadow + subtle `translateY(-1px)`, disabled = `opacity: 0.55` uniformly across variants (never "still looks its color").
- Primary & Accent share one mechanic: **idle = outline (transparent fill + colored border/label), hover = fills solid + label flips to on-color.** Ghost never fills at any state — border/label shift color on hover instead. Don't give Primary/Accent different idle→hover directions from each other; a genuinely different mechanic is a 4th variant, not a tweak.
- Sizes `sm`/`md`(default)/`lg` — padding + type scale only, no separate visual language.
- Transition is scoped to specific properties (background-color, border-color, box-shadow, transform) — never `transition: all` (caused a hover flicker with `background-clip: text`, which is why Primary no longer uses a text-knockout hover effect).
- `href` renders as a real `next/link` anchor, styled identically to the button form; `onClick` can still fire alongside for analytics, but `href` is the primary action — never used to fake a confirm-before-navigate.
- Loading state: spinner replaces `iconLeft`, `aria-busy="true"` (never also `aria-disabled` — busy ≠ permanently disabled).

**Chips:** `Chip` component with `tone="accent"` for automated/rule-driven state, `tone="muted"` for default/manual state, `tone="owe"`/`"owed"`/border variants for status. Never color-only — chip text itself always carries the meaning.

**ReceiptRow** (the canonical list/history row, reused across lists and budget history):
- Two-column base: title + date-caption stacked left, amount right.
- `secondaryChip` for attribution/status (e.g. rule vs. manual — accent vs. muted tone).
- `originAction` slot for a payer `Avatar` (only rendered when someone other than the viewer paid/owes — omitted entirely otherwise, no empty placeholder).
- Split/shared amounts: show the **viewer's own share**, never the transaction total. `netLabel` = viewer's share; `directionLabel` = "you owe"/"you're owed" caption above it; both omitted (falls back to plain `amount`) when the viewer paid/owns the whole line solo.
- `menuSlot` for row-level actions (e.g. unassign) — icon-only `IconButton` with a proper `aria-label`, not a text button, to avoid crowding a row that already carries a chip + amount + payer signal.

**Progress bars (`TopProgressBar`):** three-tier severity coloring — `<70%` owed/green, `70–90%` warn, `>90%` owe/red — shared between list tiles and detail-page top bars. Ratio `null` (missing/invalid cap) renders muted, never a false color.

**MinimalInput** (extracted, shared): underline-only text input — `border-none border-b-[1.5px] border-border`, muted placeholder, foreground text once filled. Use for any inline-rename-style field instead of re-deriving a bespoke input per surface.

**ChipPicker (generalized, mode-aware):** `single` mode = existing one-trigger-chip pattern; `multi` mode = selected values render as individual accent chips inline with an inline ✕ to remove directly (no panel needed to deselect), plus one trailing dashed "+" chip that opens a panel of not-yet-selected options (bounded height + scroll once the option count is large).

**Ghost/ephemeral entity cards** (pattern established by budget creation): a "create new X" entry point is **not** a separate form row or modal — it's a dashed-border version of the real card shape, sharing every structural slot (identity block, corner badge/circle, footer) so creating→created is a state change on one shape, not a navigation. A floating "+" badge (top-right corner, same visual family as other corner action badges) is the submit control; it's disabled/inert until the same validity rule the old form used, then becomes the accent-colored active control.

**Slider (percentage-split control):** thin vertical-bar handles (never fat/circular/pill), live tooltip during drag only (disappears on release), last segment's percentage is always computed (`100% − others`), never directly draggable. Keyboard: Tab cycles handles, Arrow ±1% / Shift+Arrow ±5%. 48px minimum track height on every platform (no shrinking on desktop).

---

## 4. Interaction & UX principles

**Empty states:** never a skeleton or placeholder dot for an empty chrome slot — just reserved whitespace matching the box width. For content lists, prefer a real one-line empty message + a CTA to fix it, not blank space.

**Loading states:** never literal "Loading…" text — see `[[feedback_no_loading_text]]` (SpinnerIcon always). Buttons show a spinner + `aria-busy`, not disabled text.

**Confirmation patterns:** high-stakes/irreversible-feeling actions (e.g. discarding a same-price "not the same expense" escape) require an explicit harder confirm step; routine actions (chip removal, unassign) are single-click with no confirmation. Don't add confirmation theater to reversible actions.

**Undo:** single-level only, no stack — a second undo immediately after a successful one is a no-op, not an error. Prefer button-triggered undo over a risky gesture axis when a surface already uses gestures on all four directions.

**Direction-mapped card review pattern** (individual transaction review): 4 always-visible edge actions (assign-default / assign-picked / delete / undo), each doubling as a swipe zone on touch — buttons are never swipe-only hints. The "cancel/undo" direction is intentionally button-only on every platform (not swipe) to avoid an accidental irreversible-feeling gesture on an axis that's otherwise used for destructive actions.

**Two-click inline rename/edit pattern:** first click primes (soft border, no input mounted), second click mounts the actual input and focuses+selects it. Deliberately not native `dblclick` — two clicks with any gap between them both count. Outside-pointerdown while primed *or* editing cancels back to idle, discarding the draft.

**Deep-link arrival cue:** when navigation lands a user on a specific in-page target (e.g. `/docs#anchor`), never rely on scroll-into-view + a time-limited color fade alone. Pair a persistent, non-color cue (a left border/outline matching the existing focus-ring style, persisting until next scroll/focus change — not a fixed timer) with programmatic focus move to the target's heading (`tabindex="-1"`, `.focus()` on mount) so keyboard/screen-reader users get the same "you're now here" signal sighted users get from motion.

**"New" indicator:** show a `Chip` (`tone="accent"`) rather than inventing a new visual language; visibility is date-based (same calendar day, local timezone), never a persisted per-item "reviewed" flag, and there is no explicit dismiss control.

**Accessibility floor (recurring rules, apply to every new component):**
- Focus-visible ring on every interactive element/state, colored to match the element's own idle border/accent color — one consistent treatment app-wide.
- Color is never the only signal — pair with text, shape, or icon change.
- Icon-only controls always get a real `aria-label`, not tooltip-only.
- Collapsed/hidden content must be removed from the accessibility tree (native `hidden` or synced `aria-hidden`), not just visually collapsed via CSS.
- Respect `prefers-reduced-motion` on any new animation (chevrons, fades, transitions) — snap instead of animate, and never make motion the *sole* carrier of state.
- Decorative illustrations are `aria-hidden` **only** as long as they restate adjacent text; an illustration that encodes new information (e.g. a branching diagram) must gain real alt text instead.
- Touch/click targets clear WCAG 2.2 SC 2.5.8 (24×24px minimum, adjacent-target spacing) — the shared 40px chrome slot boxes and 8px header gap already satisfy this; keep matching that budget in new chrome-adjacent controls.

---

## 5. Content & copy conventions

**Voice:** plain, direct, second-person, task-first. "You owe Partner ₡42,500" — not cheerleading, no emoji, no exclamation streaks, no bank jargon or product codes in primary labels. Numbered instructional steps are imperative ("Tap **Add expense**", not "You can tap Add expense if you want to").

**Forbidden framings:** never say "paid" or otherwise imply the app recorded a real bank settlement (v1 has no settlement-recording feature) — this applies to the Simplify suggestion copy specifically, and by extension to any future settle-adjacent copy. Never blame between peers ("you still haven't…"). Errors state what happened + what to do, calmly — no alarmist error theater.

**Fixed microcopy:** the docs "?" affordance's tooltip/aria-label is always exactly **"Learn more"** — never varies per page, so it stays a learnable, recognizable affordance.

**i18n:** all user-facing chrome, errors, email templates, and review/help copy ships in English and Spanish from v1. Currency display stays CRC-first for settle-up regardless of locale — locale affects copy/date formatting only, not the money model. User-entered free text (e.g. a card's label) is never auto-translated.

---

## Superseded decisions (resolved by taking the newer rule)

- **`/home` docs-help mapping:** the 2026-09-02 docs-tutorials spine listed `/home` as having no matching guide content / no help icon. The 2026-09-03 chrome-header spine supersedes this explicitly — `/home` *is* the live Lists surface and does carry the Lists help icon. **Kept: chrome-header's row** (`/home` → `/docs#lists`).
- **Button hover mechanic (Primary):** an early button-system draft used a `background-clip: text` knockout hover effect. Dropped after review — caused a WebKit hover-enter/exit white flash that couldn't be fixed by scoping the transition. **Kept: solid-fill hover, same mechanic as Accent.**
- **Button hover mechanic (Accent):** an early draft had Accent idle *filled*, hover *outlined* (inverted from Primary). Read backwards in review (filled-idle looked already-active). **Kept: idle-outline → hover-fill, matching Primary.**
- **Deep-link arrival cue:** the first docs-tutorials draft relied on a 1-second color-only fade as the sole "you've arrived" signal (flagged in the 2026-09-02 accessibility review as a WCAG 1.4.1 violation and a miss-prone timer). **Kept: persistent non-color border/outline + explicit focus move to the target heading**, with the fade only as a secondary, `prefers-reduced-motion`-aware reinforcement.
- **Budget-history unassign control:** originally a labeled text `UnassignButton`. **Kept: icon-only `IconButton` with `aria-label`** inside `ReceiptRow`'s `menuSlot`, since the row now also carries an attribution chip and payer avatar and a text label would crowd it.

## Content deliberately dropped (pure narrative / no longer actionable)

- All "Key Flows" persona narratives (Mary/Bob/Carol/Priya/Devon/Sebastian/Mara/etc.) across every run — useful for the original design conversation, not for looking up a rule.
- The custom-split-slider's three fully-narrated flows and its `[ASSUMPTION]`/`[NOTE FOR UX]` hedges not later resolved — kept only the resulting rules.
- `row-level-individual-review-2026-08-20.md` — an entire backend/data-model + migration + API-shape spec (DB columns, endpoints, error codes, files-touched list) for the individual-review rewrite. This is an implementation spec, already built, and belongs to engineering history, not a UX lookup; only its two still-relevant *interaction* patterns were kept above (the 4-direction card-review gesture mapping, the two-click inline-edit pattern, and the "New" badge date rule).
- `ux-finance-dashboard-2026-09-02/review-accessibility.md` — an accessibility review whose findings were already folded into that run's `EXPERIENCE.md` (visible directly in the current file); the review itself is now a superseded diff, not new information.
- The docs-tutorials-page's specific `/docs` example key-flow content, the button-system's full prop table (`variant`/`size`/`case`/`href`/etc. — implementation detail, read the component source), and the ghost-budget-card's full state table narrative — condensed to the "ghost card" convention entry above.
- Boilerplate present in every run (WCAG 2.2 AA floor, mobile-first framing, "no shadcn defaults as brand", "spines win on conflict") — stated once here instead of seven times.
