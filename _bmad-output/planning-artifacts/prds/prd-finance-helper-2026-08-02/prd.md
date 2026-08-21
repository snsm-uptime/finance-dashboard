---
title: "PRD: finance-helper"
status: final
created: 2026-08-02
updated: 2026-08-03
---

# PRD: finance-helper

> Final PRD for v1. `[OPEN]` items below are deferred to architecture, UX, or later phases with an owner — they are not silent gaps. `[ASSUMPTION]` tags are confirmed product defaults unless noted.

## Overview

`finance-helper` is a self-hosted web application that turns bank statement PDFs into a queryable, shared financial record. A user uploads a statement through the browser, the system detects which bank and product it came from, parses it into canonical transaction records, and stores it in a database that multiple people can view according to the expense lists they belong to.

The problem it solves is that bank statements are the only data source available. Costa Rican banks are not covered by transaction-aggregation services — neither Plaid nor the regional aggregator Belvo reaches BAC or Promerica — so there is no API to pull from. Statements arrive as bank-formatted PDFs, and BAC's mix colones and dollars within a single document across sectioned regions (purchases, payments, interest, fees, voluntary services, installment financing). Answering "what do we owe each other this month" currently means reading PDFs by hand.

At its full extent, the product is a personal finance hub: statements are dropped into the browser, categorized by a local machine-learning model, and surfaced through dashboards for shared expenses, personal spending, and spending trends filterable across any combination of lists. **v1 is a thin vertical slice of that shape** — upload, parse, store, and one shared-expenses view — chosen so the whole architecture is proven end to end rather than assembled from pieces that have never met.

## Users and roles

**Users are peers.** Every user has an account, gets a personal list on signup, uploads their own statements, creates as many lists as they want, and shares any of them with other users. There is no privileged product role. What a user can see is determined entirely by which lists they belong to.

**Authentication is email and password.** Google sign-in was considered and dropped. This trades a delegated identity provider for credentials the application owns, which means password hashing, reset, and probably email verification become the product's responsibility. It also makes transactional email a v1 dependency, since invitations are delivered by mail.

The tradeoff cuts both ways for the eventual open-source release: it removes the requirement that every self-hoster create their own Google Cloud project and navigate an unverified-app consent screen, and replaces it with configuring an SMTP server — a smaller burden, but not zero.

### Account surface (v1)

v1 account tooling stays **minimal**: sign up, sign in, password reset, **UI language (EN/ES)**, and **appearance theme (Light / Dark / System)** in the Account menu. Language is remembered on the account and defaults from the browser on first visit. Theme is remembered on the account and defaults to **System** (follow OS/browser) on first visit. Email verification is included only if it is required for invitation delivery or secure account recovery — not as a profile product. There is no settings area for display name, notification preferences, FX overrides, or session management beyond what authentication itself needs.

Invitation emails and password-reset emails are the only transactional mail in v1.

**Operator (Sebas).** Not a product role but a deployment one — runs the containers, configures which bank adapters are installed, holds the database volume. Distinguished here so that adapter and infrastructure concerns are not mistaken for user-facing features.

This is a departure from the product brief, which treated Monse as a beneficiary who never touches the tool. v1 is genuinely multi-user and symmetric.

## Relationship to the product brief

The [product brief](../../briefs/brief-finance-helper-2026-08-01/brief.md) described a CLI. This PRD supersedes it on product surface while preserving its substance on parsing. Recorded explicitly so the divergence is not mistaken for drift:

**Superseded.** The CLI surface (`import`, `shared-total`, `detect`); the packaging criterion of installing via pip/pipx/uv tool and running as a real CLI end to end; the local single-file database and its filesystem-copy backup model; the exclusion of multi-user access; the per-product boolean shared flag.

**Retained.** The adapter contract and its detect → parse → normalize pipeline; the import contract and required canonical fields; fail-loud behavior when a must-parse section cannot be parsed; canonical identity dedup and idempotent re-import; the canonical line-type taxonomy; BAC credit-card fixture acceptance as the parsing bar; a Promerica stub proving the contract extends without core redesign.

The brief's addendum remains valid as evidence and mapping reference — the BAC credit section map, locale and dual-currency adapter requirements, and identity/dedup detail all carry forward unchanged.

## Lists

The **list** is the organizing concept of the product. A list is a named container of spending, owned by a user, that transactions land in. Users create as many as they find useful — one per card, one per category of spending, one per household arrangement. Every user receives a personal list on signup as the default destination for their own expenses.

A list becomes shared when its owner adds other users to it. Shared lists exist to make settling up easy, and support three things: **splitting** what was spent, **settling** what is consequently owed, and **visualizing** the result. Personal lists are the same entity with a single member — not a separate concept — which is why the eventual trends dashboard can filter across personal and shared lists interchangeably.

This replaces the brief's per-product boolean, which could express exactly one relationship with exactly one person and would have required a schema migration the moment a second arrangement appeared.

It is also a deliberate design position worth stating. Among comparable tools, only Monarch Money assigns sharing above the transaction level; Splitwise, Actual Budget, and Firefly III all model sharing per-transaction or per-category, and their communities are actively asking for something better. Assigning at the source works here because household splitting in practice follows the card rather than the purchase — the question is whose card it was on, not whether one particular coffee was shared.

### Membership and splits

A list's owner invites others **by email address**. If the address already belongs to a registered user, they receive an invitation to join the list. If it does not, they receive a different message that guides them through creating an account, and on completing signup they land directly on the list they were invited to.

**List default split.** New lists start **even** among members — two people at 50/50, three at equal thirds. That default is **configurable**: a standing percentage split (for example 60/40) can be set on the list when even is not the arrangement. Every item inherits the list default until someone changes that item.

Real household splitting is not only percentages. When members bought very different things, they look at the receipt and assign cost by **what each person bought**. Percentage splits still matter and must be **easy to configure** both as a list default and as an item override.

**Item overrides.** Not every item needs special treatment. The override sits on the item: available **while creating it** and again **when interacting with an existing item**. Until the user opens that option, the item stays on the list default. An override may:

- Assign the **whole line to one member**, or
- Split **one line's amount across members by sub-amounts** (for example ₡3 000 / ₡2 000 on the same purchase line), or
- Apply a **percentage split** for that item alone.

