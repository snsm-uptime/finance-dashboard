---
id: SPEC-finance-helper
companions:
  - line-types.md
  - ../../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md
  - ../../planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md
sources:
  - ../../planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md
  - ../../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/stack-options.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# finance-helper v1

## Why

**Pain to solve.** Costa Rican bank statements (especially BAC multi-card PDFs mixing CRC/USD sections) are the only available data source — no Plaid/Belvo coverage — so households currently settle up by reading PDFs by hand. **finance-helper** is a self-hosted multi-user web app that turns those PDFs into a queryable shared ledger organized by **lists**, with v1 proving the thin vertical slice: upload → detect/split/parse → review/commit → shared-expenses settle-up in CRC.

## Capabilities

- **CAP-1**
  - **intent:** A peer can create an account with email and password, sign in and out, reset a forgotten password via email, and from the Account menu choose UI language (EN/ES) and appearance theme (Light / Dark / System).
  - **success:** Duplicate emails rejected; passwords stored hashed only; after signup the user is authenticated with a personal list (CAP-2); reset proves email control and invalidates the prior password; invalid credentials get a generic failure; language defaults from browser/`Accept-Language` on first visit then is remembered on the account; theme defaults to System on first visit then is remembered on the account (Light/Dark pin Warm Balance token sets); no Settings/profile product beyond Account chrome.

- **CAP-2**
  - **intent:** Every new account gets a personal list; an authenticated user can create and rename additional lists they own; list data is visible only to members.
  - **success:** Exactly one personal list exists immediately after signup; owners can create more named lists; non-members cannot read expenses or balances; there is no privileged product admin role.

- **CAP-3**
  - **intent:** A list owner can invite someone by email; registered users get a join invite; unregistered addresses get signup guidance and land on the inviting list after signup.
  - **success:** Invite delivery uses transactional email in the **inviter’s** Account language (EN/ES); post-signup redirect opens the inviting list with settle-up context (not a blank home).

- **CAP-4**
  - **intent:** Lists default to an even split among members (configurable to standing percentages); creating or editing an item/receipt can override via whole-line assignment, absolute amounts per member, or a percentage split.
  - **success:** Percentage configs (list or item) that do not sum to exactly 100% are rejected; absolute member amounts that do not sum to the line/receipt total are rejected; only the list owner edits the standing default; overrides produce per-transaction share allocations used by settle-up; after floor-division any leftover minor unit goes to the **list creator**.

- **CAP-5**
  - **intent:** Users register cards with a user-chosen label keyed primarily by IBAN (or equivalent extracted identity); imports match known IBANs and prompt registration for unknown ones before commit proceeds.
  - **success:** IBAN match reuses the existing label as the human import identifier; unknown IBAN blocks review until labeled; each card chooses fixed-list destination or review-routing with a configurable low-effort default list; v1 enforces at most one active fixed list per card without foreclosing multi-list later.

- **CAP-6**
  - **intent:** An authenticated user uploads a bank-statement PDF; the system detects bank/product and splits multi-statement files into N statements each with its own identity and destination.
  - **success:** Non-PDF rejected clearly; detection uses override → filename → content and fails loudly when unknown/ambiguous; failure or skip of one statement does not discard siblings by default; upload works on phone and desktop viewports.

- **CAP-7**
  - **intent:** Under review routing, the user chooses Bulk (whole upload → one list) or Individual (one statement at a time: chosen list, configurable default, or skip / dismiss file).
  - **success:** Phone Individual review uses true swipe commits mapped **right → chosen list** (after list picker), **left → configurable default list**, **down → skip**; desktop uses labeled buttons for the same three outcomes; list picker precedes high-intent accept; accessible non-gesture equivalents exist; skip stores nothing for that statement.

- **CAP-8**
  - **intent:** Users can add a manual expense to a list without waiting for a statement; every shared expense has an explicit editable payer defaulting to the current user.
  - **success:** Create sheet requires **amount**, **description**, and **payer** (default current user); **Adjust split** disclosure offers whole-line / absolute fragments / percentage (list default until opened); items carry `hand` provenance, appear in the receipt list and settle-up immediately, and always have a payer set when committed.

- **CAP-9**
  - **intent:** When automatic parse fails for a statement, the user sees the PDF beside extracted rows and may accept with quarantine or dismiss; unresolved rows can be hand-fixed; balances disclose incompleteness.
  - **success:** Comparison appears only on failure; accept-with-quarantine imports good rows, stores unresolved durably on the Statement, marks it incomplete; dismiss abandons that statement/file path; nothing partial commits without that explicit choice; phone comparison places PDF in the lower half.

