---
name: finance-helper
status: final
sources:
  - {planning_artifacts}/prds/prd-finance-helper-2026-08-02/prd.md
updated: 2026-08-26
---

# finance-helper — Experience Spine

> Behavioral contract. Paired with `DESIGN.md` (Warm Balance + Soft-Ledger hybrid). This file owns *how it works*; `DESIGN.md` owns *how it looks*. **Spines win on conflict** with any mock, wireframe, or `.working/` artifact.

## Foundation

Multi-surface self-hosted **web** app: phone viewport + desktop browser. Not a native app. Primary Discovery journeys narrated on phone; desktop shares the same IA with wider layout (see Responsive & Platform).

UI system **unspecified** — Architecture chooses the stack. These spines own Warm Balance visual identity (`DESIGN.md`) and behavioral rules only.

Appearance: Light / Dark / System (both token sets in scope; default System). Product name: finance-helper (mark TBD in `DESIGN.md`).

**Out of v1 UI:** settlement recording, profile/settings product surface, expense-distribution dashboard tab, ML, trends, **individual-list** (origin cards, budget tabs — Epic 6).

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| First paint | App open (signed in) | Remembered last-opened list; if none → Lists homepage |
| Lists homepage | First paint fallback; navigate away from a list | All lists the user belongs to |
| Shared-expenses (list detail) | First paint (remembered), Lists homepage row, post-import landing | **v1 / `member_count ≥ 2`:** settle-up balances first; receipt/items newest-first below. **Post-v1 / solo:** individual-list (Epic 6) — origin spend first; Budgets tab; no settle chrome |
| Upload | Global Upload; also from inside a list | Pick PDF → Individual or Bulk review mode → ingest |
| Individual review | Upload (mode = Individual); Resume from Upload | One transaction at a time; assign / default / delete / undo; then ImportReviewSheet (grouped by list, per-row discard, one Save) *(amended 2026-08-21)* |
| Bulk review | Upload (mode = Bulk) | Assign/commit statements; list-context upload may pre-select destination for Bulk only |
| Parse comparison | Mid-review on parse failure | PDF evidence vs extracted rows → quarantine accept or dismiss |
| Card registration | Upload/detect unknown IBAN | Blocks review until user label + IBAN saved |
| Same-price conflict review | End of import when manual↔parsed matches | Card picker: Manual **or** Parsed; escape **“Not the same expense”** only after double-count confirm |
| Manual expense | Shared-expenses → add | Amount + description; payer defaults to signed-in user; optional origin (existing card / Cash / blank); list default split |
| Invite | Shared-expenses (list) | Invite member by email |
| Invitee signup | Invite email link | Email + password; lands on inviting list |
| Account menu | Chrome (minimal) | Sign out + password reset + **Language (EN/ES)** + **Theme (Light / Dark / System)** — **no** profile/settings surface |

**Not v1:** Distribution dashboard tab (desired post-v1). **individual-list** origin cards + budget list/detail (Epic 6, solo only; shared-list budgets later).

List-scoped upload pre-selects destination **only for Bulk** — does not change Individual default destination.

→ Composition reference: [`mockups/list-settle.html`](./mockups/list-settle.html) (shared-expenses / settle-up). Spines win on conflict.
→ Review chrome reference: [`mockups/review-individual.html`](./mockups/review-individual.html) (Individual review phone + desktop buttons). Spines win on conflict.
→ Layout personality discovery artifact: [`.working/directions-2-warm-balance.html`](./.working/directions-2-warm-balance.html) (Soft-Ledger hybrid). Spines win on conflict. Mocks that show “mark settled” / settlement recording are **not** product behavior in v1.

## Inspiration & Anti-patterns

- **Lifted from Splitwise:** who-owes-whom instantly scannable — the settle-up strip is the number the user came for (`{colors.owe}` / `{colors.owed}` amount chrome).
- **Rejected — bank apps (dense tables):** ledger rows stay airy Soft-Ledger hybrid; balances before receipts; no spreadsheet wall on open.
- **Rejected — bank jargon / product codes as UI language:** cards show the user’s label, not bank product names; copy stays plain (see Voice).
- **Rejected — hiding the number you came for:** shared-expenses (`≥ 2` members) opens on settle-up amounts, not buried under receipts or chrome. Solo post-v1 opens on **origin spend**, not settle.