Splits are therefore **per member, at list default and per item**. A list can hold more than two people. Overrides produce the per-transaction share allocations that balances (and later settlement) draw from.

**Percentage validation.** Any percentage configuration — list default or item override — must sum to **exactly 100%** across members. The product does not accept an under- or over-allocated percentage split.

`[OPEN — architecture]` Even when percentages sum to 100%, applying them to a concrete CRC or USD amount can leave a one-subunit remainder (for example three equal shares of ₡100). Assignment must be deterministic; architecture proposes the rule (not a user preference).

### Cardinality

A card's transactions feed exactly one list in v1. The design must not foreclose feeding several later, which means the association is modelled as a relation between cards and lists with a v1 uniqueness constraint, rather than as a list reference stored on the card.

Uploads target a list via fixed card-to-list association or review routing (FR-11), not a global account-to-list map derived from the brief’s per-product shared flag.

## Balances and settlement

Shared lists exist to simplify paying each other back. That splits into two capabilities, and only the first is in v1.

**v1 shows balances — who owes what, in colones, to whom.** Settling up (actually transferring money) still happens outside the application. **v2** records those payments as a running ledger: balances accumulate across months, payments reduce them, and history is visible. It is explicitly not a per-month closeout.

### Receipt-shaped practice

Everyday use matches a receipt, not a spreadsheet of percentages:

- **Usually** an entire receipt belongs to the shared expense and is divided by the list default (or an item override).
- **Sometimes** — one item only, or a receipt mixed with other people's purchases — each person totals **only the items they bought** and returns that sum to **whoever paid**.

The product must support both. That is why list defaults, item attribution (whole-line or sub-amounts), and percentage overrides all exist — and why **who paid** is a first-class field, not inferred forever from the card.

### Who paid