- **CAP-10**
  - **intent:** Re-imports dedupe by canonical identity; same-price manual↔parsed collisions and hand-fixed↔re-parse collisions are resolved by the user; misfiled statements can be reassigned; bad imports roll back as journaled batches.
  - **success:** Parsed duplicates never duplicate ledger lines and summarize as imported N / skipped M; both same-price and hand-fixed↔re-parse conflicts use the same resolution UI — default **pick Manual or Parsed** (one survivor); escape **“Not the same expense”** keeps both only after a confirm that warns the choice can make someone owe more (double-count risk); escape is harder than the survivor pick (not an equal third peer button); confirmed same-expense links store manual label as bank-description alias (no ML use in v1); reassignment updates both lists' balances; Import Batch rollback undoes that statement commit atomically.

- **CAP-11**
  - **intent:** List members open a shared-expenses view for a statement/billing cycle showing who should return what to whom in CRC, with a receipt-style item list and optional transfer simplification.
  - **success:** Settle-up is CRC-only using materialized FX at commit (BCCR purchase/statement date; nearest prior + fallback flag if missing; no user FX override); foreign lines show original + CRC for audit; Simplify reduces transfers without recording payment or saying “paid”; only included line types (`line-types.md`) affect allocations; incomplete/quarantined periods are disclosed; when cycles differ the user selects which cycle to view.

- **CAP-12**
  - **intent:** Bank support is pluggable via detect → split → parse → normalize → stage → review → commit without rewriting core import, dedup, or list logic.
  - **success:** Adapters emit CanonicalLine fields; domain alone computes dedup identity at commit; BAC **walmart** fixture persists every must-parse line with required fields and zero manual edits; Promerica stub (or contract tests) exercises multi-statement extension; dual-column amounts prefer nonzero, then CRC if both nonzero; installment schedules are distinct and excluded from settle-up without double-counting purchases.

## Constraints

- Self-hosted Compose deploy: `db` + `api` + `ui` (+ host reverse proxy); Postgres volume and PDF volume outside the repo; no real statements/PII in git.
- Hexagonal dependency rule (AD-1): UI → HTTP API only; domain has no framework/PDF imports; bank adapters return normalized rows only — they do not commit or own lists.
- Durable app state in PostgreSQL only; PDF bytes on disk with path references (not `bytea`, not object storage in v1).
- Import Session stages an upload; Import Batch commits **per Statement**; settle math reads committed batches only.
- Money: Postgres `NUMERIC` + ISO 4217; domain `Decimal`; never float.
- Auth session: httpOnly Secure cookie on same-origin (or BFF); no Bearer tokens in `localStorage`.
- Posted dates and cycle boundaries use `America/Costa_Rica` after ISO-8601 normalization.
- UI binding: `EXPERIENCE.md` + `DESIGN.md` (Warm Balance / Soft-Ledger); component kits may supply unstyled primitives only — template defaults are not brand.
- Accessibility floor WCAG 2.2 AA; UI strings EN + ES from v1; language preference remembered on the account (Account menu), defaulting from browser on first visit; appearance theme Light / Dark / System remembered on the account, defaulting to System — not a Settings product.
- CI release gate uses synthetic PDFs with known geometry + golden rows; operator real-PDF tests are optional parallel tier.
- Parsers/domain developed red→green; merge to `main` requires lint + api pytest (incl. goldens) + ui typecheck/lint + critical ui tests.
- SMTP (or equivalent) required for invites and password reset.
- Schema evolves via Alembic against the external volume — never recreate the volume for schema.
- Ledger schema reserves `category`, `category_confidence`, and `category_source` for post-v1 ML; categorization must never block import.

## Non-goals

- Recording settlement payments, drawing down debt, or settlement history (v2).
- Account profile/settings product (display name, notification prefs, session UI, FX overrides) — Account menu may hold sign-out, password reset, language, and theme only.
- ML categorization, trends/analytics, and personal-spending dashboards beyond the single shared-expenses view.
- Real Promerica parsing (stub/contract only until samples exist).
- CSV/HTML statement formats in v1 (contract must allow later; PDF only now).
- CLI surface; open-source release packaging (docs/CI/license/support policy) — stay generic with no personal data committed.
- Distribution dashboard tab in v1 chrome.
- Equal-status **keep-both** as a third peer conflict action (superseded by confirmed “Not the same expense” escape).

## Success signal

A supported BAC **walmart** fixture import persists every must-parse line with required CanonicalLine fields and zero manual edits in CI; on the running app, after uploading a multi-statement PDF into a shared list, a second member can open shared-expenses and see CRC settle-up that matches attributed purchases for the statement cycle — with incomplete disclosure whenever quarantine contributed — without any payment being recorded in-app.

## Assumptions

- Email verification is performed only when invite delivery or secure recovery requires it.