## Voice and Tone

Microcopy. Brand feel (calm + clear) and visual posture live in `DESIGN.md`.

| Do | Don't |
|---|---|
| `You owe Partner ₡42,500` (plain + direct; amount in `{colors.owe}`) | Cheerleading, emoji celebration, exclamation streaks |
| `Partner owes you ₡…` (amount in `{colors.owed}`) | Bank jargon, IBAN/product codes in primary labels |
| Name the direction of debt clearly | Blame between peers (“you still haven’t…”) |
| Errors: what happened + what to do, clear + calm | Alarmist error theatre |
| Simplify copy: suggestion to reduce transfers | Ever saying **paid** for Simplify; ever looking like recording a bank settlement |

**Simplify (Story 5.8, on the balance strip):** must never say “paid” as if the app recorded a bank payment. **Settle** means the viewer already paid their “You owe” counterparties (that column is then clean). Settlement of money still happens outside the app; v1 does not write transfer ledger lines.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Settle-up strip | Shared-expenses top (`member_count ≥ 2`) | Three columns: You are owed · You owe · Balance (viewer net), CRC. Simplify → group plan; CopyButton → plain text. Settle clears the viewer’s payables (already paid). Incomplete-period disclosure below the island. Not a bank-settlement recording control. **Hidden on solo lists (Epic 6).** |
| Origin cards | Solo list detail top (Epic 6) | Period spend per origin (card / Cash / blank) for the statement-cycle period. Not issuer current balance. |
| Budgets tab / detail | Solo list (Epic 6) | List of budgets with caps; detail = cap + related transaction history. Attribution later in epic. Hide as primary UI when a second member joins. |
| Receipt row | Shared-expenses below strip | Newest-first. Tap → item detail / edit when those exist. FX: show enough original + converted CRC to audit. |
| List row | Lists homepage | Opens shared-expenses for that list. |
| Upload entry | Global + list chrome | Global reaches ingest always. From list: Bulk may pre-select that list as destination; Individual default destination unchanged. |
| UploadButton | Upload empty state | Icon-only square. Composes IconButton (focus, disabled, accessible name). Activates the hidden PDF picker. Idle: muted outline + File glyph. Hover: accent fill, accent outline at 2× SVG stroke, File-import glyph in page background. Busy: filled + spinner; picker disabled. Accessible name = Upload / Uploading. Visual spec: `{components.upload-button}`. |
| Review card (statement) | Individual review | One statement in focus. Outcomes: chosen list / default list / skip (or dismiss file). High-intent accept: **list picker first**, then commit gesture/button. |
| Review action buttons | Desktop Individual review | Same three outcomes as phone swipes; buttons are primary on desktop. |
| Parse comparison pane | Failure mid-review | PDF in lower half; extracted items above. Actions: accept with quarantine, or dismiss statement/file. |
| Quarantine disclosure | Shared-expenses (strip and/or period) | When incomplete data affects balances, disclose that balances may understate — do not silent-green the number. |
| Card registration prompt | Unknown IBAN | **Blocks** continuing review. Fields: user-chosen label + IBAN as match key. Fixed card→list routing is **after** this prompt, not inside it. |
| Same-price conflict cards | End-of-import conflict list | Per conflict: two cards — Manual \| Parsed. Pick exactly one survivor by default. Escape: **“Not the same expense”** (harder than the cards) keeps both only after confirm warning someone may owe more. Not swipe (swipe reserved for statement review). Same UI for hand-fixed↔re-parse conflicts. |
| Manual expense form | Add on list | **Amount**, **description**, **payer** (defaults to signed-in user); **origin** optional — dropdown of user’s existing cards, **Cash**, or leave blank; **Adjust split** disclosure for whole-line / absolute fragments / percentage (list default until opened). Save → newest-first row + settle-up updates immediately. Filter exists later to find/assign items with no origin. |
| Invite form | List | Email address → send. Unregistered path uses create-account email template. Invite email language matches the **inviter’s** current Account language (EN/ES). |
| Account menu | Global chrome | Sign out; password reset; **Language EN/ES** (remembered on account; first visit defaults from browser); **Theme Light / Dark / System** (remembered on account; defaults to System). No profile, avatars-as-settings, or preferences surface in v1. |
| Simplify suggestion | Shared-expenses strip (Story 5.8) | Group transfer plan (fewer payments, nets preserved). CopyButton copies plain text. Copy must not say “paid”; must not resemble bank-settlement recording. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold signed-in open | First paint | Last-opened list if remembered; else Lists homepage. |
| Empty lists | Lists homepage | User has only default personal list or none yet — surface exists; empty copy `[NOTE FOR UX: exact empty string not journeyed]`. |
| Empty receipts, balances clear | Shared-expenses | Settle-up still primary; receipts area empty below. |
| Settled / zero net | Shared-expenses strip | Clear zero / even state without celebration chrome. |
| Incomplete balance (quarantine) | Shared-expenses | Disclose that balance for the period may understate; quarantine-sourced statements remain identifiable as incomplete. |
| Parse failure alert | Individual review | Statement-scoped; does not auto-discard siblings in the same PDF. |
| Accept with quarantine | Comparison → continue review | Good rows import; unresolved stored; statement incomplete; user continues remaining statements. |
| Upload idle | Upload empty | Outlined `{components.upload-button}`; File glyph; picker enabled. |
| Upload hover | Upload empty | Filled `{components.upload-button}`; File-import glyph. Keyboard focus uses the same accent ring as primary buttons. |
| Upload in flight | Upload empty | Filled `{components.upload-button}` + spinner; control `aria-busy`; picker disabled. Reduce Motion: spinner may be static; busy name still announced. |
| Unknown IBAN | Upload / pre-review | Registration modal/sheet blocks review until labeled. |
| Same-price conflicts present | Post-review / pre-landing | Conflict list must be resolved (Manual or Parsed each) before confident settle-up; no silent merge. |
| Import commit summary | End of import | Imported N / skipped M duplicates; then conflicts if any; then land shared-expenses. |
| Invite sent | Invite | Confirmation invite went out (unregistered template path). |
| Invitee lands | After signup | Inviting household list with settle-up context — not blank home. |
| Review skip / dismiss | Individual review | Skip statement or dismiss file; remaining statements continue when applicable. |

