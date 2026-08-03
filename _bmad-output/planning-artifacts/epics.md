---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md
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

FR-17: Before commit under review routing, the user chooses bulk (whole upload to one list) or individual (one statement at a time); phone Individual uses true swipes (right → chosen list after picker, left → configurable default, down → skip); desktop uses labeled buttons for the same outcomes.

FR-18: In individual review, each statement can be accepted into a chosen list, accepted into the configurable default (FR-12), or skipped (never stored); the user can dismiss an entire file; accept commits only after parse success or explicit accept-with-quarantine.

FR-19: Every shared expense has an explicit editable payer; on statement import and manual entry, payer defaults to the current user; changing payer updates who others should reimburse in settle-up.

FR-20: After a successful import (or re-import), the user is told how many new rows were imported and how many duplicates were skipped; overlapping parsed re-uploads do not duplicate canonical identities; ordinary parsed-vs-parsed duplicates never interrupt mid-import.

FR-21: A user can add individual expense items to a list without waiting for statement import; create requires amount, description, and payer (defaults to current user); Adjust split disclosure offers whole-line / absolute per member / percentage (list default until opened); provenance distinguishes manual from parser rows; items appear in receipt list and settle-up.

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

FR-35: For a supported product, the walmart fixture import persists every must-parse line with required canonical fields and zero manual edits (v1 parsing exit bar).

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

UX-DR10: Account menu is minimal: sign out, password reset, Language EN/ES (remembered on account; first visit from browser), Theme Light / Dark / System (remembered on account; defaults to System) — no profile/settings product surface.

UX-DR2: Load and apply locked typography: Petrona (brand, strip amounts, inline money) and Manrope (chrome, who-line, body, buttons, tabs); tabular nums for money; do not substitute Inter/Roboto as brand type; preserve Soft-Ledger relative hierarchy (amount ≫ who ≫ row).

UX-DR3: Implement Soft-Ledger hybrid spacing/shape tokens (4px rhythm, strip-inset, page-gutter, nav-x, row-y; rounded sm 8 / md 10 / lg 12; no pill primary CTAs).

UX-DR4: Build Balance strip (settle-up strip island) component: who-line muted, hero amount in owe/owed color by polarity, optional primary CTA; inset island with surface fill and 1px border; always lead list surfaces with settle number.

UX-DR5: Build Receipt row component: two-column title/when left + amount right; bottom hairline only; airier row padding; newest-first; FX audit shows original + converted CRC when needed.

UX-DR6: Build Section label, Top nav (transparent brand + list title), Tab bar (List / Upload / Account; inactive muted / active accent), Hint (muted under strip), and Primary button (moss accent, rounded.sm) per DESIGN.md component specs.

UX-DR7: Lists homepage uses same Warm Balance tokens with list name + balance in owe/owed (or settled/zero) for instant who-owes-whom scan.

UX-DR8: Incomplete-balance disclosure placed calm/muted below the strip island (same inset), not over the amount; quarantine incompleteness is announced to assistive tech, not color-only.

UX-DR9: Implement IA surfaces: First paint (remembered last-opened list else Lists homepage), Lists homepage, Shared-expenses, Upload, Individual review, Bulk review, Parse comparison, Card registration, Same-price conflict review, Manual expense, Invite, Invitee signup landing, Account menu — per EXPERIENCE.md.

UX-DR10: Account menu is minimal: sign out, password reset, Language EN/ES (remembered on account; first visit from browser), Theme Light / Dark / System (remembered on account; defaults to System) — no profile/settings product surface.

UX-DR11: Phone Individual review: true swipe commits — right → chosen list (list picker first), left → configurable default, down → skip; desktop Individual review uses labeled buttons as primary for the same three outcomes; accessible non-gesture equivalents required.

UX-DR12: Parse comparison pane: PDF in lower half on phone, extracted items above; actions accept-with-quarantine or dismiss statement/file; comparison only on failure.

UX-DR13: Card registration prompt blocks review until user-chosen label + IBAN saved; fixed card→list routing is after registration, not inside the prompt; UI shows user’s label, not bank product codes.

UX-DR14: Same-price / hand-fixed conflict UI: Manual|Parsed cards (one survivor); escape “Not the same expense” harder than cards, keeps both only after double-count confirm; not swipe; resolve before confident settle-up.

UX-DR15: Manual expense form: amount, description, payer (defaults signed-in user), Adjust split disclosure (whole-line / absolute / percentage); save updates newest-first row and settle-up immediately.

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
FR-21: Epic 3 — Manual item entry
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
FR-35: Epic 4 — Walmart acceptance bar
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

### Epic 2: Shared lists & household membership
Users create named lists, invite members by email (registered + unregistered → land on inviting list), and configure even/percentage list defaults plus item/receipt split overrides.
**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-10
**Demo gate:** unregistered invite → signup → lands on inviting list

### Epic 3: Manual expenses & settle-up
Users log shared expenses and see who owes whom in CRC on Soft-Ledger (Warm Balance tokens). Balances from per-transaction shares + payer + FR-45 line-type rules; CanonicalLine-compatible money fields; FX; incomplete-disclosure pattern ready (shows incomplete only when data says so).
**FRs covered:** FR-19 (define), FR-21, FR-38, FR-40, FR-42, FR-43 (pattern), FR-44, FR-45
**Demo gate:** J5 + J2

### Epic 4: Statement upload & review
Users register cards by IBAN, upload PDFs, detect/split/parse via adapters (BAC walmart + Promerica stub), choose routing/review modes, commit with dedup summary. Reuses Epic 3 payer + Soft-Ledger strip — exit = commit updates same settle strip.
**FRs covered:** FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19 (import), FR-20, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37
**Demo gate:** J1 climax on Soft-Ledger strip

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

## Epic 2: Shared lists & household membership

Users create named lists, invite members by email (registered + unregistered → land on inviting list), and configure even/percentage list defaults plus item/receipt split overrides (override UI deferred to Epic 3).

**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-10  
**Demo gate:** unregistered invite → signup → lands on inviting list

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
**Then** access is denied (NFR-3)

**Given** I select a list row
**When** navigation completes
**Then** I open that list’s detail surface (shared-expenses shell may be empty until Epic 3)

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