Every shared expense has an **explicit payer** — the person others should reimburse. The payer is not always the cardholder on a statement (cash, someone else's card, a friend on the list). Members set or correct the payer on the expense.

**Payer default.** On statement import and on manual item entry, payer defaults to the **current user** and remains editable.

### Currency and exchange rate

**Colones (CRC) are the settlement currency.** Shared balances and "what to return" figures are expressed in CRC.

Expenses not in colones (USD on a dólares card or foreign currency on a statement) are **converted to CRC using an exchange rate for the purchase or statement date**, looked up automatically. Original amounts remain stored; the converted CRC amount is what feeds share allocation and the shared-expenses view.

This **supersedes** the earlier decision to keep CRC and USD as separate non-converted figures with no FX in v1.

`[OPEN — architecture]` Authoritative FX rate source (e.g. BCCR), missing-date behavior, and whether override is allowed. Requirement remains: purchase/statement-date conversion into CRC.

### Incomplete data

**A balance must disclose when it is incomplete.** If a statement was accepted with quarantined rows, any list balance computed over it is understated. Balances derived from statements with unresolved rows must say so.

### Shape for v2

v1 must compute balances from **per-transaction share allocations** (and per-expense payer) that a future payments table can draw down — not from a month-scoped aggregate.

`[OPEN — v2 settlement]` How a settlement payment that also appears in a statement avoids being counted twice. v1 taxonomy should allow distinguishing an inter-member transfer when it arrives.

### What counts toward settle-up

Shared settle-up and receipt-list **splittable** items follow the brief’s line-type rules, restated for lists:

- **Include:** `purchase` lines, and purchase reversals/refunds once a `credit_note` (or equivalent) is explicitly classified as a purchase reversal.
- **Exclude:** `payment`, `interest`, `fee`, `voluntary_service`, `credit_note` (until classified as a purchase reversal), `installment_schedule`, `balance_forward`, and `other` unless explicitly classified into an included type.

Non-included line types may still be imported and stored for a complete ledger; they do not feed member share allocations or settle-up totals.

**Timezone.** Posted dates and statement-cycle boundaries are interpreted in `America/Costa_Rica` after adapter normalization to ISO-8601 calendar dates.

### Shared-expenses view

Each shared list has a view whose job is to answer: **given what was imported and how it was attributed, what should each member return to each payer, in CRC?**

**Period.** The view is aligned to **statement / billing cycles**, not a plain calendar month — so the numbers match the documents people just imported.

**Layout.**

1. **Top — settle up.** How much each person needs to pay (in CRC) so the period is even. Includes an option to **simplify** the settlement: recompute who should pay whom so the group makes fewer transfers, without recording that anyone has paid yet. Actual payment recording remains v2; simplify is a suggested transfer plan only.
2. **Below — receipt list.** Items for the period, **most recent first**, in a receipt-like format so members can verify "my items vs yours" the way they already do on paper. Foreign-currency lines show enough original amount + converted CRC to audit the FX step. Incomplete/quarantined data for the period is disclosed on this screen.

**Simplify** minimizes the number of person-to-person transfers while preserving net balances; it does not invent debt or change item splits.

When a list holds cards with different billing cycles, the user **selects which statement/cycle** the shared-expenses view shows.

## Statement ingestion

### A file is not a statement

A single uploaded PDF may contain several statements bound for different lists — BAC credit statements carry multiple cards, keyed by cardholder. Ingestion therefore decomposes an upload into N statements, each with its own product identity and its own destination.

This extends the brief's adapter contract, which mapped one file to one product. A splitting step sits between detection and parsing: detect the bank, split the file into statements, then parse each. The Promerica stub and the adapter contract tests must exercise the multi-statement case, not just the single-statement one.

### Review modes

Before review begins, the user chooses one of two modes with a checkbox.

**Bulk.** The whole upload goes to a single list chosen from a dropdown.

**Individual.** Statements are reviewed one at a time, each assigned by a directional gesture:


| Gesture | Result                               |
| ------- | ------------------------------------ |
| Right   | Accept into a chosen list (list picker first) |
| Left    | Accept into the user's configurable default list |
| Down    | Skip — the statement is never stored |


Left is the low-effort default destination path; down exists so that a statement the user does not want tracked at all has somewhere to go. Phone implements true swipes; desktop uses labeled buttons for the same three outcomes. Accessible non-gesture equivalents are required.

### Failure handling

When a statement cannot be parsed correctly, the system alerts the user and does not process it. Data that did not parse cleanly never reaches the database on its own.

Failure is scoped to the statement, not the file. One unparseable card section does not cost the user the other three statements in the same upload.

Instead of only reporting the failure, the system shows the evidence: **the original PDF rendered beside the items that were extracted from it**, so the user can compare the source against the result and see exactly what was missed. On a phone the PDF occupies the lower half of the screen.

From the comparison view the user chooses between two outcomes:

**Accept with quarantine.** Rows that parsed import normally. Rows that did not are stored as unresolved rather than discarded, and the statement is marked incomplete.

**Dismiss.** The file, or the statement, is discarded entirely.

Nothing partial enters the database without a human looking at the evidence and deciding — the strictness is in the automatic path, and the override is deliberate and informed.

This reconciles with the brief rather than replacing it. The brief already quarantined unparsed rows from best-effort sections; the change is that quarantine now applies to any failed section, and a person decides in front of the evidence instead of a static per-section policy deciding in advance.

The comparison view appears only on failure. Statements that parse cleanly go straight to review.

Unresolved rows can be **resolved by hand**: the user reads the correct values off the rendered PDF and types them in, without waiting for a parser fix. This makes the comparison view an editing surface rather than a diff, and it has to work on a phone.

Because rows can now originate from a person rather than the parser, every row carries its **provenance**. Trust, debugging, and any later audit all depend on being able to tell which is which.

Quarantine may also resolve by re-upload: once the parser is fixed, re-uploading lets dedup absorb rows already stored while previously unresolved rows parse and land — only if canonical identity is stable across the fix.

**Hand-fixed rows vs later parse.** When a user has typed a row by hand and a later re-upload produces a parsed row that is the same line or a near match, the system **does not resolve it silently**. It uses the same conflict UI as same-price matches (FR-22): default **pick Manual or Parsed** (one survivor); escape **“Not the same expense”** keeps both only after a confirm that warns of double-count / overpay risk. Ordinary duplicates among fully parsed rows remain automatic ("imported N, skipped M"); only manual-vs-parsed (and same-price) collisions require this prompt.

### Duplicates

Re-uploading a statement, or uploading one whose period overlaps stored data, is absorbed silently by canonical identity dedup — no interruption, no prompt. Afterwards the user is told what happened, in the shape of "imported 12 new, skipped 43 duplicates."

### Correction

Two paths, because they fail differently.

**Reassignment** handles the common case: a statement went to the wrong list, so move it. **Batch removal** is the escape hatch when an import went badly wrong — the brief's journaled-batch model is retained, so every import remains an atomic unit that can be rolled back and re-run.

### Form factor

The product is used from both a desktop browser and a phone. Mobile is not a later concern: the review flow's gestures and the split-screen comparison view are both described in mobile terms.

Streamlit is a preference, not a commitment. It reruns its script on every interaction and offers no native gesture handling, no first-class PDF viewer, and a weak responsive story — and v1's review flow needs all three. Architecture selects whatever actually delivers the flow described here; this document specifies the experience, not the framework.

## Parsing and adapter requirements

This section restates the brief's adapter substance as PRD requirements, plus the multi-statement and human-quarantine extensions already decided above. Mechanism (PDF library, schema tables, rate feed) belongs in architecture.

### Contract

Bank support is pluggable. Each adapter declares `{bank, product_id, account_kind}` where `account_kind` is `credit`, `debit`, or `other`. Section must-parse lists may differ by kind — debit products are not assumed to mirror credit maps.

Pipeline: **detect → split → parse → normalize → import batch**.

**Detect.** Ordered strategies: override → filename → content signatures. First confident match wins. Unknown or ambiguous statements **fail the import** with a clear error — no silent mis-association.

**Split.** One uploaded PDF may contain several statements. Detection identifies the bank; splitting produces N statements, each with its own product identity and destination. The Promerica stub and contract tests must exercise the multi-statement case.

**Parse / normalize.** Adapters own locale date parsing and multi-column amount collapse. The store never sees bank-local date strings or parallel CRC/USD columns on one row. BAC adapters parse Spanish `DD-MMM-YY` into ISO-8601 and collapse dual amount columns into a single `(currency, amount)`.

**Format extensibility.** A new bank or file format is a new adapter (plus fixtures), not a parallel import path. CSV and HTML are format parsers behind the same contract; **v1 implements PDF only**.

### Canonical lines

Must-parse ledger lines carry at least: `posted_date` (ISO-8601), signed `amount`, ISO 4217 `currency`, `product_id`, `line_type`, and `external_ref` when the statement provides one. Every stored row also carries **provenance** (parser vs hand-entered).

**Line-type taxonomy** (minimum): `purchase`, `payment`, `interest`, `fee`, `voluntary_service`, `credit_note`, `installment_schedule`, `balance_forward`, `other`.

Each bank section maps to that taxonomy with policy `must_parse`, `best_effort`, or `ignore`. Unmapped sections default to **best-effort quarantine**, not silent drop.

**Installment schedules** are a distinct record type, excluded from shared totals. Adapters must not double-emit the same spend as both a counted purchase and installment principal without an explicit link. Prefer the purchase/principal ledger posting and attach schedule metadata by reference when the bank shows both.

### BAC credit baseline


| Bank section                                 | Taxonomy             | v1 policy                    |
| -------------------------------------------- | -------------------- | ---------------------------- |
| Detalle de compras                           | purchase             | must_parse                   |
| Detalle de pago                              | payment              | must_parse                   |
| Detalle de intereses                         | interest             | must_parse                   |
| Otros cargos                                 | fee                  | must_parse                   |
| Productos y servicios de elección voluntaria | voluntary_service    | best_effort                  |
| Collection / credit notes                    | credit_note / fee    | best_effort until classified |
| Otras líneas de financiamiento               | installment_schedule | must_parse on credit         |
| Saldo Anterior                               | balance_forward      | ignore or metadata-only      |


Additional sample card layouts (owner labels: eco, dolares, colones) remain **provisional until fixture review** against real statements — then the same acceptance bar applies before calling those layouts supported. Labels are the owner's names for IBAN/card accounts, not a closed product enum.

### Identity and dedup

**Primary identity:** `(product_id, posted_date, currency, amount, external_ref)` after normalization.

**Fallback** when a ref is missing or unstable: `(product_id, posted_date, currency, amount, normalized_description, line_type, statement_period_id)` — must remain idempotent.

Adapters expose ref quality as `stable`, `derived`, or `absent`. For BAC compras, `N. Referencia` is the primary stable external ref when present. Refs are not assumed unique across products without `product_id`.

Dual-column CRC/USD amounts normalize to a single `(currency, amount)` **before** identity. Prefer the nonzero column. If **both** columns are nonzero, **prefer CRC**.

Re-import of the same or overlapping statement never duplicates ledger lines for the same identity. Parsed duplicates are absorbed automatically with a post-import summary. Manual-vs-parsed near-matches prompt the user (see Statement ingestion). Every import is a **journaled batch** that can be rolled back.

### Acceptance and extension

- **BAC credit-card fixture** is the v1 parsing acceptance bar: for a supported BAC credit product, synthetic fixture import persists every must-parse line with required canonical fields and **zero manual edits**.
- **Promerica** in v1 is a stub or contract-test adapter only — real parsing waits on samples. The stub proves extension without modifying core import, dedup, or list logic, and covers multi-statement.
- Committed fixtures are anonymized or synthetic; real statements stay outside the repo. Positional layout fidelity of regenerated PDFs remains an open test-strategy risk (see Constraints).

## Features

Functional requirements are numbered globally (FR-1 …). Narrative sections above remain the behavioral source; this section is the testable contract for UX, architecture, and stories.

### Accounts and authentication

**Description:** Peers create accounts with email and password so they can own lists, accept invitations, and upload statements. v1 has no profile or settings product beyond authentication itself.

#### FR-1: Sign up with email and password

A new user can create an account with email and password.

**Consequences (testable):**

- Duplicate email addresses are rejected.
- Passwords are stored hashed, never in plaintext.
- On success the user is authenticated and receives a personal list (FR-5).

#### FR-2: Sign in and sign out

A registered user can sign in with email and password and can sign out.

**Consequences (testable):**

- Invalid credentials are rejected without revealing whether the email exists beyond a generic failure message appropriate to the security posture architecture chooses.
- After sign-out, protected list and upload actions require authentication again.

#### FR-3: Password reset

A user can reset a forgotten password via email.

**Consequences (testable):**

- Reset requires proving control of the account email.
- A completed reset invalidates the prior password for subsequent sign-in.

#### FR-4: Email verification when required

Email verification is performed when it is required for invitation delivery or secure account recovery; it is not a standalone profile feature.

**Consequences (testable):**

- If verification is required for an invite flow, an unverified address cannot complete that flow until verified.
- If verification is not required for a given deployment path, signup still succeeds under FR-1.

**Out of Scope:**

- Display name, notification preferences, session-management UI, and FX rate overrides (see Scope — Out for v1). Language (EN/ES) and appearance theme (Light / Dark / System) live in Account menu only — not a Settings product.

### Lists, membership, and splits

**Description:** Lists are the organizing container for spending. Every user gets a personal list; they create more as needed and share any list by inviting others. Default split is even (configurable to percentages). Items and whole receipts can override that default — including percentage splits and absolute amounts per member (the dinner-with-friends case). When a card statement is imported, the user chooses whether that card always feeds one list or uses the review flow with an explicit destination list and a configurable default list.

#### FR-5: Personal list on signup

On successful signup, the system creates a personal list owned by the new user.

**Consequences (testable):**

- Every new account has exactly one personal list immediately after signup.
- The personal list is available as a destination during review; it is not hardwired as the only default destination (see FR-12).

#### FR-6: Create and name lists

An authenticated user can create additional named lists they own.

**Consequences (testable):**

- A user may own more than one list.
- List names are user-visible and editable by the owner.

#### FR-7: Invite members by email

A list owner can invite another person to a list by email address.

**Consequences (testable):**

- If the address belongs to a registered user, they receive an invitation to join the list.
- If the address is unregistered, they receive a signup-oriented invitation; after completing signup they land on the inviting list.
- Invitation delivery uses transactional email.

#### FR-8: Peer access via membership

Once a member of a list, a user can see that list's shared-expenses view and participate in splits according to membership — there is no owner-vs-viewer product role among members.

**Consequences (testable):**

- List visibility is determined by membership, not by a global admin role.
- Non-members cannot read the list's expenses or balances.

#### FR-9: Configurable list default split

New lists default to an **even** split among members. The list default can be changed to a standing **percentage** split.

**Consequences (testable):**

- Even split divides equally across current members.
- Percentage defaults must sum to exactly 100% across members or the save is rejected.
- New items inherit the current list default until overridden.

**Owner-only default split.** Only the list owner may edit the list’s standing default split.

#### FR-10: Item and receipt split overrides

When creating or interacting with an item — or when attributing a whole receipt — a user can override the list default by any of:

- Assigning the **whole line** (or whole receipt) to one member
- Setting an **absolute amount per member** that sums to the line/receipt total (e.g. friends each write what they ordered from a shared dinner the payer covered)
- Applying a **percentage split** for that item or receipt

**Consequences (testable):**

- Until an override is set, the item or receipt uses the list default.
- Percentage overrides must sum to exactly 100% or the save is rejected.
- Absolute amounts per member must sum to the line/receipt total or the save is rejected.
- Overrides produce per-transaction share allocations used by balances.

#### FR-11: Card-to-list association chosen at import

When a card's statement is imported, the user chooses how destinations work for that card:

1. **Fixed list** — this card's transactions feed one chosen list, or
2. **Review routing** — each statement (or bulk upload) is assigned during review to a chosen destination list, with a **configurable default list** for the low-effort accept path (not hardwired to the personal list).

**Consequences (testable):**

- Import does not silently assume "always personal list."
- v1 still enforces at most one active **fixed** list per card when mode (1) is chosen; mode (2) assigns per statement/upload during review.
- The design must not foreclose multiple fixed lists per card later.
- Reassignment of a misfiled statement remains available via correction.

#### FR-12: Configurable review default destination

Under review routing, the user sets which list is the default low-effort destination (the former "left" / personal accept path). That default may be the personal list or any other list the user belongs to.

**Consequences (testable):**

- Changing the default destination changes where low-effort accepts land for subsequent reviews.
- Explicit destination choice (chosen list) and skip remain available regardless of the default.

---

### Statement upload and review

**Description:** Authenticated users upload bank-statement PDFs through the web UI, and can also add individual items manually without waiting for month-end. Uploads detect bank/product, split multi-statement files, and assign destinations before commit — fixed card-to-list or bulk/individual review with a configurable default. Payer is always selectable and defaults to the current user. Same-price collisions between imported lines and prior manual entries are reviewed at end of import; confirmed links seed description aliases for later ML.

#### FR-13: Upload statement PDF

An authenticated user can upload a bank statement PDF through the web UI (including on a phone-sized viewport).

**Consequences (testable):**

- Upload requires authentication.
- The system accepts PDF for v1; unsupported formats are rejected with a clear error.
- After a statement is parsed correctly and committed with no unresolved quarantine, the uploaded PDF and its stored path reference are cleared — durable data lives in PostgreSQL.

#### FR-14: Detect bank and product

On upload, the system detects bank and product via the adapter contract (override → filename → content).

**Consequences (testable):**

- Unknown or ambiguous statements fail the import with a clear error — no silent mis-association.
- A confident match produces a product identity used for parsing and identity keys.

#### FR-15: Split multi-statement files

A single upload may decompose into N statements, each with its own product identity and destination.

**Consequences (testable):**

- Failure or skip of one statement does not automatically discard the others in the same upload.
- Multi-statement behavior is covered by adapter contract tests (including the Promerica stub).

#### FR-16: Choose card routing mode

When importing for a card, the user chooses fixed-list mode or review-routing mode (FR-11).

**Consequences (testable):**

- Fixed-list mode commits statements for that card to the chosen list (subject to parse success and any failure handling).
- Review-routing mode proceeds to bulk or individual review before commit.

#### FR-17: Bulk or individual review

Before commit under review routing, the user chooses bulk or individual review.

**Consequences (testable):**

- **Bulk:** the whole upload is assigned to one list chosen from lists the user belongs to.
- **Individual:** parsed transactions are reviewed one at a time, across the whole session — not grouped by statement.
- Individual review presents one transaction on a centered card over a dimmed backdrop.
- Phone Individual review uses true swipes: right → chosen list (after picker), left → configurable default, up → delete. Undo is a button on all platforms, never a gesture.
- Desktop uses labeled buttons for the same four outcomes.

> **Amended 2026-08-20** — Sprint Change Proposal 2026-08-20 (row-level individual review).
> Previously: *"Individual: statements are reviewed one at a time"*, with swipes mapped
> right → chosen list, left → default, **down → skip**. Statement-level routing made individual
> review functionally identical to bulk review. The unit is now the transaction, `down` is
> reassigned from skip to undo, and delete (`up`) replaces skip.

#### FR-18: Individual review outcomes

In individual review, each parsed transaction can be: assigned to a chosen list; assigned to the configurable default destination (FR-12); or deleted (never stored). The user can undo the most recent assign or delete, and can discard the remaining session.

**Consequences (testable):**

- Delete means no ledger row for that transaction.
- Undo is single-level: it reverses the most recent assign or delete and returns that transaction to the queue at its original position. Undo survives a reload.
- A transaction with a zero amount is excluded before review and never appears; the user is told how many were excluded when the session completes.
- Discarding a partially reviewed session abandons only the remaining unreviewed transactions. Already-assigned transactions keep their ledger rows.
- After every pending row is assigned or deleted, **ImportReviewSheet** opens (items grouped by destination list). **One Save** at the bottom finalizes the session. **Discard is per row** on the sheet and returns that row to the review queue (ledger reverse, same as undo-assign). The sheet repeats whenever the pending queue becomes empty until Save. Session complete / FR-20 summary / PDF release happen **on Save**, not on last-card.
- Assignment commits only after parse success (or after an explicit accept-with-quarantine under failure handling).
- Statements that failed to parse are reported when the session completes, so the user knows what to enter by hand.

> **Amended 2026-08-20** — Sprint Change Proposal 2026-08-20 (row-level individual review).
> **Amended 2026-08-21** — Sprint Change Proposal 2026-08-21 (ImportReviewSheet). After the
> pending queue is empty, grouped-by-list validation with per-row discard and one Save
> finalizes the session. Last-card is not session complete.

#### FR-19: Explicit payer (default: current user)

Every shared expense has an explicit payer the user can select. On statement import and on manual item entry, payer **defaults to the current user** and remains editable before or after commit.

**Consequences (testable):**

- A committed shared expense always has a payer set.
- Default payer is the signed-in user, not silently assumed from cardholder alone.
- Changing the payer updates who others should reimburse in the settle-up view.

#### FR-20: Post-import dedup summary

After a successful import (or re-import), the user is told how many new rows were imported and how many duplicates were skipped.

**Consequences (testable):**

- Re-uploading overlapping parsed data does not duplicate ledger lines for the same canonical identity.
- Ordinary parsed-vs-parsed duplicates never interrupt the user mid-import.

#### FR-21: Manual item entry

A user can add individual expense items to a list during the day without waiting for a statement import (e.g. logging a shared dinner the same evening).

**Consequences (testable):**

- Create requires **amount**, **description**, and **payer** (defaults to the current user).
- **Origin (optional):** on create (and later edit), the user may set origin to an **existing card** (dropdown of the user’s registered cards), **Cash**, or leave **blank** (no origin). Blank is allowed when the expense is neither card nor cash.
- The product provides a **filter for items with no origin** so the user can later assign origin in bulk or individually to blank-origin transactions.
- **Adjust split** disclosure on create offers whole-line, absolute amounts per member, or percentage; until opened, the item uses the list default.
- Manual items support the same split overrides as imported items when editing later (FR-10).
- Payer selection follows FR-19 (default current user, editable).
- Manual items carry provenance distinguishing them from parser-derived rows.
- Manual items appear in the shared-expenses receipt list and settle-up figures for that list.

#### FR-22: Same-price manual match review at import end

When a statement import produces a parsed line whose amount matches an existing manual entry (same price), the system does **not** auto-merge. It marks the pair for review and, after the rest of the upload finishes, presents a **comparison view** so the user can validate whether the manual entry takes priority (or otherwise how to resolve).

**Consequences (testable):**

- Same-price collisions are collected and shown at end of import — they do not silently create duplicates or silently drop the parsed line.
- Default resolution: pick **Manual** or **Parsed** (one survivor).
- Escape: **“Not the same expense”** keeps both only after a confirm that warns the choice can make someone owe more (double-count risk); the escape is harder than the survivor pick (not an equal peer third action).
- Ordinary exact canonical-identity duplicates among parsed rows still use automatic dedup (FR-20).

**Same price** means equal amount and currency against an unresolved manual entry on a list related to the import; date window is list-configurable with product default ±3 calendar days (architecture AD-10).

#### FR-23: Remember manual label as bank-description alias (seed for later ML)

When the user confirms that a manual entry and a bank line represent the same expense — including when descriptions differ — the system stores the **manual label as an alias** for that bank description.

**Consequences (testable):**

- Confirmed matches persist an alias mapping (manual label ↔ bank description) for future use.
- v1 does **not** use aliases for automatic ML categorization; that interpretation is post-v1. Schema/storage of the alias is in v1 so later models can learn from it.


### Parse failure, quarantine, and correction

**Description:** When parsing fails, the system alerts and does not silently commit bad data. Failure is statement-scoped. Users see the PDF beside extracted items, may accept with quarantine or dismiss, can hand-fix unresolved rows, and resolve manual-vs-parsed conflicts on re-upload. Misfiled imports can be reassigned; bad batches can be rolled back.

#### FR-24: Statement-scoped parse failure

If a statement cannot be parsed correctly on the automatic path, the system alerts the user and does not process that statement into the ledger on its own.

**Consequences (testable):**

- Failure of one statement in a multi-statement upload does not reject the other statements by default.
- Required data is never silently dropped.

#### FR-25: Side-by-side comparison on failure

On parse failure, the system shows the original PDF beside the items that were extracted (on phone, PDF in the lower half).

**Consequences (testable):**

- The comparison view appears only on failure for that statement — clean parses skip it.
- The view is usable on a mobile viewport.

#### FR-26: Accept with quarantine or dismiss

From the comparison view the user may **accept with quarantine** (parsed rows import; unparsed stored as unresolved; statement marked incomplete) or **dismiss** the statement or entire file.

**Consequences (testable):**

- Nothing partial enters the ledger without an explicit human decision in front of the evidence.
- Accept-with-quarantine marks the statement incomplete for balance disclosure.

#### FR-27: Manual resolution of quarantined rows

Unresolved rows can be edited by hand against the rendered PDF (values typed by the user) without waiting for a parser fix.

**Consequences (testable):**

- Hand-entered values are stored with provenance distinguishing them from parser-derived rows.
- Editing works on a phone-sized viewport.

#### FR-28: Manual-vs-parsed conflict on re-upload

When a re-upload produces a parsed row that matches or near-matches a hand-fixed row, the system prompts using the **same resolution UI as FR-22**: pick Manual or Parsed by default; **“Not the same expense”** keeps both only after double-count/overpay confirm — never silently duplicates.

**Consequences (testable):**

- Ordinary parsed-vs-parsed duplicates remain automatic (FR-20).
- Manual-vs-parsed collisions always require a user choice under the FR-22 resolution rules (no equal-status keep-both triad).

#### FR-29: Reassign statement to another list

A user can move a statement that was filed to the wrong list to another list they belong to.

**Consequences (testable):**

- After reassignment, balances on both lists reflect the move.
- Share allocations follow the destination list's rules unless item overrides exist.

#### FR-30: Roll back an import batch

A user can remove a whole import batch as an escape hatch (journaled-batch model).

**Consequences (testable):**

- Batch removal undoes that import's ledger effect.
- The user can re-run import afterward without leftover duplicates from the rolled-back batch.

---

### Adapters, identity, and acceptance

**Description:** Bank support is pluggable through detect → split → parse → normalize → import batch. Canonical fields, line types, identity/dedup, BAC credit-card acceptance, and a Promerica stub define the parsing contract. Dual-column amounts prefer the nonzero column; if both nonzero, prefer CRC. Parsed IBANs match existing user cards and use the card’s label as the import identifier; unknown IBANs prompt registration with a user-chosen label.

#### FR-31: Pluggable adapter contract

New banks/products are added as adapters declaring `{bank, product_id, account_kind}` without rewriting core import, dedup, or list logic.

**Consequences (testable):**

- Detection uses override → filename → content; ambiguous/unknown fails loudly.
- Section policies may differ by `account_kind` (credit/debit/other).

#### FR-32: Canonical line fields and taxonomy

Must-parse ledger lines carry posted_date (ISO-8601), signed amount, ISO 4217 currency, product_id, line_type, and external_ref when provided, plus provenance.

**Consequences (testable):**

- Line types include at least: purchase, payment, interest, fee, voluntary_service, credit_note, installment_schedule, balance_forward, other.
- Section policies are must_parse, best_effort, or ignore; unmapped sections quarantine, not silent drop.
- Installment schedules are distinct records excluded from shared totals and must not double-count with purchases.

#### FR-33: Dual-column amount normalization

Adapters collapse dual CRC/USD columns to a single (currency, amount) before identity.

**Consequences (testable):**

- Prefer the nonzero column when only one is set.
- If both columns are nonzero, prefer CRC.

#### FR-34: Canonical identity and idempotent re-import

Primary identity is (product_id, posted_date, currency, amount, external_ref). Fallback identity when refs are missing/unstable remains idempotent.

**Consequences (testable):**

- Re-import never duplicates rows for the same canonical identity.
- Ref quality is exposed as stable, derived, or absent.
- Every import is a journaled batch (supports FR-30).

#### FR-35: BAC credit-card acceptance bar

For a supported BAC credit product, the synthetic BAC credit-card fixture import persists every must-parse line with required canonical fields and zero manual edits.

**Consequences (testable):**

- The BAC credit-card fixture is the v1 parsing exit bar.
- Additional BAC layouts remain provisional until fixture review, then the same bar applies.

#### FR-36: Promerica stub

v1 includes a Promerica stub or contract-test adapter proving extension without modifying core import, dedup, or list logic, including the multi-statement case. Real Promerica parsing is out of scope until samples exist.

**Consequences (testable):**

- Stub compiles/runs against the contract in CI or contract tests.
- Multi-statement paths are exercised by stub tests.

#### FR-37: Register and match cards by IBAN

Cards are registered to a user with a **user-chosen label** and a stable bank identity — primarily the **IBAN** (or equivalent account/card identifier extracted from the statement).

When a statement is parsed:

1. If the extracted IBAN **matches an existing card** assigned to the user, the system uses that card — and its **label as the human identifier for the import** — without asking to create a new card.
2. If the IBAN is **not** yet registered, the system **asks the user to add that card**, prefilled from the statement, and the user sets the label.

**Consequences (testable):**

- Matching is by IBAN (or extracted account identity), not by product nickname strings in code.
- On IBAN match, import UI and records identify the card by the user’s existing label (e.g. a user-facing name like “walmart”), not by re-prompting registration.
- First sighting of a new IBAN prompts registration before (or as part of) destination routing — not a silent anonymous import with no card record.
- Card registry is user-scoped generic vocabulary (no hardcoded personal card names in code); labels are user-assigned.
- Fixed-list vs review-routing (FR-11) attaches to the registered card.

`[NOTE]` Names like walmart, eco, dolares, and colones in fixtures are **example personal labels for specific IBAN/card accounts** used as sample data — not bank product types and not hardcoded user-facing vocabulary.

---

### Shared expenses, FX, and settle-up

**Description:** Shared lists show who should pay whom in CRC for a statement-cycle period. Non-CRC amounts convert using a purchase/statement-date rate. The top of the view is settle-up (with optional transfer simplification); below is a receipt-style item list newest-first. Incomplete/quarantined data is disclosed. Recording actual payments is v2.

#### FR-38: Shared-expenses view per list

A list member can open a shared-expenses view for that list.

**Consequences (testable):**

- Non-members cannot open it (FR-8).
- The view is usable on mobile and desktop viewports.

#### FR-39: Statement-cycle period

The view’s default period aligns to statement/billing cycles rather than only a calendar month.

**Consequences (testable):**

- The user can see balances for a statement cycle relevant to imported statements.
- When cards on the list have different cycles, the user selects which statement/cycle to view.

#### FR-40: Convert non-CRC to CRC for balances

Shared balances and settle-up figures are expressed in CRC. Non-CRC amounts convert using an exchange rate for the purchase or statement date (looked up automatically). Original amounts are retained for audit.

**Consequences (testable):**

- Settle-up figures are in CRC.
- Converted lines show enough original foreign amount + CRC equivalent to audit the FX step.
- `[OPEN — architecture]` Authoritative rate source and missing-date behavior.

#### FR-41: Settle-up summary and simplify

The top of the view shows how much each person needs to pay (in CRC) to settle the period, with an option to **simplify** into fewer suggested transfers. Simplify does not record that anyone paid.

**Consequences (testable):**

- Suggested transfers preserve net balances.
- No payment ledger writes occur when simplify is used (settlement recording is v2).

#### FR-42: Receipt-style item list

Below settle-up, the view lists items for the period newest-first in a receipt-like format.

**Consequences (testable):**

- Members can inspect line-level detail to verify splits.
- Incomplete/quarantined contribution to the period is disclosed on this screen.

#### FR-43: Incomplete balance disclosure

If quarantined or unresolved rows affect the period, balances disclose that they are incomplete.

**Consequences (testable):**

- The UI does not present a confident settle-up total that silently omits unresolved purchases.

#### FR-44: Balance shape ready for settlement

v1 balances are computed from per-transaction share allocations and payer such that a future payments/settlement ledger can draw them down without a model rewrite.

**Consequences (testable):**

- Balances are not solely a disposable month aggregate with no per-transaction allocations.
- Recording payments remains out of scope for v1.

#### FR-45: Line types that feed settle-up

Only included line types (purchases and classified purchase reversals) contribute to shared settle-up allocations. Excluded types are stored when imported but do not affect who owes whom.

**Consequences (testable):**

- A pure `payment`, `interest`, `fee`, `voluntary_service`, `installment_schedule`, or `balance_forward` line does not change member settle-up balances.
- `credit_note` does not affect settle-up until explicitly classified as a purchase reversal.
- Posted-date and period boundaries use `America/Costa_Rica`.

---

## Non-functional requirements

Cross-cutting qualities for v1. Feature-specific constraints stay with their FRs where already stated (e.g. mobile comparison view).

### Security and privacy

#### NFR-1: Credential protection
Passwords are hashed with a modern adaptive algorithm; plaintext passwords are never stored or logged.

#### NFR-2: No personal data in the repository
Real statements, personal names, account identifiers, and transaction data are never committed. Runtime data lives in configured external storage (DB volume outside the repo). Fixtures are anonymized or synthetic.

#### NFR-3: Access control by list membership
API and UI enforce that expense and balance data is only readable/writable by authenticated members of the relevant list (and owners where owner-only actions apply).

### Reliability and data integrity

#### NFR-4: Idempotent import
Re-importing the same or overlapping statement must not corrupt balances via duplicate ledger lines (see FR-20, FR-34).

#### NFR-5: Journaled imports
Every import is an atomic journaled batch that can be rolled back (FR-30).

#### NFR-6: Incomplete-data honesty
Any settle-up or balance figure derived from incomplete/quarantined data must be disclosed as such (FR-43).

### Usability and form factor

#### NFR-7: Mobile and desktop
Core flows — upload/review, failure comparison with PDF, manual item entry, shared-expenses settle-up — are usable on phone and desktop browsers.

#### NFR-8: Fail loud with human override
Automatic paths fail loudly on unknown/ambiguous detection and unparseable must-parse content; humans may override only through explicit comparison/quarantine flows.

### Operations

#### NFR-9: Self-hosted container deploy
Application and PostgreSQL run in containers; the database volume is outside the repository on the operator’s machine/server.

#### NFR-10: Transactional email dependency
Invite and password-reset email require operator-configured SMTP (or equivalent). Auth-only account surface otherwise.

#### NFR-11: Extensibility without core forks
New bank/product support is an adapter (+ fixtures/stub) without modifying core import, dedup, or list logic (FR-31, FR-36).

### Performance (lightweight)

#### NFR-12: Interactive import review
Upload → detect/split → review for a typical single multi-card BAC PDF completes within an interactive session on the operator’s self-hosted hardware — exact SLOs are architecture’s to set; the product requirement is that review is not an overnight batch job.

#### NFR-13: Schema migrations
PostgreSQL schema evolution is supported via migrations as the data model changes; upgrades must not require discarding the operator’s data volume.

---
## Scope

### In for v1

- Statement upload through the web UI, decomposing multi-statement files, with bulk or individual review before anything is committed
- Bank and product auto-detection via the adapter contract, failing loudly on unknown or ambiguous statements
- BAC PDF parsing for credit-card layouts represented in sample data. The synthetic **BAC credit-card** fixture is the acceptance bar; other layouts (including debit) are provisional until reviewed against real statements. Owner-chosen card labels in samples are personal labels for IBAN/card accounts — not product taxonomy and not hardcoded UI vocabulary.
- Canonical line-type taxonomy, required canonical fields, and fail-loud handling of unparseable must-parse sections
- Idempotent re-import: re-uploading a statement, or one with an overlapping period, never duplicates ledger lines, with a post-import summary of what was added and what was skipped
- A side-by-side view of the source PDF against extracted items when parsing fails, usable on a phone
- Correction of misfiled imports by reassigning a statement, and rollback of a whole import batch
- A usable mobile layout, not desktop-only
- Installment schedules stored as a distinct record type, excluded from shared totals
- PostgreSQL persistence in its own container, with a data volume outside the repository
- Email-and-password authentication (sign up, sign in, password reset; email verification only if required for invites or recovery) — no profile or settings surface beyond auth
- Personal lists created on signup, user-created lists, per-member splits (list default + item overrides), and email invitations to lists (registered and unregistered addresses, with post-signup redirect to the inviting list)
- Manual resolution of quarantined rows against the rendered PDF, with provenance recorded per row; on re-upload, conflicts between a hand-fixed row and a new parse use the same Manual|Parsed (+ confirmed “Not the same expense”) UI as same-price conflicts
- Explicit payer on shared expenses, editable; defaults to the current user on import and manual entry; manual create also requires description and offers Adjust split disclosure
- Manual item entry to a list without waiting for statement import
- Same-price manual/import comparison review at end of upload; confirmed matches store manual label as alias of bank description (ML use is post-v1)
- Purchase/statement-date FX: non-CRC amounts converted into CRC for shared balances; original currency retained
- One shared-expenses view per list: statement-cycle period; top settle-up summary in CRC with optional transfer simplification; below that a receipt-style item list newest-first; FX originals auditable; incomplete-data disclosure
- A Promerica stub or contract-test adapter proving extension without modifying core import, dedup, or list logic
- Register cards keyed by IBAN (user-chosen label); matching IBAN reuses that card and its label as the import identifier
- Anonymized or synthetic fixtures committed to the repository, since real statements live outside it
- Account-menu UI language EN/ES (remembered; browser default on first visit) and appearance theme Light / Dark / System (remembered; defaults to System) — not a Settings product
- Phone Individual review swipe mapping, per parsed transaction: right → chosen list, left → default list, up → delete; undo is a button on every platform (desktop buttons mirror all four) *(amended 2026-08-20)*

### Out for v1

- Settlement. v1 shows balances; recording payments, drawing down debt, and settlement history are v2. v1's balance computation must be shaped so the running ledger can be built on it
- Account profile and settings beyond authentication (display name, notification preferences, session management UI, FX rate overrides)
- Machine-learning categorization. Deferred, but the schema reserves `category`, `category_confidence`, and `category_source`, and categorization must never block import. Model direction is recorded in the brief addendum
- Trends and analytics dashboards, and personal-spending dashboards beyond the single shared-expenses view
- Promerica statement parsing itself, pending sample collection
- CSV and HTML statement formats. The adapter contract must accommodate them as format parsers; v1 implements PDF only
- Open-source release. The product is built generic from day one with no personal data committed, but contributor documentation, CI, licensing, and a support policy are post-v1
- A command-line interface

## Constraints and commitments

**Nothing personal is committed.** Real bank statements live outside the repository at a configured path. No personal names, account identifiers, or transaction data appear in code, schema, or fixtures. The product is built with generic vocabulary throughout so that open-sourcing later requires no retrofit.

**Fixtures must survive anonymization.** Statement parsing at this layout complexity is positional — column identity depends on coordinates. A fixture generated by extracting text, anonymizing it, and regenerating a PDF will not reproduce the bank's original glyph positions, so it may not exercise the parsing path the real statement does.

`[OPEN — architecture]` How repository fixtures are produced such that they meaningfully test positional parsing (highest technical risk). Release still gates on repo fixtures (see two-tier reality).

**Two-tier test reality.** Only tests running on the owner's machine can touch real statements. Anything committed can only verify against sanitized approximations.

**Release gate.** Anonymized or synthetic fixtures in the repository gate a v1 release. Real-statement tests on the operator’s machine are valuable and may run in parallel, but they are not the release gate.

## Open questions

Deferred with owner. Not silent gaps.

| Question | Owner | Revisit when |
|---|---|---|
| Double-counting settlement payments that also appear on statements | Product (v2) | Settlement design |
| BAC debit and eco section maps (owner-labeled sample cards) | Implementation | Fixture review against real statements |

~~Closed into architecture/spec (2026-08-03):~~ remainder → list creator; BCCR FX + nearest-prior + no override; phone swipe mandatory with R/L/D mapping; same-price ±3 day default window; synthetic CI fixtures; conflict UI = Manual|Parsed + confirmed “Not the same expense” (no peer keep-both); manual create = amount+description+payer+Adjust split; locale in Account menu; appearance theme Light/Dark/System in Account menu (default System).

