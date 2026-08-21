---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/row-level-individual-review-2026-08-20.md
---

# finance-helper - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for finance-helper, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: A new user can create an account with email and password; duplicate emails are rejected; passwords are hashed; on success the user is authenticated and receives a personal list (FR-5).

FR-2: A registered user can sign in with email and password and can sign out; invalid credentials fail with a generic message; after sign-out, protected actions require authentication again.

FR-3: A user can reset a forgotten password via email; reset requires proving control of the account email; a completed reset invalidates the prior password.

FR-4: Email verification is performed when required for invitation delivery or secure account recovery; if not required for a deployment path, signup still succeeds under FR-1.

FR-5: On successful signup, the system creates exactly one personal list owned by the new user, available as a review destination (not hardwired as the only default — see FR-12).

FR-6: An authenticated user can create additional named lists they own; list names are user-visible and editable by the owner.

FR-7: A list owner can invite another person by email; registered users receive a join invitation; unregistered addresses receive a signup-oriented invitation and land on the inviting list after signup; delivery uses transactional email.

FR-8: List members can see the shared-expenses view and participate in splits; visibility is membership-based; non-members cannot read expenses or balances; no owner-vs-viewer product role among members.

FR-9: New lists default to an even split among members; the list default can be changed to a standing percentage split that must sum to exactly 100%; new items inherit the current list default until overridden; only the list owner may edit the standing default split.

FR-10: When creating or interacting with an item (or attributing a whole receipt), a user can override the list default by whole-line assignment to one member, absolute amounts per member summing to the total, or a percentage split summing to 100%; overrides produce per-transaction share allocations used by balances.

FR-11: When a card's statement is imported, the user chooses fixed-list mode (card feeds one chosen list) or review-routing mode (per-statement/upload destination with configurable default list); v1 enforces at most one active fixed list per card; design must not foreclose multiple fixed lists later; reassignment remains available.

FR-12: Under review routing, the user sets which list is the default low-effort destination (personal or any list they belong to); changing it affects subsequent low-effort accepts; explicit destination choice and skip remain available.

FR-13: An authenticated user can upload a bank statement PDF through the web UI (including phone viewport); unsupported formats are rejected with a clear error.

FR-14: On upload, the system detects bank and product via override → filename → content; unknown or ambiguous statements fail the import with a clear error — no silent mis-association.

FR-15: A single upload may decompose into N statements, each with its own product identity and destination; failure or skip of one does not automatically discard the others; multi-statement behavior is covered by adapter contract tests (including Promerica stub).

FR-16: When importing for a card, the user chooses fixed-list mode or review-routing mode (FR-11); fixed-list commits to the chosen list (subject to parse/failure handling); review-routing proceeds to bulk or individual review.

FR-17: Before commit under review routing, the user chooses bulk (whole upload to one list) or individual (one parsed transaction at a time, across the whole session, on a centered card over a dimmed backdrop); phone Individual uses true swipes (right → chosen list after picker, left → configurable default, up → delete) with undo as a button on all platforms; desktop uses labeled buttons for the same four outcomes. *(Amended 2026-08-20.)*

FR-18: In individual review, each parsed transaction can be assigned to a chosen list, assigned to the configurable default (FR-12), or deleted (never stored); undo is single-level and survives a reload; zero-amount transactions are excluded before review and reported at completion; discarding a partially reviewed session keeps already-assigned rows; assignment commits only after parse success or explicit accept-with-quarantine; parse failures are reported at completion. *(Amended 2026-08-20.)*

FR-19: Every shared expense has an explicit editable payer; on statement import and manual entry, payer defaults to the current user; changing payer updates who others should reimburse in settle-up.

FR-20: After a successful import (or re-import), the user is told how many new rows were imported and how many duplicates were skipped; overlapping parsed re-uploads do not duplicate canonical identities; ordinary parsed-vs-parsed duplicates never interrupt mid-import.

FR-21: A user can add individual expense items to a list without waiting for statement import; create requires amount, description, and payer (defaults to current user); optional origin is an existing card, Cash, or blank; a filter supports later assignment of no-origin items; Adjust split disclosure offers whole-line / absolute per member / percentage (list default until opened); provenance distinguishes manual from parser rows; items appear in receipt list and settle-up.

FR-22: Same-price collisions between a parsed line and an existing unresolved manual entry are not auto-merged; collected and shown at end of import; default resolution pick Manual or Parsed (one survivor); escape “Not the same expense” keeps both only after double-count/overpay confirm (harder than survivor pick); same price = equal amount+currency on related lists; date window list-configurable with product default ±3 calendar days (AD-10).

FR-23: When the user confirms a manual entry and bank line are the same expense, the system stores the manual label as an alias for that bank description; v1 does not use aliases for ML categorization.

FR-24: If a statement cannot be parsed correctly on the automatic path, the system alerts and does not process that statement into the ledger on its own; failure of one statement does not reject siblings by default; required data is never silently dropped.

FR-25: On parse failure, the system shows the original PDF beside extracted items (on phone, PDF in the lower half); comparison appears only on failure; view is usable on mobile.

FR-26: From the comparison view the user may accept with quarantine (parsed rows import; unparsed stored unresolved; statement marked incomplete) or dismiss the statement or entire file; nothing partial enters the ledger without an explicit human decision in front of the evidence.

FR-27: Unresolved rows can be edited by hand against the rendered PDF; hand-entered values store provenance distinguishing them from parser rows; editing works on phone viewport.

FR-28: When a re-upload produces a parsed row that matches or near-matches a hand-fixed row, the system prompts with the same FR-22 resolution UI (Manual|Parsed; confirmed “Not the same expense”); never silently duplicates.

FR-29: A user can reassign a statement filed to the wrong list to another list they belong to; balances on both lists reflect the move; share allocations follow destination list rules unless item overrides exist.

FR-30: A user can remove a whole import batch (journaled-batch model); batch removal undoes that import’s ledger effect; re-import afterward has no leftover duplicates from the rolled-back batch.

FR-31: New banks/products are added as adapters declaring `{bank, product_id, account_kind}` without rewriting core import, dedup, or list logic; detection uses override → filename → content; section policies may differ by account_kind.

FR-32: Must-parse ledger lines carry posted_date (ISO-8601), signed amount, ISO 4217 currency, product_id, line_type, external_ref when provided, plus provenance; line types include at least purchase, payment, interest, fee, voluntary_service, credit_note, installment_schedule, balance_forward, other; section policies must_parse / best_effort / ignore; unmapped sections quarantine; installment schedules are distinct and excluded from shared totals without double-counting purchases.

FR-33: Adapters collapse dual CRC/USD columns to a single (currency, amount) before identity; prefer nonzero column; if both nonzero, prefer CRC.

FR-34: Primary identity is (product_id, posted_date, currency, amount, external_ref); fallback when refs missing/unstable remains idempotent; re-import never duplicates; ref quality exposed as stable/derived/absent; every import is a journaled batch.

FR-35: For a supported BAC credit product, the synthetic BAC credit-card fixture import persists every must-parse line with required canonical fields and zero manual edits (v1 parsing exit bar).

FR-36: v1 includes a Promerica stub or contract-test adapter proving extension without modifying core import/dedup/list logic, including multi-statement; real Promerica parsing is out of scope until samples exist.

FR-37: Cards are registered with a user-chosen label and stable bank identity (primarily IBAN); matching IBAN reuses the card and its label as the import identifier; unknown IBAN prompts registration before destination routing; card registry is user-scoped generic vocabulary; fixed-list vs review-routing (FR-11) attaches to the registered card.

FR-38: A list member can open a shared-expenses view for that list; non-members cannot; usable on mobile and desktop.

FR-39: The view’s default period aligns to statement/billing cycles; when cards on the list have different cycles, the user selects which statement/cycle to view.

FR-40: Shared balances and settle-up figures are in CRC; non-CRC amounts convert using exchange rate for purchase/statement date; original amounts retained for audit; converted lines show enough original + CRC to audit FX.

FR-41: Top of the view shows how much each person needs to pay (CRC) to settle the period, with optional simplify into fewer suggested transfers; simplify preserves net balances and does not record payments (v2).

FR-42: Below settle-up, the view lists items for the period newest-first in a receipt-like format; incomplete/quarantined contribution is disclosed on this screen.

FR-43: If quarantined or unresolved rows affect the period, balances disclose that they are incomplete; UI does not present a confident settle-up total that silently omits unresolved purchases.

FR-44: v1 balances are computed from per-transaction share allocations and payer such that a future payments/settlement ledger can draw them down without a model rewrite; recording payments remains out of scope for v1.

FR-45: Only included line types (purchases and classified purchase reversals) contribute to shared settle-up; excluded types may be stored but do not affect who owes whom; posted-date and period boundaries use America/Costa_Rica.

### NonFunctional Requirements

NFR-1: Passwords are hashed with a modern adaptive algorithm; plaintext passwords are never stored or logged.

NFR-2: Real statements, personal names, account identifiers, and transaction data are never committed to the repository; runtime data lives in configured external storage; fixtures are anonymized or synthetic.

NFR-3: API and UI enforce that expense and balance data is only readable/writable by authenticated members of the relevant list (and owners where owner-only actions apply).

NFR-4: Re-importing the same or overlapping statement must not corrupt balances via duplicate ledger lines (FR-20, FR-34).

NFR-5: Every import is an atomic journaled batch that can be rolled back (FR-30).

NFR-6: Any settle-up or balance figure derived from incomplete/quarantined data must be disclosed as such (FR-43).

NFR-7: Core flows — upload/review, failure comparison with PDF, manual item entry, shared-expenses settle-up — are usable on phone and desktop browsers.

NFR-8: Automatic paths fail loudly on unknown/ambiguous detection and unparseable must-parse content; humans may override only through explicit comparison/quarantine flows.

NFR-9: Application and PostgreSQL run in containers; the database volume is outside the repository on the operator’s machine/server.

NFR-10: Invite and password-reset email require operator-configured SMTP (or equivalent).

NFR-11: New bank/product support is an adapter (+ fixtures/stub) without modifying core import, dedup, or list logic (FR-31, FR-36).

NFR-12: Upload → detect/split → review for a typical single multi-card BAC PDF completes within an interactive session on the operator’s self-hosted hardware — review is not an overnight batch job.

NFR-13: PostgreSQL schema evolution is supported via migrations; upgrades must not require discarding the operator’s data volume.

### Additional Requirements