## Interaction Primitives

**Phone (primary journey surface)**

- **Individual review:** swipe primary — **right** → chosen list (list picker first), **left** → configurable default list, **down** → skip.
- **High-intent accept:** open **list picker before** the accept swipe; swipe commits to the picked list.
- **Same-price / hand-fix re-parse:** conflict list → Manual \| Parsed cards; optional harder escape **“Not the same expense”** with double-count confirm. **Not swipe.**
- Tap to open lists, add expense, invite, Upload.

**Desktop**

- Same IA and outcomes; **buttons primary** for review (not swipe), labels mirror R/L/D outcomes.
- List picker still precedes high-intent Accept.
- Wider Soft-Ledger hybrid layout (see Responsive).

**Banned / constrained**

- No equal-status keep-both peer button on conflicts (confirmed “Not the same expense” escape only).
- No settlement-recording CTA in v1 (ignore mock “Mark settled” affordances).
- No profile/settings surface; account chrome stays minimal (language and theme allowed).
- Modal/sheet stacks stay shallow (registration and pickers are blocking interrupts, not nested labyrinths).

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (Warm Balance light/dark tokens including `{colors.owe}` / `{colors.owed}`).

- **WCAG 2.2 AA** across phone and desktop web surfaces.
- Review outcomes exposed to assistive tech as labeled actions (not gesture-only): desktop buttons; phone swipes must have equivalent accessible controls or announcements so outcomes remain operable without swipe.
- Screen reader: announce surface on navigation (e.g. list name + settle-up context **or**, post-v1 solo, individual-list / origin context); quarantine disclosure is announced, not color-only.
- Focus order follows reading order: settle-up strip → receipts **(shared)**; **solo Epic 6:** cycle selector → origin cards → tabs → receipts; comparison PDF/extracted regions labeled; conflict cards selectable by keyboard.
- Tap/click targets usable on phone viewport; Reduce Motion: no required motion to complete review, quarantine, or conflict pick.
- Language: UI strings available in EN and ES (see Internationalization); `lang` switches with locale.

## Responsive & Platform

Self-hosted responsive web — not native shells.