**Starter / scaffold (Epic 1 Story 1 impact):**
- Greenfield Compose stack: `db` (Postgres 16) + `api` (FastAPI/Python 3.12+) + `ui` (Next.js 16 standalone / React 19) + host reverse proxy; no Redis/worker in v1 (AD-2).
- Hexagonal layout: `api/domain`, `api/application`, `api/adapters/{bank,persistence,fx,email}`, `api/api`, `ui/` — UI calls HTTP only (AD-1).
- Structural seed includes `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, `.github/workflows/ci.yml`, synthetic PDF fixtures under `api/tests/fixtures/pdf/`.

**Architecture decisions binding implementation:**
- Import Session (staging) vs Import Batch (journaled commit per statement accept); rollback targets `batch_id` (AD-4).
- Money: Postgres NUMERIC + Python Decimal; never float; ISO 4217 beside amount (AD-5).
- Split remainder after floor-division goes to list creator (AD-6).
- FX: BCCR daily rate for purchase/statement date; nearest-prior + `fx_fallback` flag if missing; no FX override in v1; materialize `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback` at commit (AD-7).
- Auth: httpOnly Secure cookie sessions (JWT or opaque); same-origin via reverse proxy and/or Next BFF; Bearer-in-localStorage forbidden; argon2 or fastapi-users (AD-8).
- Phone Individual review must implement true swipe; desktop buttons primary; R/L/D mapping locked (AD-9).
- Same-price / hand-fixed conflict window: list-configurable, default ±3 calendar days; shared Manual|Parsed + confirmed escape UI (AD-10).
- CI fixtures: synthetic PDFs with known geometry + golden expected rows; real statements operator-only (AD-11).
- DESIGN.md + EXPERIENCE.md are binding UX companions; kits may supply unstyled primitives only (AD-12).
- Branch naming `<type>/<epic>/<us-id>`; single app SemVer; TDD for parsers/domain; CI merge gate lint + api pytest goldens + ui typecheck/lint + critical ui tests (AD-13, AD-14, AD-15).
- CanonicalLine shared staging/ledger contract; adapters emit CanonicalLine; domain alone computes dedup identity at commit (AD-16, AD-18).
- Quarantine durable on Statement after accept-with-quarantine; balance views disclose incompleteness (AD-17).
- Membership ACL only; cards first-class (label + IBAN); unknown IBAN blocks import until registration (AD-19, AD-20).
- v1 settle-up is computed shares only; taxonomy must allow inter-member transfer line type without feeding settle; no payment recording (AD-21).
- Ops: local + homelab Compose overlays; Alembic on api startup; `/health` on api and ui; volumes/secrets outside repo; structured logs + healthchecks (AD-22).
- Stack pins (verified 2026-08-03): FastAPI 0.141.x, SQLAlchemy 2.0.x, Alembic 1.18.x, pdfplumber 0.11.x, aiosmtplib ≥5.1.2, react-pdf 10.4.x, @use-gesture/react 10.3.x, PostgreSQL 16.
- Dates in America/Costa_Rica after ISO-8601 normalization; EN+ES i18n keys in ui; no raw statement PII at info log level.
- Explicit rejects: Streamlit/Gradio/NiceGUI/Reflex as primary UI; Node-primary API; Bearer in localStorage; mixed FX write/read-time CRC.

### UX Design Requirements

UX-DR1: Implement Warm Balance design tokens for light and dark (background, surface, text, muted, border, accent, on-accent, owe, owed) as CSS variables; honor Account theme Light / Dark / System (default System = OS/browser preference).

UX-DR2: Load and apply locked typography: Petrona (brand, strip amounts, inline money) and Manrope (chrome, who-line, body, buttons, tabs); tabular nums for money; do not substitute Inter/Roboto as brand type; preserve Soft-Ledger relative hierarchy (amount ≫ who ≫ row).

UX-DR3: Implement Soft-Ledger hybrid spacing/shape tokens (4px rhythm, strip-inset, page-gutter, nav-x, row-y; rounded sm 8 / md 10 / lg 12; no pill primary CTAs).

UX-DR4: Build Balance strip (settle-up strip island) component: who-line muted, hero amount in owe/owed color by polarity, optional primary CTA; inset island with surface fill and 1px border; always lead list surfaces with settle number.

UX-DR5: Build Receipt row component: two-column title/when left + amount right; bottom hairline only; airier row padding; newest-first; FX audit shows original + converted CRC when needed.

UX-DR6: Build Section label, Top nav (transparent brand + list title), Tab bar (List / Upload / Account; inactive muted / active accent), Hint (muted under strip), and Primary button (moss accent, rounded.sm) per DESIGN.md component specs.

UX-DR7: Lists homepage uses same Warm Balance tokens with list name + balance in owe/owed (or settled/zero) for instant who-owes-whom scan.

UX-DR8: Incomplete-balance disclosure placed calm/muted below the strip island (same inset), not over the amount; quarantine incompleteness is announced to assistive tech, not color-only.

UX-DR9: Implement IA surfaces: First paint (remembered last-opened list else Lists homepage), Lists homepage, Shared-expenses, Upload, Individual review, Bulk review, Parse comparison, Card registration, Same-price conflict review, Manual expense, Invite, Invitee signup landing, Account menu — per EXPERIENCE.md.

UX-DR10: Account menu is minimal: sign out, password reset, Language EN/ES (remembered on account; first visit from browser), Theme Light / Dark / System (remembered on account; defaults to System) — no profile/settings product surface.

UX-DR11: Phone Individual review, per parsed transaction on a centered card over a dimmed backdrop: true swipe commits — right → chosen list (list picker first), left → configurable default, up → delete; undo is a button on every platform including phone, never a gesture; desktop Individual review uses labeled buttons as primary for the same four outcomes; accessible non-gesture equivalents required. *(Amended 2026-08-20.)*

UX-DR12: Parse comparison pane: PDF in lower half on phone, extracted items above; actions accept-with-quarantine or dismiss statement/file; comparison only on failure.

UX-DR13: Card registration prompt blocks review until user-chosen label + IBAN saved; fixed card→list routing is after registration, not inside the prompt; UI shows user’s label, not bank product codes.

UX-DR14: Same-price / hand-fixed conflict UI: Manual|Parsed cards (one survivor); escape “Not the same expense” harder than cards, keeps both only after double-count confirm; not swipe; resolve before confident settle-up.

UX-DR15: Manual expense form: amount, description, payer (defaults signed-in user), optional origin (existing card dropdown / Cash / blank), Adjust split disclosure (whole-line / absolute / percentage); save updates newest-first row and settle-up immediately; filter for no-origin items supports later assignment.

UX-DR16: Invite form sends by email; unregistered path uses create-account template; invitee signup lands on inviting list with settle-up context; invite email language matches the inviter’s current Account language (EN/ES).

UX-DR17: Voice/microcopy: plain direct CRC copy (“You owe Partner ₡…” / “Partner owes you ₡…”); errors what happened + what to do; Simplify never says “paid” and must not look like recording settlement; no bank jargon or peer blame.

UX-DR18: i18n EN+ES from v1 for chrome, errors, invite emails, review outcomes, quarantine disclosure, conflict labels; `lang` switches with locale; settle-up currency remains CRC-first; card labels are free text not translated.

UX-DR19: Accessibility WCAG 2.2 AA: labeled review outcomes for AT; announce surface on navigation; focus order settle-up → receipts; comparison regions labeled; conflict cards keyboard-selectable; usable phone tap targets; Reduce Motion — no required motion to complete review/quarantine/conflict.

UX-DR20: Desktop shares same IA with wider Soft-Ledger layout — not a separate dashboard visual language; no Distribution dashboard tab in v1 chrome; no settlement-recording CTA (“Mark settled” mocks are not product).

UX-DR21: Depth via tonal canvas vs surface only (no drop-shadow hierarchy); elevation optional/rare for sheets with warm soft shadow if needed.

UX-DR22: End-of-import commit summary (imported N / skipped M) then conflicts if any, then land shared-expenses with settle-up climax.

UX-DR23: List-scoped upload pre-selects destination only for Bulk; does not change Individual default destination.

UX-DR24: Empty / settled / incomplete state treatments per EXPERIENCE State Patterns (settle-up still primary when receipts empty; clear zero without celebration; incomplete disclosure when quarantine affects period).

### FR Coverage Map

FR-1: Epic 1 — Sign up with email and password
FR-2: Epic 1 — Sign in and sign out
FR-3: Epic 1 — Password reset via email
FR-4: Epic 1 — Email verification when required
FR-5: Epic 1 — Personal list on signup
FR-6: Epic 2 — Create and name lists
FR-7: Epic 2 — Invite members by email
FR-8: Epic 2 — Peer access via membership
FR-9: Epic 2 — Configurable list default split
FR-10: Epic 2 — Item and receipt split overrides
FR-11: Epic 4 — Card-to-list association at import
FR-12: Epic 4 — Configurable review default destination
FR-13: Epic 4 — Upload statement PDF
FR-14: Epic 4 — Detect bank and product
FR-15: Epic 4 — Split multi-statement files
FR-16: Epic 4 — Choose card routing mode
FR-17: Epic 4 — Bulk or individual review
FR-18: Epic 4 — Individual review outcomes
FR-19: Epic 3 (define) / Epic 4 (import default) — Explicit payer
FR-20: Epic 4 — Post-import dedup summary
FR-21: Epic 3 (manual create) / Epic 4 (origin card|cash|blank + no-origin filter) — Manual item entry
FR-22: Epic 5 — Same-price manual match review
FR-23: Epic 5 — Manual label as bank-description alias
FR-24: Epic 5 — Statement-scoped parse failure
FR-25: Epic 5 — Side-by-side comparison on failure
FR-26: Epic 5 — Accept with quarantine or dismiss
FR-27: Epic 5 — Manual resolution of quarantined rows
FR-28: Epic 5 — Manual-vs-parsed conflict on re-upload
FR-29: Epic 5 — Reassign statement to another list
FR-30: Epic 5 — Roll back an import batch
FR-31: Epic 4 — Pluggable adapter contract
FR-32: Epic 4 — Canonical line fields and taxonomy
FR-33: Epic 4 — Dual-column amount normalization
FR-34: Epic 4 — Canonical identity and idempotent re-import
FR-35: Epic 4 — BAC credit-card acceptance bar
FR-36: Epic 4 — Promerica stub
FR-37: Epic 4 — Register and match cards by IBAN
FR-38: Epic 3 — Shared-expenses view per list
FR-39: Epic 5 — Statement-cycle period selector
FR-40: Epic 3 — Convert non-CRC to CRC for balances
FR-41: Epic 5 — Settle-up simplify
FR-42: Epic 3 — Receipt-style item list
FR-43: Epic 3 (pattern) / Epic 5 (wire) — Incomplete balance disclosure
FR-44: Epic 3 — Balance shape ready for settlement
FR-45: Epic 3 — Line types that feed settle-up

## Epic List

### Epic 1: Accounts & personal workspace
Users can sign up, sign in, reset password, land with a personal list, and set EN/ES language plus Light / Dark / System theme in the Account menu. Includes greenfield Compose scaffold (`db`/`api`/`ui`).
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5
**Demo gate:** authenticated user with personal list

### Epic 1.5: Auth spine hardening & Epic 2 prep
Close Epic 1 loose ends before continuing shared lists: token claim correctness, auth/mail comprehension artifacts, verify-gate and ACL contracts, spine smoke, plus parallel rate-limit and hex/pytest ergonomics. Does not deliver invite UI or multi-member lists (those remain Epic 2).
**FRs covered:** none new (supports FR-4, FR-7, FR-8 readiness)
**Demo gate:** Critical path 1.5.1–1.5.5 done; Epic 1 auth/mail/personal-list smoke green; Story 2.1 may remain in review until critical path completes

### Epic 2: Shared lists & household membership
Users create named lists, invite members by email (registered + unregistered → land on inviting list), and configure even/percentage list defaults plus item/receipt split overrides.
**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-10
**Demo gate:** unregistered invite → signup → lands on inviting list
**Sequencing note:** Do not start Stories 2.2+ until Epic 1.5 critical path (1.5.1–1.5.5) is done. Story 2.1 may remain in review until that critical path completes.

### Epic 3: Manual expenses & settle-up
Users log shared expenses and see who owes whom in CRC on Soft-Ledger (Warm Balance tokens). Balances from per-transaction shares + payer + FR-45 line-type rules; CanonicalLine-compatible money fields; FX; incomplete-disclosure pattern ready (shows incomplete only when data says so).
**FRs covered:** FR-19 (define), FR-21, FR-38, FR-40, FR-42, FR-43 (pattern), FR-44, FR-45
**Demo gate:** J5 + J2

### Epic 3.5: UI styling stack — Tailwind + SCSS
Migrate `ui` from CSS Modules to Tailwind-first co-located styles, with SCSS only for custom styles. Preserve Warm Balance / Soft-Ledger (AD-12). No new product FRs.
**FRs covered:** none new (supports UX-DR1–DR6 delivery maintainability)
**Demo gate:** Soft-Ledger + lists/auth chrome visual parity; CSS Modules removed from `ui/`
**Sequencing note:** Start after Epic 3 stories 3.5–3.6 are done. Do not start Epic 4 UI until Epic 3.5 demo gate passes.

### Epic 4: Statement upload & review
Users register cards by IBAN, set optional manual-expense origin (card / Cash / blank) with a no-origin filter, upload PDFs, detect/split/parse via adapters (BAC credit-card acceptance + Promerica stub), choose routing/review modes, commit with dedup summary. Reuses Epic 3 payer + Soft-Ledger strip — exit = commit updates same settle strip.
**FRs covered:** FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19 (import), FR-20, FR-21 (origin + no-origin filter), FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37
**Demo gate:** J1 climax on Soft-Ledger strip
**Sequencing note:** Do not start Epic 4 until Epic 3.5 demo gate passes.
**Scope change (2026-08-20):** Stories 4.10, 4.11, 4.13, 4.14 and 4.15 replace Story 4.8's statement-level individual review with per-transaction routing; Story 4.12's ACs are amended by the same change. FR-17, FR-18, AD-4 and AD-9 are amended by Sprint Change Proposal 2026-08-20; 4.8 stays `done` and is annotated as superseded. AD-4's batch boundary must be amended before 4.10 starts.

**Build order = numeric order:** 4.9 → 4.10 → 4.11 → 4.12 → 4.13 → 4.14. Story 4.15 parallelizes any time after 4.11; Story 4.16 is independent of review granularity and can run at any point.

**Renumbered 2026-08-20** so numeric order matches build order. Stories 4.1–4.8 were untouched. Story files and `sprint-status.yaml` keys were renamed to match; **completed story files (4.1–4.8) were deliberately left as written**, so a "Story 4.9" reference inside one of them means what is now 4.12, and a range like "Stories 4.4–4.9" describes the original import pipeline. Decode with this table:

| Was | Now | Story |
| --- | --- | --- |
| 4.11 | **4.9** | BAC credit real-statement compatibility fix |
| 4.12 | **4.10** | Row-level review data model + per-row commit |
| 4.13 | **4.11** | Row-level review API |
| 4.9 | **4.12** | Commit batch, dedup summary, land on settle strip |
| 4.14 | **4.13** | Individual review card |
| 4.15 | **4.14** | Resume entry point + completion summary |
| 4.16 | **4.15** | "New" badge on freshly imported rows |
| 4.10 | **4.16** | Multi-file upload |

### Epic 5: Import resilience (then settle polish)
Ordered: parse failure/quarantine/hand-fix → wire FR-43 on strip → reassign/rollback → same-price + aliases → then simplify (FR-41) + statement-cycle selector (FR-39).
**FRs covered:** FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-39, FR-41, FR-43 (wire)
**Demo gate:** J3 + J7 before simplify stories

## Epic 1: Accounts & personal workspace

Users can sign up, sign in, reset password, land with a personal list, and set EN/ES language plus Light / Dark / System theme in the Account menu. Includes greenfield Compose scaffold (`db`/`api`/`ui`).

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5  
**Demo gate:** authenticated user with personal list

### Story 1.1: Scaffold Compose app with health checks

As an operator,
I want to run finance-helper locally via Docker Compose with `db`, `api`, and `ui`,
So that the self-hosted stack is ready for feature work without inventing deploy shape later.

**Acceptance Criteria:**

**Given** a clean checkout with `.env` filled from `.env.example`
**When** I start Compose (`db`, `api`, `ui`)
**Then** Postgres is reachable, and `api` and `ui` each expose `/health` returning success
**And** the repo layout matches the architecture seed (`api/domain|application|adapters|api`, `ui/` Next standalone, Alembic ready for migrations)
**And** CI workflow skeleton runs lint gates for `api` and `ui` (even if feature tests are still thin)
**And** no personal/statement data paths are committed; volumes for Postgres (and future PDFs) are outside the repo per NFR-9 / AD-3

### Story 1.2: Sign up with email/password and personal list

As a new user,
I want to create an account with email and password and immediately get a personal list,
So that I can start owning expenses without a separate setup step.

**Acceptance Criteria:**

**Given** I am not registered
**When** I sign up with a valid email and password
**Then** my password is stored hashed (never plaintext) and I am authenticated (httpOnly Secure session cookie per AD-8)
**And** the system creates exactly one personal list I own (FR-5)
**And** signing up with an email that already exists is rejected

**Given** email verification is not required for this deployment (FR-4 off)
**When** signup succeeds
**Then** I can use the app without a verification step

### Story 1.3: Sign in, sign out, and protect routes

As a registered user,
I want to sign in with email and password and sign out,
So that only I can access my lists and uploads while signed in.

**Acceptance Criteria:**

**Given** I have a registered account
**When** I sign in with correct email and password
**Then** I receive an authenticated session (httpOnly Secure cookie; no Bearer token in localStorage)

**Given** I enter invalid credentials
**When** I attempt to sign in
**Then** sign-in fails with a generic error that does not reveal whether the email exists

**Given** I am signed in
**When** I sign out
**Then** my session ends and protected list/upload actions require authentication again

### Story 1.4: Password reset via email

As a registered user,
I want to reset a forgotten password via email,
So that I can regain access without losing my account.

**Acceptance Criteria:**

**Given** I have a registered account and SMTP is configured
**When** I request a password reset for my email
**Then** I receive a reset message that proves control of that address (NFR-10)

**Given** I complete the reset with a new password
**When** I sign in
**Then** the new password works and the prior password no longer does

**Given** SMTP is misconfigured or unavailable
**When** I request a reset
**Then** the API fails loudly with a clear operator-facing/config error path (no silent success)

### Story 1.5: Config-gated email verification

As an operator (and as a user when verification is on),
I want email verification to run only when required for invites or secure recovery,
So that deployments can stay simple unless that gate is needed.

**Acceptance Criteria:**

**Given** verification is disabled for the deployment
**When** a user completes signup (FR-1)
**Then** they can use the app without verifying email

**Given** verification is enabled (required for invite delivery or secure recovery)
**When** an unverified user tries to complete a gated flow (e.g. invite acceptance path that requires it)
**Then** that flow is blocked until they verify control of the address

**Given** verification is enabled
**When** the user completes verification
**Then** previously gated flows become available

### Story 1.6: Account menu — language EN/ES and theme

As a signed-in user,
I want to choose UI language (EN/ES) and appearance theme (Light / Dark / System) from a minimal Account menu,
So that the app matches my language and preferred look without a full settings product.

**Acceptance Criteria:**

**Given** I am signed in
**When** I open the Account menu
**Then** I can sign out, reach password reset, choose Language EN or ES, and choose Theme Light, Dark, or System — with no profile/settings surface (UX-DR10)

**Given** it is my first visit with no saved language preference
**When** the UI loads
**Then** language defaults from the browser / Accept-Language

**Given** I select EN or ES
**When** I return later on the same account
**Then** my language preference is remembered and `lang` matches the locale (UX-DR18)
**And** account chrome strings for this story ship in both EN and ES

**Given** it is my first visit with no saved theme preference
**When** the UI loads
**Then** theme defaults to System (OS/browser light/dark) and Warm Balance tokens apply for the resolved mode (UX-DR1)

**Given** I select Light, Dark, or System
**When** I return later on the same account
**Then** my theme preference is remembered and the UI uses the corresponding Warm Balance token set (System continues to follow OS changes)

## Epic 1.5: Auth spine hardening & Epic 2 prep

Close Epic 1 loose ends before continuing shared lists: token claim correctness, auth/mail comprehension artifacts, verify-gate and ACL contracts, spine smoke, plus parallel rate-limit and hex/pytest ergonomics. Product FRs for lists/invites remain in Epic 2 — this epic does not deliver invite UI or multi-member lists.

**FRs covered:** none new (supports FR-4, FR-7, FR-8 readiness)  
**Demo gate:** Critical path 1.5.1–1.5.5 done; Epic 1 auth/mail/personal-list smoke green; Story 2.1 may remain in review until this epic’s critical path completes.

**Sequencing:** Do not start Stories 2.2+ until Epic 1.5 critical path (1.5.1–1.5.5) is done. Stories 1.5.6–1.5.7 may run in parallel after 1.5.1 or immediately after critical path.

### Story 1.5.1: Token claim re-checks expires_at

As an operator,
I want password-reset and email-verify token claims to reject expired tokens,
So that invite tokens can copy a correct claim pattern instead of a known gap.

**Acceptance Criteria:**

**Given** a password-reset or email-verify token whose `expires_at` is in the past
**When** the claim/confirm path runs
**Then** the claim is rejected and the token is not treated as successfully consumed for a state change

**Given** a still-valid token
**When** the claim/confirm path runs
**Then** existing successful behavior is preserved

**And** the corrected claim pattern is documented so Epic 2 invite tokens can reuse it

### Story 1.5.2: Auth/mail interaction map and story-close overview process

As the project lead,
I want a living auth/mail interaction map and a story-close how/why overview habit,
So that I understand how pieces interact before a story is marked done.

**Acceptance Criteria:**

**Given** the Epic 1 auth and mail flows (session/BFF, reset, verify, SMTP)
**When** the interaction map is delivered
**Then** it shows request path, key components, and why that shape — usable without reverse-engineering diffs

**And** the team agreement is recorded: before marking a story done, deliver a short how/why overview (what not to break included)

### Story 1.5.3: Invite verify-gate contract

As a developer,
I want a written contract for how EnsureEmailVerifiedService gates invite acceptance,
So that Stories 2.3/2.4 implement one agreed behavior when verification is required.

**Acceptance Criteria:**

**Given** `EMAIL_VERIFICATION_REQUIRED` is on or off
**When** an invite accept (or gated invite) path is specified
**Then** the contract states when the gate blocks, when it allows, and how the stub becomes real in 2.3/2.4

**And** no invite UI is required in this story — contract/docs (and minimal stub alignment only if needed)

### Story 1.5.4: Membership ACL enforcement sketch

As a developer,
I want a sketch of where membership ACL is enforced and what 2.1/2.2 must call,
So that list access checks are consistent before homepage and invite work continues.

**Acceptance Criteria:**

**Given** AD-19 membership rules
**When** the sketch is delivered
**Then** it names the enforcement layer (application vs route), the operations that must check membership, and what Stories 2.1/2.2 are expected to call

**And** full ACL product implementation remains in Epic 2 (especially 2.2) — this story is the contract sketch

### Story 1.5.5: Epic 1 spine smoke (auth, mail, personal list)

As QA,
I want a smoke checklist run against the Compose stack after the claim fix,
So that the Epic 1 spine still holds before Epic 2 resumes.

**Acceptance Criteria:**

**Given** Stories 1.5.1 (and any blocking map/contract deps) are done
**When** the smoke checklist is executed on Compose (`db`/`api`/`ui`)
**Then** signup/sign-in/sign-out, personal list presence, password-reset path, and verify path (as configured) pass

**And** the checklist is saved under implementation artifacts for reuse

### Story 1.5.6: Auth and SMTP rate-limit hardening

As an operator,
I want rate limits on register, sign-in, reset, and verify request paths,
So that invite-era abuse surfaces are reduced (parallel hardening).

**Acceptance Criteria:**

**Given** repeated requests to register, sign-in, password-reset request, and verify request
**When** configured limits are exceeded
**Then** the API rejects further attempts with a clear client-safe error without breaking legitimate single-user flows

**And** this story may proceed in parallel after 1.5.1 or after critical path 1.5.1–1.5.5

### Story 1.5.7: Hex port polish and Compose pytest ergonomics

As a developer,
I want clearer hex ports for session/hasher/prefs and a workable Compose pytest path,
So that Epic 2 application services do not pile onto incomplete boundaries (parallel).

**Acceptance Criteria:**

**Given** routes that today import concrete session/hasher/prefs adapters
**When** this story completes
**Then** ports/interfaces are introduced or tightened for those seams without changing product behavior

**And** a documented, working way to run API pytest against the Compose Postgres (host or in-image) exists so CI/local parity is clearer

**And** this story may proceed in parallel after 1.5.1 or after critical path 1.5.1–1.5.5

## Epic 2: Shared lists & household membership

Users create named lists, invite members by email (registered + unregistered → land on inviting list), and configure even/percentage list defaults plus item/receipt split overrides (override UI deferred to Epic 3).

**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-10  
**Demo gate:** unregistered invite → signup → lands on inviting list

**Sequencing:** Do not start Stories 2.2+ until Epic 1.5 critical path (1.5.1–1.5.5) is done. Story 2.1 may remain in `review` until that critical path completes.

### Story 2.1: Create and rename owned lists

As an authenticated user,
I want to create additional named lists I own and edit their names,
So that I can organize spending beyond my personal list.

**Acceptance Criteria:**

**Given** I am signed in
**When** I create a new list with a name
**Then** I own that list and it appears among lists I belong to
**And** I may own more than one list (FR-6)

**Given** I own a list
**When** I edit its name
**Then** the new name is visible to members of that list

**Given** I am not a member of a list
**When** I attempt to rename it
**Then** the action is rejected (membership ACL / NFR-3)

### Story 2.2: Lists homepage — membership-scoped access

As a signed-in user,
I want a homepage of every list I belong to,
So that I can open the right household or personal list quickly.

**Acceptance Criteria:**

**Given** I am signed in and belong to one or more lists
**When** I open the Lists homepage (or first-paint fallback when no remembered list)
**Then** I see only lists I am a member of (FR-8, AD-19)
**And** each row shows list name (Warm Balance / Soft-Ledger list-row pattern per UX-DR7; balance figures may be zero/placeholder until Epic 3)

**Given** I am not a member of a list
**When** I request that list’s expenses or balances via API/UI
**Then** access is denied with **404** (same body as missing list) (NFR-3; Story 1.5.4 disclosure)

**Given** I select a list row
**When** navigation completes
**Then** I open that list’s detail surface (shared-expenses shell may be empty until Epic 3)
**And** that list becomes the remembered last-opened list for first paint (UX-DR9)

**Given** I sign in (or land authenticated with no invite deep link)
**When** first paint runs
**Then** I open the remembered last-opened list if I still belong to it; otherwise the Lists homepage (UX-DR9)

### Story 2.3: Invite members by email

As a list owner,
I want to invite someone to my list by email,
So that household peers can share expenses with me.

**Acceptance Criteria:**

**Given** I own a list and SMTP is configured
**When** I invite a registered user’s email
**Then** they receive a join-list invitation email (FR-7, NFR-10, UX-DR16)

**Given** I own a list and SMTP is configured
**When** I invite an unregistered email
**Then** they receive a signup-oriented invitation (create-account template) that links them to this list after signup

**Given** I am a member but not the owner
**When** I attempt to invite someone
**Then** the action is rejected

**Given** the invite is sent
**When** the UI confirms
**Then** I see confirmation the invite went out (invite-sent state)
**And** the invitation email is written in my current Account language (EN/ES) (UX-DR16)

**Given** SMTP is misconfigured or unavailable
**When** I attempt to invite someone
**Then** the invite fails with a clear error — no silent “sent” state (NFR-10)

### Story 2.4: Invitee signup lands on inviting list

As an invited person without an account,
I want signup from the invite link to drop me on the household list,
So that I see settle-up context immediately instead of a blank home.

**Acceptance Criteria:**

**Given** I received an unregistered-path invite email
**When** I open the link and complete signup (email + password)
**Then** I become a member of the inviting list and land on that list’s detail surface (FR-7, UX-DR16)
**And** I do not land on a blank Lists homepage as the first post-signup screen

**Given** I already have an account and open a registered-path join invite
**When** I accept while signed in (or after sign-in)
**Then** membership is created and I can open that list from Lists homepage / deep link

**Given** the invite token is invalid or expired
**When** I try to complete the flow
**Then** I see a clear error and am not added to the list

### Story 2.5: Configurable list default split

As a list owner,
I want to set the list’s standing split to even or custom percentages,
So that new items inherit our household arrangement without per-item edits.

**Acceptance Criteria:**

**Given** a new list with members
**When** no custom default has been set
**Then** the default split is even among current members (FR-9)

**Given** I own the list
**When** I save a percentage default that sums to exactly 100% across members
**Then** the standing default updates and new items inherit it until overridden

**Given** I own the list
**When** I attempt to save percentages that do not sum to 100%
**Then** the save is rejected

**Given** I am a member but not the owner
**When** I attempt to edit the standing default
**Then** the action is rejected

**Given** percentage shares are applied to a concrete amount later
**When** floor-division leaves a leftover minor unit
**Then** that remainder is assigned to the list creator (AD-6) — deterministic, not a user preference

### Story 2.6: Item and receipt split overrides (domain + API)

As a list member (via API / domain),
I want item and receipt split overrides — whole-line, absolute amounts, or percentages —
So that Epic 3 settle-up and the Adjust-split UI can consume a stable share-allocation model.

**Acceptance Criteria:**

**Given** an item or receipt with no override
**When** share allocations are computed
**Then** the list default split is used (FR-10)

**Given** a member sets a whole-line (or whole-receipt) override to one member via API
**When** allocations are computed
**Then** that member receives 100% of the line/receipt

**Given** absolute amounts per member are submitted
**When** they sum to the line/receipt total
**Then** those amounts become the share allocations
**And** amounts that do not sum to the total are rejected

**Given** a percentage override is submitted
**When** percentages sum to exactly 100%
**Then** allocations follow those percentages (AD-6 remainder → list creator)
**And** percentages that do not sum to 100% are rejected

**Given** this story is complete
**When** product UI is considered
**Then** no Adjust-split UI is required yet — Epic 3 manual expense ships the disclosure UI against this API

## Epic 3: Manual expenses & settle-up

Users log shared expenses and see who owes whom in CRC on Soft-Ledger (Warm Balance tokens). Balances from per-transaction shares + payer + FR-45 line-type rules; CanonicalLine-compatible money fields; FX; incomplete-disclosure pattern ready (shows incomplete only when data says so).

**FRs covered:** FR-19 (define), FR-21, FR-38, FR-40, FR-42, FR-43 (pattern), FR-44, FR-45  
**Demo gate:** J5 + J2

### Story 3.1: Warm Balance tokens + Soft-Ledger primitives

As a user of the shared-list UI,
I want Warm Balance light/dark tokens and Soft-Ledger primitives in place,
So that settle-up and receipts look like finance-helper—not kit defaults.

**Acceptance Criteria:**

**Given** the `ui` app
**When** design tokens are applied
**Then** Warm Balance CSS variables exist for light and dark (background, surface, text, muted, border, accent, on-accent, owe, owed) per DESIGN.md (UX-DR1)
**And** Petrona + Manrope are loaded with Soft-Ledger type roles; tabular nums for money; no Inter/Roboto as brand (UX-DR2)
**And** spacing/shape tokens match Soft-Ledger (strip-inset, rounded sm/md; no pill primary CTAs) (UX-DR3)

**Given** these primitives
**When** list chrome is rendered
**Then** Balance strip, Receipt row, Section label, Top nav, Tab bar (List / Upload / Account), Hint, and Primary button match DESIGN component anatomy (structure may be empty of live data) (UX-DR4–6)
**And** depth uses canvas vs surface tonal layering without drop-shadow hierarchy (UX-DR21)
**And** theme Light / Dark / System from Story 1.6 drives which token set is active

### Story 3.2: Manual expense with payer + Adjust split UI

As a list member,
I want to add a manual expense with amount, description, payer, and optional Adjust split,
So that shared spending is logged the same day without waiting for a statement.

**Acceptance Criteria:**

**Given** I am a member of a list
**When** I open add manual expense
**Then** the form requires amount, description, and payer (FR-21, UX-DR15)
**And** payer defaults to me and remains editable (FR-19)

**Given** I do not open Adjust split
**When** I save
**Then** the item uses the list default split (Story 2.5 / 2.6)
**And** the row carries `hand` provenance

**Given** I open Adjust split
**When** I choose whole-line, absolute amounts per member, or percentage
**Then** validation matches Story 2.6 rules (100% / sum-to-total) before save

**Given** save succeeds
**When** I view the list
**Then** the item appears newest-first and settle-up figures update once Story 3.3–3.4 are in place (this story may show the new receipt row immediately; strip totals wire when settle math lands)

**Given** expense origin (card / Cash / blank)
**When** this story is implemented
**Then** origin UI is not required yet — leave a clear extension point on the manual expense form
**And** Story 4.2 adds card / Cash / blank origin + no-origin filter after cards exist (FR-21)
**And** this story must not ship a dead or stub origin control that implies cards exist

**Given** I am not a member
**When** I attempt to create an expense on that list
**Then** the action is rejected (NFR-3)

### Story 3.3: Shared-expenses view — strip + receipt list

As a list member,
I want the shared-expenses surface to lead with a Soft-Ledger settle strip and newest-first receipts,
So that I can see who owes whom at a glance (J2).

**Acceptance Criteria:**

**Given** I am a member of a list
**When** I open shared-expenses for that list
**Then** I see the Soft-Ledger balance strip island first (who-line + hero amount polarity owe/owed when totals exist) and receipts below newest-first (FR-38, FR-42, UX-DR4/5)
**And** non-members cannot open it (FR-8)

**Given** there are no receipt items yet
**When** I open the view
**Then** the settle strip remains primary and the receipts area can be empty without celebration chrome (UX-DR24)

**Given** nets are zero / settled
**When** the strip renders
**Then** it shows a clear even/zero state without celebration (UX-DR24)

**Given** phone or desktop viewport
**When** I use the view
**Then** IA is the same; desktop is wider Soft-Ledger, not a separate dashboard (UX-DR20, NFR-7)
**And** copy stays plain/direct CRC voice (UX-DR17); no settlement-recording CTA

**Given** totals are not yet computed (before Story 3.4)
**When** the strip renders
**Then** layout and empty/zero states still work; live who-owes-whom numbers wire in 3.4

### Story 3.4: Settle-up from shares, payer, and line types

As a list member,
I want settle-up computed from per-transaction shares, payer, and included line types,
So that the strip shows who should return what in CRC and stays ready for v2 payments.

**Acceptance Criteria:**

**Given** committed expenses with share allocations and an explicit payer
**When** settle-up is computed for the list period
**Then** suggested balances preserve net positions from those allocations (FR-44)
**And** Soft-Ledger strip shows plain who-owes-whom in CRC with owe/owed polarity (UX-DR17)

**Given** lines with excluded types (payment, interest, fee, voluntary_service, installment_schedule, balance_forward, unclassified credit_note, etc.)
**When** settle-up runs
**Then** those lines do not change member settle balances (FR-45)
**And** included types are purchases and classified purchase reversals only

**Given** percentage splits leave a leftover minor unit after floor-division
**When** allocations are applied
**Then** remainder goes to the list creator (AD-6)

**Given** a manual expense is added (Story 3.2)
**When** I return to shared-expenses
**Then** strip totals update to reflect the new shares (J5 → J2 demo path)

**And** no payment ledger writes occur — settle-up is computed shares only (AD-21)

### Story 3.5: Materialize FX to CRC (BCCR) for non-CRC lines

As a list member,
I want non-CRC amounts converted to CRC using BCCR rates at commit,
So that settle-up stays in colones while originals remain auditable.

**Acceptance Criteria:**

**Given** a non-CRC expense is committed (manual in this epic; imports later reuse the same path)
**When** the domain materializes FX
**Then** it stores `amount_crc`, `fx_rate`, `fx_rate_date`, and `fx_fallback` beside the original `(amount, currency)` (FR-40, AD-7)
**And** the rate is BCCR for the purchase/statement date; if missing, nearest prior BCCR date with `fx_fallback` set
**And** there is no user FX override in v1

**Given** settle-up runs
**When** balances are computed
**Then** they use materialized CRC — they do not re-call BCCR per view

**Given** a foreign-currency receipt row
**When** it is shown in the receipt list
**Then** enough original amount + converted CRC is visible to audit the FX step

**Given** money fields in domain/persistence
**When** amounts are stored or computed
**Then** Postgres NUMERIC + Python Decimal are used — never float (AD-5)

### Story 3.6: Incomplete-disclosure pattern (slot only)

As a list member,
I want an incomplete-balance disclosure pattern under the settle strip,
So that when Epic 5 wires quarantine data, understated totals are never silent.

**Acceptance Criteria:**

**Given** the shared-expenses Soft-Ledger strip
**When** no statement in the period is marked incomplete / quarantined
**Then** no incomplete disclosure is shown — strip is not falsely marked incomplete (FR-43 pattern)

**Given** the disclosure UI component
**When** it is implemented
**Then** it sits calm/muted below the island strip (same inset), not over the hero amount (UX-DR8)
**And** it is announcable to assistive tech (not color-only) when later wired (UX-DR19)

**Given** this story alone
**When** product behavior is tested
**Then** there is no requirement to fabricate incomplete data — Epic 5 wires FR-43 for real quarantine

## Epic 3.5: UI styling stack — Tailwind + SCSS

Migrate `ui` from CSS Modules to Tailwind-first co-located styles, with SCSS only for custom styles that utilities cannot express cleanly. Preserve Warm Balance / Soft-Ledger look (AD-12). No new product FRs.

**FRs covered:** none new (supports UX-DR1–DR6 delivery maintainability)  
**Demo gate:** Soft-Ledger + lists/auth chrome visual parity; CSS Modules removed from `ui/`  
**Sequencing:** Start after Epic 3 stories 3.5–3.6 are done. Do not start Epic 4 until Epic 3.5 demo gate passes.

### Story 3.5.1: Install Tailwind v4 + Sass and Warm Balance theme bridge

As a developer,
I want Tailwind and Sass wired into the Next.js `ui` app with Warm Balance tokens,
So that components can use utilities without inheriting kit defaults.

**Acceptance Criteria:**

**Given** `ui/` dependencies
**When** Tailwind CSS v4 + PostCSS plugin + `sass` are installed and configured
**Then** `next build` / `typecheck` / existing tests still pass on non-migrated surfaces

**And** Warm Balance light/dark/System tokens remain authoritative (no template/kit palette)
**And** Soft-Ledger spacing/shape/type tokens remain available to utilities and/or CSS variables
**And** project docs note: utilities first; SCSS modules only for custom styles

### Story 3.5.2: Migrate Soft-Ledger primitives to Tailwind (+ SCSS where needed)

As a developer,
I want Soft-Ledger primitives styled without CSS Modules,
So that the design system is the template for all later UI.

**Acceptance Criteria:**

**Given** Soft-Ledger components under `ui/components/soft-ledger/`
**When** migrated
**Then** visual parity with DESIGN.md (Balance strip, Receipt row, Section label, Top nav, Tab bar, Hint, Primary button, Radio/Select if present)
**And** no Soft-Ledger `*.module.css` remain
**And** Soft-Ledger tests updated and green
**And** AD-12 bans still held (no pill primary; kits unstyled only)

### Story 3.5.3: Migrate lists, auth, and account surfaces

As a developer,
I want feature screens on the same styling stack,
So that we do not maintain two CSS conventions.

**Acceptance Criteria:**

**Given** lists / signup / account / remaining app CSS Modules
**When** migrated to Tailwind and/or `*.module.scss`
**Then** no `*.module.css` remain under `ui/`
**And** EN/ES chrome + theme switching still work
**And** critical ui tests + typecheck + lint + build green

### Story 3.5.4: Convention lock — project-context + architecture stack

As a maintainer,
I want agent/project rules to mandate Tailwind-first + SCSS-custom,
So that Epic 4+ stories do not reintroduce CSS Modules.

**Acceptance Criteria:**

**Given** architecture spine + `project-context.md`
**When** updated
**Then** stack lists Tailwind CSS v4 + Sass
**And** AD-23 documents the styling delivery convention
**And** `project-context.md` UI rules forbid new CSS Modules and kit themes
**And** Epic 4 story prep notes reference Epic 3.5 as prerequisite

## Epic 4: Statement upload & review

Users register cards by IBAN, set optional manual-expense origin (card / Cash / blank) with a no-origin filter, upload PDFs, detect/split/parse via adapters (BAC credit-card acceptance + Promerica stub), choose routing/review modes, commit with dedup summary. Reuses Epic 3 payer + Soft-Ledger strip — exit = commit updates same settle strip.

**FRs covered:** FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19 (import), FR-20, FR-21 (origin + no-origin filter), FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37  
**Demo gate:** J1 climax on Soft-Ledger strip  
**Sequencing:** Do not start Epic 4 until Epic 3.5 demo gate passes.

### Story 4.1: Register and match cards by IBAN

As a signed-in user,
I want cards keyed by IBAN with my own labels,
So that imports recognize my cards and show my names—not bank product codes.

**Acceptance Criteria:**

**Given** a statement yields an IBAN that matches a card I already registered
**When** import proceeds
**Then** the system uses that card and its label as the human import identifier — no re-registration prompt (FR-37, UX-DR13)

**Given** a statement yields an IBAN I have not registered
**When** import reaches card identity
**Then** a registration prompt blocks review until I save a user-chosen label + IBAN
**And** fixed card→list routing is configured after this prompt, not inside it

**Given** card registry data
**When** stored or displayed
**Then** vocabulary is user-scoped and generic — no hardcoded personal card names in code (NFR-2)

### Story 4.2: Manual origin — card / Cash / blank + no-origin filter

As a list member,
I want to set an optional origin on manual expenses (existing card, Cash, or blank) and filter items with no origin,
So that I can tag how money was spent and catch up on unassigned rows later.

**Acceptance Criteria:**

**Given** I am adding or editing a manual expense and I have registered cards
**When** I open the origin control
**Then** I can choose an existing card from a dropdown, choose Cash, or leave origin blank (FR-21, UX-DR15)

**Given** the expense is neither card nor cash
**When** I leave origin blank and save
**Then** the item is stored with no origin and remains valid

**Given** items exist with blank origin
**When** I apply the no-origin filter
**Then** I see those items and can assign origin (card or Cash) individually or in a batch assign flow

**Given** I have no registered cards yet
**When** I open origin
**Then** Cash and blank remain available; the card dropdown is empty or omitted without blocking save

### Story 4.3: Card routing mode + review default list

As a card owner,
I want to choose fixed-list vs review-routing for each card and set my low-effort default list,
So that imports land where I expect without assuming “always personal list.”

**Acceptance Criteria:**

**Given** a registered card
**When** I choose fixed-list mode and pick a list I belong to
**Then** that card’s statements feed that list (subject to parse/failure handling) (FR-11, FR-16)
**And** v1 allows at most one active fixed list per card

**Given** a registered card
**When** I choose review-routing mode
**Then** each statement/upload is assigned during review before commit

**Given** review-routing is active
**When** I set my configurable default destination list
**Then** low-effort accepts (Individual “left” / default path) land on that list (FR-12)
**And** the default may be my personal list or any list I belong to

**Given** routing is configured
**When** import runs
**Then** the product does not silently assume always-personal-list

### Story 4.4: Adapter contract + CanonicalLine + BAC normalize

As a developer extending bank support,
I want a pluggable detect → split → parse → normalize contract emitting CanonicalLine,
So that new banks don’t rewrite core import, dedup, or list logic.

**Acceptance Criteria:**

**Given** an adapter package
**When** it is registered
**Then** it declares `{bank, product_id, account_kind}` and plugs into detect → split → parse → normalize without modifying core import/dedup/list (FR-31)

**Given** detection
**When** override → filename → content strategies run
**Then** the first confident match wins; unknown or ambiguous detection fails loudly with a clear error (FR-14, NFR-8)

**Given** must-parse ledger lines
**When** an adapter emits rows
**Then** each row is a CanonicalLine: posted_date (ISO-8601), signed amount, ISO 4217 currency, product_id, line_type, external_ref when provided, normalized_description, provenance (FR-32, AD-16)
**And** line-type taxonomy includes at least the PRD set; section policies are must_parse / best_effort / ignore; unmapped sections quarantine rather than silent drop

**Given** dual CRC/USD columns
**When** amounts are normalized
**Then** a single `(currency, amount)` results — prefer nonzero; if both nonzero, prefer CRC (FR-33)

**Given** commit time
**When** identity is computed
**Then** domain alone computes canonical identity (primary external_ref when stable; else fallback tuple) — adapters do not emit authoritative dedup keys (FR-34, AD-18)

### Story 4.5: BAC credit-card acceptance bar + Promerica stub

As an operator shipping v1 parsing,
I want a synthetic BAC credit-card fixture as the exit bar and a Promerica stub proving extension,
So that CI gates real parsing quality without core forks.

**Acceptance Criteria:**

**Given** the synthetic BAC credit-card fixture (known geometry) and golden expected rows
**When** the supported BAC credit product import runs in CI
**Then** every must-parse line persists with required CanonicalLine fields and zero manual edits (FR-35, AD-11)

**Given** the Promerica stub (or contract-test adapter)
**When** contract tests run
**Then** it exercises multi-statement extension without modifying core import, dedup, or list logic (FR-36)
**And** real Promerica parsing remains out of scope

**Given** repository fixtures
**When** committed
**Then** they are synthetic/anonymized only — no real statements or PII (NFR-2)

### Story 4.6: Upload PDF → detect/split → Import Session

As an authenticated user,
I want to upload a bank-statement PDF and have it staged as an Import Session,
So that multi-statement files are detected and split before I commit anything.

**Acceptance Criteria:**

**Given** I am signed in
**When** I upload a PDF through the web UI (phone or desktop)
**Then** the file is accepted and stored temporarily on the operator PDF volume with a path reference in Postgres — not in git (FR-13, AD-3)
**And** non-PDF formats are rejected with a clear error
**And** the path is ephemeral: cleared with the file after successful clean commit (Story 4.12) or when no longer needed for quarantine/review

**Given** a valid upload
**When** detect and split run in-process on `api`
**Then** an Import Session stages N statements each with product identity (FR-14, FR-15, AD-4)
**And** unknown/ambiguous detection fails loudly without silent mis-association

**Given** a multi-statement PDF
**When** one statement later fails or is skipped
**Then** siblings in the same session are not automatically discarded (FR-15)

**Given** review has not committed
**When** I discard the session
**Then** only uncommitted session state is dropped — no ledger writes (AD-4)

**Given** a typical single multi-card BAC PDF on the operator’s self-hosted hardware
**When** upload → detect/split → review staging completes
**Then** the path finishes within an interactive session — review is not an overnight batch job (NFR-12)

### Story 4.7: Bulk review assign & commit path

As a user importing under review routing,
I want Bulk mode to send the whole upload to one list I choose,
So that I can finish a multi-statement file in one assignment when I’m not reviewing card-by-card.

**Acceptance Criteria:**

**Given** review routing and I choose Bulk
**When** I pick a destination list I belong to
**Then** the whole upload is assigned to that list before commit (FR-17)

**Given** I started Upload from inside a list
**When** Bulk mode is selected
**Then** that list may be pre-selected as destination — Individual default destination is unchanged (UX-DR23)

**Given** statements parse cleanly
**When** I confirm Bulk commit
**Then** each statement commits as its own Import Batch under the session (AD-4)
**And** payer on imported expenses defaults to me and remains editable (FR-19)

**Given** parse failure on a statement
**When** Bulk is in progress
**Then** failure handling for that statement is deferred to Epic 5 — this story’s happy path is clean parses only

### Story 4.8: Individual review (swipe / desktop buttons)

> **⚠️ Superseded by Stories 4.10, 4.11, 4.13, 4.14 and 4.15 (Sprint Change Proposal 2026-08-20).**
> This story shipped and satisfied its own acceptance criteria, which specify statement-level
> routing ("When I act on a statement"). That granularity was a specification defect: it makes
> individual review functionally identical to bulk review. The ACs below describe delivered-then-
> replaced behavior and are retained for history — they do not describe current product intent.
> Status remains `done`; the replacement is tracked as new stories, not as a reopening of this one.

As a user reviewing statements one at a time,
I want phone swipes and desktop buttons for chosen list / default / skip,
So that I can route each statement deliberately (J1).

**Acceptance Criteria:**

**Given** Individual review on phone
**When** I act on a statement
**Then** true swipe commits: right → chosen list (list picker first), left → configurable default list, down → skip (FR-17, FR-18, AD-9, UX-DR11)

**Given** Individual review on desktop
**When** I act on a statement
**Then** labeled buttons are primary for the same three outcomes — not swipe theatre

**Given** high-intent accept (chosen list)
**When** I proceed
**Then** the list picker opens before the commit gesture/button

**Given** accessible / Reduce Motion needs
**When** review is used
**Then** non-gesture equivalents exist so outcomes are operable without swipe (UX-DR19)

**Given** skip or dismiss file
**When** I confirm
**Then** skip stores nothing for that statement; dismiss abandons remaining uncommitted statements from the upload (FR-18)

**Given** clean parse
**When** I accept
**Then** comparison UI does not appear — failures are Epic 5

### Story 4.9: BAC credit real-statement compatibility fix

As a developer maintaining the BAC credit adapter,
I want BacCreditAdapter to recognize real BAC statement sections and data rows instead of the synthetic-fixture-only pipe format,
So that real BAC credit uploads parse successfully instead of silently yielding zero rows.

**Acceptance Criteria:**

**Given** BacCreditAdapter's declared `_SECTIONS`
**When** compared against a real BAC credit statement's printed section titles
**Then** the title strings match real lettered headers (e.g. "A) Detalle de pago del periodo", "B) Detalle de compras del periodo") rather than invented text — SectionCursor's mechanism is unchanged (AD-25)

**Given** a shared `domain/statement_row_extraction.py` module
**When** a statement line contains a date-shaped token and at least one amount-shaped token
**Then** it is classified as a data row without requiring a delimiter — promoted from statement_recon.py's proven `_has_date_token`/`_amount_tokens` logic (AD-28)

**Given** BacCreditAdapter's colones/dólares dual-amount columns
**When** AmountColumnRole is declared for this product
**Then** it declares CURRENCY_VARIANT and behavior is unchanged from today's `normalize_dual_column_amount` (FR-33, AD-28)

**Given** the updated adapter
**When** a real (non-fixture) BAC credit statement's text shape is parsed
**Then** must-parse sections yield CanonicalLine rows instead of candidate_row_count == 0, and unmapped/malformed rows still fail loudly rather than silently dropping (FR-14, NFR-8)

**Given** CI's synthetic fixture gate
**When** the BAC credit fixture is regenerated
**Then** it uses real section titles and real (non-pipe) row text shape — matching real pdfplumber extraction — with goldens updated and zero manual edits required for must-parse lines (FR-35, AD-11)

**Given** this story's scope
**When** a future bank/product needs SIGN_VARIANT (e.g. a BAC debit adapter)
**Then** that remains out of scope — this story implements only the CURRENCY_VARIANT path (see ARCHITECTURE-SPINE.md Deferred table)

### Story 4.10: Row-level review data model + per-row commit

As a developer enabling per-transaction routing,
I want import_candidate_rows to carry independent status and resolution, and commits to operate on one row at a time,
So that a statement's rows can be routed to different lists instead of committing as one atomic unit.

**Acceptance Criteria:**

**Given** the import_candidate_rows table
**When** the migration runs
**Then** it gains status (pending | committed | deleted | excluded_zero_amount, default pending), resolved_list_id, resolved_at, and a non-null sequence column
**And** it does not gain a resolved_ledger_entry_id — the link is carried by the reverse FK below, and two pointers that must agree is a drift hazard

**Given** row ordering must be deterministic across sessions
**When** rows are created
**Then** sequence is assigned 0-based per statement from parse order — insertion order and created_at are not relied upon, because neither is guaranteed stable across a single bulk-insert flush

**Given** uq_import_batches_statement_id encodes AD-4's per-statement batch boundary
**When** per-row commits are introduced
**Then** the constraint is dropped — one statement now legitimately spawns many batches — and its job is translated to row grain, not deleted, via ledger_entries.import_candidate_row_id (UUID, nullable, UNIQUE, FK to import_candidate_rows)
**And** AD-4 is amended before this story starts: batch boundary becomes "one commit action", the "partial-commit vs batch fights" Prevents clause is rewritten (partial commit is now the normal case), and the rollback-granularity shift for FR-30 / Story 5.6 is recorded

**Given** double-commit protection must stay two-layered
**When** a row is committed
**Then** the guarded conditional UPDATE (WHERE id = :row_id AND status = 'pending') remains the fast path and clean-error path, and the new UNIQUE constraint is the database backstop — an IntegrityError is caught via the existing begin_nested() SAVEPOINT pattern and surfaced as ImportRowNotAvailableError
**And** the guarded UPDATE must precede the ledger INSERT in the same transaction
**And** both layers exist before the old constraint is dropped, not after — today's commit path has an application check plus a DB backstop, and ledger_entries carries no __table_args__ at all, so dropping uq_import_batches_statement_id without a replacement would leave the commit path with no database-enforced guard whatsoever

**Given** manual (non-import) ledger entries
**When** the UNIQUE column is added
**Then** they keep import_candidate_row_id NULL and are unaffected — Postgres permits unlimited NULLs under UNIQUE, so no backfill is required
**And** undo-then-reassign reuses the value cleanly because ledger entries are hard-deleted (no deleted_at / is_deleted column), so no partial index is needed

**Given** the concurrent-commit race regression test at test_import_sessions_integration.py:316
**When** commit moves to row grain
**Then** an equivalent row-grain race test exists, so the backstop keeps the regression coverage that test was written to provide

**Given** a parsed row with a zero amount
**When** the session is created
**Then** the row is persisted with status excluded_zero_amount and never enters the review queue, and its per-statement count remains queryable for the completion summary

**Given** a row resolves (assigned or deleted)
**When** the commit completes
**Then** the statement flips to committed only once every non-excluded row has left pending — an all-deleted statement also reaches this state, reusing the idle-check shape of _release_source_pdf_if_idle

**Given** bulk review runs against a session
**When** it commits
**Then** it skips excluded_zero_amount rows and marks every row it touches committed, and rejects any statement already carrying non-pending rows with import_row_not_available — a backstop, since Story 4.14 makes that state unreachable from the UI

**Given** statement-level individual review is retired
**When** this story lands
**Then** AssignIndividualImportService, SkipStatementService, validate_individual_accept_eligible, validate_individual_skip_eligible, and the commit_individual_statement / skip_individual_statement routes are deleted, not left as unused parallel paths

### Story 4.11: Row-level review API — rows, assign, delete, undo, edit

As a client rendering per-transaction review,
I want the session payload to carry individual rows and endpoints to resolve them one at a time,
So that the review UI can act on a transaction instead of a file.

**Acceptance Criteria:**

**Given** GET /import/sessions/{sessionId}
**When** a staged session is fetched
**Then** each statement carries a rows array (id, sequence, description, amount, currency, posted_date, status) plus zero_amount_excluded_count, and the session carries the current undo pointer or null
**And** only pending rows are included in the queue payload

**Given** left and right card actions
**When** either fires
**Then** both call POST /import/sessions/{sessionId}/rows/{rowId}/assign with a list_id body — one endpoint, with the client supplying the default list or the picked list, mirroring how commitIndividualStatement already serves both accept paths

**Given** the up action
**When** it fires
**Then** POST /import/sessions/{sessionId}/rows/{rowId}/delete soft-marks the row deleted so undo can restore it

**Given** undo must target the last action rather than a row
**When** POST /import/sessions/{sessionId}/undo is called
**Then** it reads the session's undo pointer; an assign is reversed by deleting the created ledger entry and returning the row to pending; a delete is reversed by returning the row to pending
**And** the restored row re-enters the queue at its original sequence position, not at the front
**And** undo is single-level — a second consecutive call returns import_nothing_to_undo

**Given** the undo pointer must survive a reload
**When** a row resolves
**Then** last_resolved_row_id, last_resolved_action, and last_resolved_prior_status are persisted on import_sessions and cleared once used or superseded

**Given** a pending row's description needs correcting
**When** PATCH /import/sessions/{sessionId}/rows/{rowId} is called with a description
**Then** it succeeds only while the row is pending, enforced server-side by the same guarded-UPDATE idiom

**Given** row-level failure modes
**When** an operation cannot proceed
**Then** import_row_not_found, import_row_not_available, and import_nothing_to_undo are returned following the existing code convention consumed by mapIndividualReviewError

### Story 4.12: Commit batch, dedup summary, land on settle strip

As a user finishing an import,
I want commits to dedupe silently, summarize imported/skipped counts, and land on the Soft-Ledger settle strip,
So that I see the number I came to update (J1 climax).

**Acceptance Criteria:**

**Given** I assign a cleanly parsed transaction to a list
**When** commit runs
**Then** an Import Batch is journaled for that commit action and its ledger row is written with domain identity dedup (FR-20, FR-34, AD-4)
**And** payer defaults to me and remains editable (FR-19)
**And** FX materialization from Epic 3 applies to non-CRC lines

**Given** overlapping re-import of parsed rows
**When** commit finishes
**Then** duplicates are skipped without mid-import interruption
**And** imported-new and skipped-duplicate counts are exposed for the completion summary, which Story 4.14 renders (FR-20, UX-DR22)

**Given** the session completes (no Epic 5 conflicts yet)
**When** the review queue is exhausted
**Then** I land on shared-expenses for the list that received the most rows this session — the completion summary itself is Story 4.14's surface, not this story's
**And** the Soft-Ledger settle strip reflects the new committed purchases — same strip as Epic 3, no parallel settle UI
**And** when Epic 5 same-price conflicts exist, Story 5.7 inserts conflict review after this summary and before Soft-Ledger land — do not land on a confident strip then interrupt (UX-DR22)

**Given** a statement parsed correctly and committed with no unresolved quarantine
**When** the Import Batch commit succeeds
**Then** the statement PDF file is deleted from the operator volume and its Postgres path reference is cleared (AD-3) — ledger rows in SQL are the durable record
**And** clean PDF delete is skipped if the statement is incomplete or still has unresolved quarantine (Epic 5 Stories 5.2–5.3 own retain-until-resolved)

**And** same-price / quarantine flows are out of scope for this story (Epic 5); Epic 5 retains the PDF while quarantine needs it, then clears when resolved

### Story 4.13: Individual review card — four-direction actions + inline title edit

As a user reviewing transactions one at a time,
I want a focused card with four directional actions and an editable title,
So that routing each transaction is deliberate but fast.

**Acceptance Criteria:**

**Given** individual review starts
**When** the panel renders
**Then** the screen shows a dimmed backdrop with one medium card centered — not a scrollable list of rows
**And** the card shows the transaction description as title, the store as subtitle when a structured merchant field exists (blank today), the amount as body, and the posted date at the bottom (date only — no time exists in the pipeline)

**Given** the four card actions
**When** I act
**Then** left assigns to the default list, right assigns to the selected list, up deletes, and down undoes
**And** left, right, and up are available as both edge buttons and touch swipes; down is a button on all platforms including mobile, never a gesture

**Given** the selected list
**When** I move between transactions
**Then** the picker selection persists across the whole session rather than resetting per row, and left/right disable under the same conditions the existing canAcceptChosen / canAcceptDefault booleans encode

**Given** a successful assign or delete
**When** the action resolves
**Then** the card is removed optimistically, the next row advances, and undo becomes available

**Given** accessible / Reduce Motion needs
**When** review is used
**Then** every outcome is operable without swiping (UX-DR19) — the edge buttons are the primary affordance, not swipe theatre

**Given** the transaction title needs correcting
**When** I click it once
**Then** it enters a primed state showing a soft border in the space the input will occupy, with no input mounted yet
**And** a second click mounts the input and focuses-and-selects it, mirroring ListsPanel's renameInputRef effect
**And** this uses explicit click-count state rather than the native dblclick event, so two clicks with any gap between them both count

**Given** an active title edit
**When** I press Enter, press Escape, or click outside
**Then** Enter commits via PATCH (trimming, rejecting empty, no-op if unchanged — mirroring commitRename), Escape cancels, and an outside pointerdown cancels from either primed or editing back to idle
**And** errors render inline with role="alert" as renameErrors does today

**Given** the card advances to the next transaction
**When** row.id changes
**Then** title edit state resets to idle and any draft is discarded

**Given** the row was resolved concurrently between prime and commit
**When** the PATCH returns import_row_not_available
**Then** the card refreshes from the next GET rather than showing a stale edit

### Story 4.14: Resume entry point + session completion summary

As a user who closed the app mid-review,
I want to resume where I left off instead of re-uploading,
So that a long review survives interruption and never leaves a half-reviewed session in an ambiguous state.

**Acceptance Criteria:**

**Given** GET /import/sessions/active
**When** called
**Then** it returns the caller's most recent non-discarded session holding at least one pending row, or null

**Given** the upload page
**When** it loads
**Then** it fetches the active session server-side (page.tsx is already force-dynamic) and passes it to UploadPanel as an initial prop — today UploadPanel only knows about a session uploaded in the same visit, which is why closing the tab currently strands it

**Given** an active session with every row still pending
**When** the upload page renders
**Then** Discard, Bulk, and Review Individually are all offered — today's three actions, unchanged

**Given** an active session with at least one resolved row and at least one pending row
**When** the upload page renders
**Then** only Resume review and Discard are offered — no Bulk path and no new upload
**And** Resume deep-links to /upload/review/{sessionId}, which picks up at the first pending row by sequence with the undo pointer intact

**Given** a partially reviewed session
**When** I discard it
**Then** already-committed ledger rows are retained — only the remaining pending rows are abandoned and the source PDF is released via the existing _release_source_pdf_if_idle path
**And** the confirmation copy states this explicitly, because "discard" otherwise reads as "undo everything"

**Given** the review queue is exhausted
**When** the session completes
**Then** a summary reports rows committed by destination list, rows deleted, zero-amount rows excluded across all statements, statements that failed to parse, and the imported-new / skipped-duplicate counts Story 4.12 exposes — the failed-statement report replaces Story 4.8's per-statement skip card (FR-18)
**And** this story owns the completion summary surface; Story 4.12 owns commit correctness and the post-summary landing

### Story 4.15: "New" badge on freshly imported rows

As a user who just imported transactions,
I want newly imported rows marked in the destination list,
So that I can find them to adjust splits without hunting through history.

**Acceptance Criteria:**

**Given** a row-level commit creates a ledger entry
**When** the entry is written
**Then** ledger_entries.import_reviewed_at is null

**Given** a ledger entry in a list view
**When** it has provenance 'parser' and a null import_reviewed_at
**Then** ReceiptRow renders a badge via a new optional prop, using the existing Chip / ChipTone component rather than a bespoke element

**Given** I interact with a badged entry
**When** I edit it in any way
**Then** import_reviewed_at is set and the badge clears — dismissal is not gated on split fields specifically, so it stays correct once a split-edit control exists

**Given** no split-edit control is wired into ReceiptRow yet
**When** I want to clear a badge I have finished with
**Then** an explicit dismissal affordance exists, so the badge cannot become permanently stuck

**Given** this story's scope
**When** the badge points the user at adjusting a split
**Then** wiring an actual split-edit control into ReceiptRow remains out of scope — ReceiptRowMenu's Edit item is currently non-persisting, and that gap is tracked separately

### Story 4.16: Multi-file upload — pending queue, per-item removal, duplicate detection

As a user uploading statements,
I want to select multiple PDFs at once, remove one from the batch before it's processed, and be warned if I pick a file I've already queued or staged,
So that I can queue several statements in one pass instead of uploading them one at a time.

**Acceptance Criteria:**

**Given** the Upload page
**When** I open the file picker
**Then** I can select more than one PDF at once, and each selected file appears as its own pending entry before any upload request is sent for it

**Given** a pending (not-yet-processed) entry in the queue
**When** I remove it
**Then** it is dropped from the queue with no API call ever made for that file

**Given** a file I select
**When** its content duplicates a file already pending in this queue, or an already-staged (undiscarded) Import Session's statement from this browser session
**Then** the duplicate is rejected with a clear inline error and is not queued

**Given** a queued batch with no duplicates
**When** processing runs
**Then** each file is uploaded and staged as its own Import Session — a single file's rejection does not block or discard the others in the batch, and each entry in the queue view shows its own outcome (staged / failed / rejected)

**Given** v1's adopted ingest architecture (synchronous, in-process, no job queue — `architecture-finance-helper-2026-08-03/.memlog.md`)
**When** this story processes a queued batch
**Then** each file's detect/split/parse still runs synchronously in-process, one file at a time — this story only shapes the API/UI boundary (one upload call per file, independent per-file status) so that a later move to concurrent/background processing per file is additive
**And** actual concurrent or background ("separate threads") processing is explicitly out of scope for this story and requires its own architecture decision (correct-course) before being adopted — it is not decided or implemented here

## Epic 5: Import resilience (then settle polish)

Ordered: parse failure/quarantine/hand-fix → wire FR-43 on strip → reassign/rollback → same-price + aliases → then simplify (FR-41) + statement-cycle selector (FR-39).

**FRs covered:** FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28, FR-29, FR-30, FR-39, FR-41, FR-43 (wire)  
**Demo gate:** J3 + J7 before simplify stories  
**Sprint order:** Do not start Stories 5.9 / 5.10 until Stories 5.1–5.8 are demonstrable for the J3 + J7 demo gate.

### Story 5.1: Parse failure → side-by-side comparison

As a user importing a statement,
I want a clear alert and a side-by-side PDF vs extracted-items view when automatic parse fails,
So that nothing enters the ledger silently and I can see the evidence (J3).

**Acceptance Criteria:**

**Given** a statement in an Import Session cannot be parsed correctly on the automatic path
**When** review reaches that statement
**Then** the system alerts and does not process that statement into the ledger on its own (FR-24, NFR-8)
**And** required / must-parse data is never silently dropped

**Given** parse failure on one statement in a multi-statement upload
**When** that statement fails
**Then** sibling statements in the same session are not automatically rejected or discarded (FR-24, FR-15 continuity)

**Given** parse failure
**When** the comparison surface opens
**Then** the original PDF is shown beside extracted items — on phone, PDF in the lower half, items above (FR-25, UX-DR12)
**And** comparison appears only on failure (not on clean parse)
**And** the view is usable on phone and desktop (NFR-7)
**And** comparison regions are labeled for assistive tech (UX-DR19)

**Given** Reduce Motion / no-swipe constraints
**When** I use the comparison surface
**Then** outcomes remain operable without required motion (UX-DR19)

**Given** this story alone
**When** I am on the comparison surface
**Then** accept-with-quarantine / dismiss actions are not required yet — Story 5.2 adds those decisions; this story’s exit is “failure is visible with evidence, ledger untouched”

**Given** CI
**When** parse-failure coverage runs
**Then** at least one synthetic parse-failure fixture (anonymized; no real PII) opens the comparison surface — mirrors the Story 4.5 golden pattern for the failure path (NFR-2, AD-11)

### Story 5.2: Accept with quarantine or dismiss

As a user facing a failed parse,
I want to accept with quarantine, dismiss the statement, or dismiss the whole file,
So that partial data only enters the ledger after an explicit decision in front of the evidence.

**Acceptance Criteria:**

**Given** the comparison surface from Story 5.1
**When** I choose accept with quarantine
**Then** successfully parsed rows import into the destination list’s ledger
**And** unparsed / unresolved rows are stored as quarantine on that Statement
**And** the statement is marked incomplete (FR-26, AD-17)
**And** nothing partial enters the ledger without this explicit human decision

**Given** accept with quarantine and zero successfully parsed rows (all unresolved)
**When** I confirm
**Then** the action is allowed — statement is marked incomplete with quarantine only
**And** no purchase rows enter the ledger until hand-fix (Story 5.3)
**And** Soft-Ledger will disclose incomplete once Story 5.4 is wired

**Given** the comparison surface
**When** I dismiss the statement
**Then** that statement is not committed to the ledger
**And** siblings in the Import Session remain available to review

**Given** the comparison surface
**When** I dismiss the entire file
**Then** remaining uncommitted statements from the upload are abandoned
**And** no further ledger writes occur for those statements

**Given** accept-with-quarantine committed
**When** unresolved quarantine remains
**Then** the statement PDF is retained on the operator volume — not deleted on this commit (AD-3 continuity from Story 4.12)
**And** PDF deletion (Story 4.12 clean-commit path) applies only when the statement has no unresolved quarantine and commit succeeded

**Given** EN/ES locale
**When** quarantine / dismiss copy is shown
**Then** chrome and outcome labels are localized (UX-DR18)

### Story 5.3: Hand-edit unresolved rows against PDF

As a user with quarantined rows,
I want to edit unresolved lines by hand against the rendered PDF,
So that I can complete the statement without waiting for a perfect automatic parse.

**Acceptance Criteria:**

**Given** a statement accepted with quarantine (Story 5.2)
**When** I open unresolved rows
**Then** I can edit them by hand while the original PDF remains visible for comparison (FR-27)
**And** editing works on phone viewport (NFR-7)

**Given** I save a hand-entered / hand-fixed value
**When** the row is stored
**Then** provenance distinguishes it from parser-emitted rows (FR-27)
**And** money fields remain NUMERIC/Decimal + ISO 4217 (AD-5)

**Given** I attempt to save with empty amount, non-numeric amount, or missing currency
**When** validation runs
**Then** the save is rejected with a clear error
**And** required CanonicalLine money fields must validate before the row counts as resolved

**Given** some quarantine rows are fixed and others remain unresolved
**When** I leave the editor
**Then** the statement stays incomplete
**And** the PDF is retained while any unresolved rows remain
**And** Soft-Ledger stays incomplete for the affected period (once Story 5.4 is wired)

**Given** all unresolved rows for a statement are resolved
**When** the statement is no longer incomplete
**Then** the statement incomplete flag clears
**And** the PDF may be deleted from the operator volume and its path reference cleared (AD-3) — ledger rows remain the durable record

**Given** this story alone
**When** settle-up is viewed
**Then** incomplete-disclosure wiring is not required yet — Story 5.4 turns on FR-43 for real quarantine data

### Story 5.4: Wire incomplete-balance disclosure on strip

As a list member,
I want the Soft-Ledger settle strip to disclose when quarantined or unresolved rows affect the period,
So that I never trust a confident total that silently omits purchases (J7).

**Acceptance Criteria:**

**Given** quarantined or unresolved rows affect the current period on a list
**When** I view shared-expenses
**Then** balances disclose that they are incomplete — the UI does not present a confident settle-up total that silently omits unresolved purchases (FR-43, NFR-6)
**And** incomplete lights iff domain reports unresolved quarantine (or unresolved same-price conflicts) intersecting the viewed period — UI reads that signal only; no decorative incomplete
**And** disclosure uses the Epic 3 pattern slot: calm/muted below the island strip (same inset), not over the hero amount (UX-DR8, Story 3.6)
**And** disclosure includes a calm path to resolve (link/action to unresolved quarantine and/or conflict review) — not a dead hint and not color-only (UX-DR19)

**Given** incomplete disclosure is shown
**When** assistive tech reads the surface
**Then** incompleteness is announced — not color-only (UX-DR19)
**And** EN/ES copy is localized (UX-DR18)

**Given** no quarantine / unresolved rows affect the period
**When** I view the strip
**Then** no incomplete disclosure appears (honest empty — same as Story 3.6)

**Given** quarantine exists on a statement outside the currently selected cycle/period
**When** I view Soft-Ledger for the selected period
**Then** incomplete disclosure does not light solely because of other cycles — only unresolved rows that affect the viewed period flag incompleteness

**Given** I resolve remaining quarantine (Story 5.3)
**When** the period is complete again
**Then** the incomplete disclosure clears and the strip returns to a confident settle figure

### Story 5.5: Reassign statement to another list

As a list member,
I want to move a statement filed to the wrong list to another list I belong to,
So that balances on both lists stay correct after the mistake.

**Acceptance Criteria:**

**Given** a committed statement (Import Batch) on list A
**When** I reassign it to list B that I belong to
**Then** ledger rows move with the statement
**And** balances on both lists reflect the move (FR-29)
**And** I see a one-line confirm that shares will follow destination list defaults unless item-level overrides already exist — no silent surprise
**And** reassign preserves `batch_id` — statement/batch identity does not fork

**Given** the destination list
**When** share allocations are applied after reassignment
**Then** shares follow destination list default rules unless item-level overrides already exist (FR-29, FR-9/10 continuity)

**Given** I am not a member of the target list
**When** I attempt reassignment
**Then** the action is rejected (NFR-3)

**Given** the statement is still incomplete / has quarantine
**When** I reassign it to list B
**Then** reassignment is allowed
**And** quarantine rows and the incomplete flag move with the statement to list B

**Given** reassignment completes
**When** I view Soft-Ledger on each list
**Then** settle strips update from the same Epic 3/4 balance path — no parallel settle math

### Story 5.6: Roll back an import batch

As a user who imported the wrong batch,
I want to remove a whole journaled Import Batch,
So that its ledger effect is undone and a later re-import does not leave duplicate leftovers.

**Acceptance Criteria:**

**Given** a committed Import Batch
**When** I remove that batch
**Then** the batch’s ledger effect is fully undone (FR-30, NFR-5, AD-4)
**And** rollback targets `batch_id` — not an ad-hoc row delete
**And** rollback undoes ledger effect on the list where the batch currently resides (safe after Story 5.5 reassign)

**Given** the batch is rolled back
**When** I re-import the same or overlapping statement later
**Then** there are no leftover duplicates from the rolled-back batch (FR-30, NFR-4)

**Given** other Import Batches on the same list
**When** I roll back one batch
**Then** sibling batches remain intact

**Given** a batch that was accepted with quarantine
**When** I roll back that batch
**Then** ledger rows for the batch are undone and that batch’s quarantine is cleared
**And** the PDF path is cleared if no longer needed for any remaining quarantine

**Given** Soft-Ledger after rollback
**When** I view the list
**Then** settle figures and incomplete disclosure (if any) reflect the post-rollback ledger only

### Story 5.7: Same-price conflict review (Manual | Parsed)

As a user finishing an import that collides with unresolved manual entries,
I want same-price matches collected and resolved with Manual or Parsed (one survivor),
So that I never auto-merge or double-count without an explicit choice (J7).

**Acceptance Criteria:**

**Given** a parsed line and an existing unresolved manual entry with the same price (equal amount + currency) on related lists within the date window
**When** import commit finishes
**Then** collisions are not auto-merged; they are collected and shown at end of import after the imported N / skipped M summary (FR-22, UX-DR22)
**And** conflict review runs before landing on Soft-Ledger as the trusted climax — do not land on a confident strip then interrupt (UX-DR22, Story 4.12 handoff)
**And** same-price window is list-configurable with product default ±3 calendar days, inclusive, in America/Costa_Rica (AD-10)
**And** related lists = lists where both the manual entry and the parsed commit’s destination share at least one common member with the acting user (user-visible membership)

**Given** equal numeric amounts but different currencies
**When** same-price detection runs
**Then** they are not treated as the same price — equal amount+currency is required

**Given** multiple manuals match one parsed line (or multiple parsed match one manual)
**When** conflicts are shown
**Then** all pairs are collected and resolved one collision at a time until none remain

**Given** I leave conflict review before all collisions are resolved
**When** I return later (or follow the Story 5.4 resolve path)
**Then** the unresolved conflict set persists across sessions and remaining collisions can be resumed
**And** Soft-Ledger stays non-confident / incomplete until the queue is cleared

**Given** the conflict review surface
**When** I resolve a collision
**Then** default path is pick Manual or Parsed — one survivor (FR-22, UX-DR14)
**And** conflict cards are keyboard-selectable; not swipe-driven (UX-DR14, UX-DR19)

**Given** I choose the escape “Not the same expense”
**When** I proceed
**Then** keeping both requires a harder double-count / overpay confirm than the survivor pick (FR-22)
**And** both remain only after that confirm

**Given** unresolved conflicts for the period
**When** I view Soft-Ledger
**Then** the strip must not show a confident hero total — prefer incomplete disclosure (Story 5.4) over a frozen/blank strip (UX-DR14)
**And** “blocked” means no Simplify / no all-clear affordance until conflicts are resolved — not an unusable app

**Given** EN/ES locale
**When** conflict labels are shown
**Then** copy is localized (UX-DR18)

**Given** this story alone
**When** I confirm Manual and Parsed are the same expense
**Then** alias storage is not required yet — Story 5.8 adds FR-23 aliases and FR-28 re-upload hand-fixed conflicts

### Story 5.8: Alias on confirm + hand-fixed re-upload conflict

As a user who matched a manual label to a bank line (or re-uploaded after a hand fix),
I want the manual label stored as an alias and the same conflict UI on near-matches,
So that I don’t silently duplicate hand-fixed rows and aliases are ready for later use.

**Acceptance Criteria:**

**Given** I confirm a manual entry and a bank line are the same expense (Story 5.7 survivor path)
**When** the match is saved
**Then** the system stores the manual label as an alias for that bank description (FR-23)
**And** v1 does not use aliases for ML categorization

**Given** a re-upload produces a parsed row that matches or near-matches a hand-fixed row
**When** conflict detection runs
**Then** the system prompts with the same FR-22 resolution UI (Manual | Parsed; confirmed “Not the same expense”) (FR-28)
**And** it never silently duplicates the hand-fixed row
**And** v1 near-match = same amount+currency within the list date window (reuse AD-10); description similarity is not required to prompt

**Given** alias or hand-fixed conflict resolution completes
**When** I return to shared-expenses
**Then** Soft-Ledger reflects a single coherent survivor set — no parallel conflict ledger

### Story 5.9: Settle-up simplify (suggested transfers)

As a list member,
I want an optional simplify that suggests fewer CRC transfers to settle the period,
So that I can see a shorter payment plan without the app recording that anyone paid.

**Acceptance Criteria:**

**Given** Soft-Ledger shows who owes whom for the period
**When** I open Simplify
**Then** I see suggested transfers that preserve net balances in CRC (FR-41)
**And** simplify does not record payments (v2) — no “Mark settled” / payment CTA (UX-DR20, AD-21)

**Given** unresolved same-price conflicts remain for the period (Story 5.7)
**When** I view Soft-Ledger
**Then** Simplify is unavailable — no Simplify affordance until those conflicts are resolved (aligns with Story 5.7)

**Given** the period is incomplete from quarantine only (no unresolved same-price conflicts)
**When** I open Simplify
**Then** Simplify may open and incomplete disclosure remains visible — it does not present a confident plan that hides missing rows (FR-43 continuity)

**Given** a solo list, already-minimal two-member nets, or all-zero balances
**When** I open Simplify
**Then** Simplify remains available but may show empty / no-op suggestions
**And** it never invents debts

**Given** Simplify copy
**When** it is shown
**Then** it never says “paid” and must not look like recording settlement (UX-DR17)
**And** EN/ES chrome is localized; amounts stay CRC-first (UX-DR18)

**Given** I dismiss Simplify
**When** I return to the strip
**Then** underlying net balances are unchanged

### Story 5.10: Statement-cycle period selector

As a list member,
I want the shared-expenses period to align to statement/billing cycles, and to pick which cycle when cards differ,
So that settle-up matches the statement window I care about.

**Acceptance Criteria:**

**Given** shared-expenses for a list
**When** the view loads
**Then** the default period aligns to statement/billing cycles (FR-39)
**And** when available, prefer the statement/cycle of the most recently imported card on that list; otherwise use the product default

**Given** cards on the list have different cycles
**When** I open the period control
**Then** I can select which statement/cycle to view (FR-39)
**And** Soft-Ledger strip + receipts + incomplete disclosure recalculate for that period

**Given** a single-cycle list
**When** I view shared-expenses
**Then** no multi-cycle picker friction is required — default cycle is enough

**Given** a list with no cards or no cycle metadata
**When** shared-expenses loads
**Then** the view falls back to a sensible calendar period (e.g. current month) without blocking settle-up

**Given** EN/ES locale
**When** cycle labels are shown
**Then** chrome is localized; card labels remain free text (UX-DR18)