| Surface | Behavior |
|---|---|
| Phone viewport | Soft-Ledger hybrid: looser settle-up strip island, airier rows. Swipe-primary Individual review. Journeys J1–J7 narrated here. |
| Desktop browser | Same IA and flows; wider layout. Individual review uses **buttons** as primary. Not a separate product journey. |
| Appearance | Theme control: Light / Dark / System. System follows OS/browser; Light and Dark pin the Warm Balance token set. Preference remembered on account; default System. |

Distribution dashboard tab is post-v1 — do not reserve a primary nav tab for it in v1 chrome.

## Internationalization

EN + ES from v1.

- All user-facing chrome, errors, invite email templates, review outcomes, quarantine disclosure, and conflict picker labels ship in **English and Spanish**.
- Voice rules apply in both locales: plain + direct; no bank jargon; no peer blame; Simplify never uses a “paid” framing in either language.
- Currency display remains CRC-first for settle-up (`₡…`); locale affects copy and date formatting in UI, not the settle-up currency model.
- Card **user labels** are free text (whatever the user typed) — not translated by the product.
- Language control lives in **Account menu** (EN/ES); preference is **remembered on the account**. First visit defaults from browser/`Accept-Language`. Must not require a full settings surface.
- Theme control lives in **Account menu** (Light / Dark / System); preference is **remembered on the account**. First visit defaults to **System**. Must not require a full settings surface.

## Key Flows

### J1 — Sebas uploads after dinner (phone · Individual)

1. Sebas opens finance-helper already signed in; lands on remembered list or Lists homepage.
2. Starts Upload via global Upload (Individual tonight; not list-Bulk shortcut).
3. Picks a multi-statement BAC PDF from phone files.
4. Chooses Individual review (not Bulk).
5. Reviews **parsed transactions** one-at-a-time on a full-width card in normal page flow: list picker, then swipe-right to chosen list; swipe-left → configurable default; swipe-up → delete. Undo is a button on every platform, never a gesture. *(Amended 2026-08-20 and 2026-08-24 — see below.)*
6. Clean parses skip comparison; failures → PDF lower half vs extracted → quarantine accept or dismiss (see J3).
7. When the pending queue is empty, **ImportReviewSheet** opens: assigned items grouped by destination list; **per-row discard** (returns that row to the card queue); **one Save** at the bottom. Discard → card review → sheet again until Save. PDF stays until Save. *(Added 2026-08-21.)*
8. Completion summary (rows committed by destination list, deleted, zero-amount excluded, parse failures, imported N / skipped M duplicates); same-price conflicts if any (see J7).
9. Lands on shared-expenses for the list that received the most rows.

> **Amended 2026-08-20** — Sprint Change Proposal 2026-08-20 (row-level individual review).
> Step 5 originally read: *"Reviews statements one-at-a-time: list picker then swipe-right to
> chosen list; swipe-left → configurable default; swipe-down → skip / dismiss file."* Statement-level
> routing made Individual review functionally identical to Bulk. The reviewed unit is now the
> transaction; `up → delete` replaces skip; undo takes the down slot as a button, not a swipe.
> Steps 8–9 gained the completion summary's new counts and a defined "mostly fed" tiebreak.
> The authoritative spec for this flow is
> `_bmad-output/planning-artifacts/ux-designs/row-level-individual-review-2026-08-20.md`;
> the `mockups/review-individual.html` mockup in this run folder still depicts the old flow.
>
> **Amended 2026-08-21** — Sprint Change Proposal 2026-08-21 (ImportReviewSheet). Last-card is not
> session complete; Save on the sheet is.
>
> **Amended 2026-08-24** — code review of Story 4.13. Step 5 originally read "on a centered card
> over a dimmed backdrop." Story 4.13 shipped a full-width card in normal page flow instead (no
> scrim, not a modal) — reconciled here rather than reverted; see the story's Decision #5.
10. **Climax:** settle-up strip shows what changed — the number he came to update (`{colors.owe}` / `{colors.owed}`).

→ Review chrome: [`mockups/review-individual.html`](./mockups/review-individual.html).

Failure: statement parse fail → J3 branch; unknown IBAN → J6 blocks before review continues.

### J2 — Monse checks what she owes (phone · balances-only)

1. Opens app → household shared list (remembered or via homepage).
2. Top: three-column settle-up — You are owed | You owe | Balance (CRC).
3. Below: receipts newest-first (available to verify; not the goal).
4. Simplify **not** used this session (capability lives on this surface in Story 5.8; this night she only reads balances).
5. Single cycle already in view — no cycle picker tonight.
6. **Climax:** scannable pairwise CRC (who owes her / whom she owes) plus her net Balance — without bank-table noise.

→ Settle-up composition: [`mockups/list-settle.html`](./mockups/list-settle.html). Mock may still show an older single-hero strip; **spines and Story 5.8 win** until the mock is updated.

### J3 — Sebas hits parse failure mid-review (phone · branch of J1)

1. Mid Individual review, one statement fails parse → alert (statement-scoped).
2. Comparison: PDF lower half, extracted items above.
3. Accepts with quarantine — good rows import; unresolved stored; statement incomplete.
4. Continues remaining statements / finishes review.
5. Post-commit summary; lands on shared-expenses with **incomplete-data disclosure** for the period.
6. **Climax:** keeps progress on good rows and can leave, knowing balances may understate until resolved.

### J4 — Sebas invites Monse (unregistered) · two-act · phone

**Act A — Sebas**

1. On household shared list → invite by email.
2. Enters Monse’s address → sends.
3. Sees confirmation the invite went out (unregistered template path).

**Act B — Monse**

4. Opens invite email (create-account guidance).
5. Signs up (email + password).
6. Lands on the inviting household list (not blank home).
7. **Climax:** shared list with settle-up context visible — she can see who owes whom.

### J5 — Sebas adds manual expense (phone)

1. On household shared list → add manual expense.
2. Enters amount / description; payer defaults to Sebas (editable — e.g. when Monse paid); optionally sets origin (card / Cash / blank).
3. Optionally opens **Adjust split** for friends-style fragments; otherwise list default.
4. Saves → item appears newest-first under balances.
5. **Climax:** settle-up numbers update immediately.

### J6 — Unknown IBAN card registration (phone · mid-import)

1. Upload/detect surfaces unknown IBAN.
2. Registration prompt **blocks** review until completed.
3. Sebas enters user-chosen label; IBAN is the match key (label + IBAN only in this prompt).
4. Saves → continues into review/routing with card known (fixed routing afterward, not inside the prompt).
5. **Climax:** next import shows **his** label, not a bank product name.

### J7 — Same-price manual vs parsed (phone · end of import)

1. End of import lists same-price conflicts (no silent merge).
2. For each conflict: Manual and Parsed shown as cards; Sebas picks which stays (one survivor).
3. Escape: **“Not the same expense”** — harder than the cards — keeps both only after confirm warning someone may owe more. Same rule applies to hand-fixed↔re-parse conflicts.
4. **Climax:** confident the list will not double-count by accident before settle-up.

Interaction note: card picker only — swipe reserved for statement review.

## Spine-only backlog

Captured product behavior **without** a named journey / mock commitment yet. Build from spine tables until Finalize asks for visual coverage:

| Item | Notes |
|---|---|
| Simplify suggestions | On the balance strip; group plan + CopyButton; never “paid” as bank settlement; Settle = viewer already paid payables |
| Multi-cycle statement selector | When a list holds cards with different billing cycles |
| Reassign statement / rollback import batch | Correction after misfile or bad batch |
| Bulk assign upload | Mode exists in J1 choice; full session not narrated |
| Desktop upload button-parity | Buttons primary (decided); desktop session not separately journeyed |
| Standalone auth | Signup / sign-in / password reset outside invite (J4 covers invitee signup only) |

## Open gaps

- Empty-state copy for Lists homepage / empty receipts.
- Card→list fixed-routing UI after J6 (after registration; not journeyed as its own flow).
- ~~Simplify surface placement~~ **Closed 2026-08-26:** on the balance strip (Story 5.8); EN/ES microcopy still for Dev.

~~Closed 2026-08-03:~~ swipe R/L/D pinned; manual create fields (amount+description+payer+Adjust split); optional origin card/Cash/blank + no-origin filter; conflict C2 (survivor + confirmed not-same); locale in Account menu remembered; **theme Light/Dark/System in Account menu (default System)**.