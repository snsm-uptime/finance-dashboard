---
title: "PRD: finance-helper"
status: draft
created: 2026-08-02
updated: 2026-08-03
---

# PRD: finance-helper

> **Draft in progress.** Vision and Scope are settled. Features, Requirements, and NFRs are still to be written. `[OPEN]` marks a decision not yet made; `[ASSUMPTION]` marks something inferred and awaiting confirmation.

## Overview

`finance-helper` is a self-hosted web application that turns bank statement PDFs into a queryable, shared financial record. A user uploads a statement through the browser, the system detects which bank and product it came from, parses it into canonical transaction records, and stores it in a database that multiple people can view according to the expense lists they belong to.

The problem it solves is that bank statements are the only data source available. Costa Rican banks are not covered by transaction-aggregation services — neither Plaid nor the regional aggregator Belvo reaches BAC or Promerica — so there is no API to pull from. Statements arrive as bank-formatted PDFs, and BAC's mix colones and dollars within a single document across sectioned regions (purchases, payments, interest, fees, voluntary services, installment financing). Answering "what do we owe each other this month" currently means reading PDFs by hand.

At its full extent, the product is a personal finance hub: statements are dropped into the browser, categorized by a local machine-learning model, and surfaced through dashboards for shared expenses, personal spending, and spending trends filterable across any combination of lists. **v1 is a thin vertical slice of that shape** — upload, parse, store, and one shared-expenses view — chosen so the whole architecture is proven end to end rather than assembled from pieces that have never met.

## Users and roles

**Users are peers.** Every user has an account, gets a personal list on signup, uploads their own statements, creates as many lists as they want, and shares any of them with other users. There is no privileged product role. What a user can see is determined entirely by which lists they belong to.

**Authentication is email and password.** Google sign-in was considered and dropped. This trades a delegated identity provider for credentials the application owns, which means password hashing, reset, and probably email verification become the product's responsibility. It also makes transactional email a v1 dependency, since invitations are delivered by mail.

The tradeoff cuts both ways for the eventual open-source release: it removes the requirement that every self-hoster create their own Google Cloud project and navigate an unverified-app consent screen, and replaces it with configuring an SMTP server — a smaller burden, but not zero.

**Operator (Sebas).** Not a product role but a deployment one — runs the containers, configures which bank adapters are installed, holds the database volume. Distinguished here so that adapter and infrastructure concerns are not mistaken for user-facing features.

This is a departure from the product brief, which treated Monse as a beneficiary who never touches the tool. v1 is genuinely multi-user and symmetric.

## Relationship to the product brief

The [product brief](../../briefs/brief-finance-helper-2026-08-01/brief.md) described a CLI. This PRD supersedes it on product surface while preserving its substance on parsing. Recorded explicitly so the divergence is not mistaken for drift:

**Superseded.** The CLI surface (`import`, `shared-total`, `detect`); the packaging criterion of installing via pip/pipx/uv tool and running as a real CLI end to end; the local single-file database and its filesystem-copy backup model; the exclusion of multi-user access; the per-product boolean shared flag.

**Retained.** The adapter contract and its detect → parse → normalize pipeline; the import contract and required canonical fields; fail-loud behavior when a must-parse section cannot be parsed; canonical identity dedup and idempotent re-import; the canonical line-type taxonomy; walmart fixture acceptance as the parsing bar; a Promerica stub proving the contract extends without core redesign.

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

`[OPEN]` Even when percentages sum to 100%, applying them to a concrete CRC or USD amount can leave a one-subunit remainder (for example three equal shares of ₡100). How that subunit is assigned must be deterministic so every member sees the same balance. Architecture can propose a rule; it is not a product preference surfaced in the UI.

### Cardinality

A card's transactions feed exactly one list in v1. The design must not foreclose feeding several later, which means the association is modelled as a relation between cards and lists with a v1 uniqueness constraint, rather than as a list reference stored on the card.

`[ASSUMPTION]` Uploads target a list: the user chooses which list a statement's transactions land in, rather than sharing being derived from a fixed global account-to-list mapping.

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

`[ASSUMPTION]` On statement import, payer defaults to the member associated with the card or upload, and remains editable.

### Currency and exchange rate

**Colones (CRC) are the settlement currency.** Shared balances and "what to return" figures are expressed in CRC.

Expenses not in colones (USD on a dólares card or foreign currency on a statement) are **converted to CRC using an exchange rate for the purchase or statement date**, looked up automatically. Original amounts remain stored; the converted CRC amount is what feeds share allocation and the shared-expenses view.

This **supersedes** the earlier decision to keep CRC and USD as separate non-converted figures with no FX in v1.

`[OPEN]` Which rate source is authoritative (e.g. BCCR or another feed), what happens when that feed has no rate for a given date, and whether the rate is eventually overridable. Mechanism belongs in architecture/addendum; the requirement is purchase/statement-date conversion into CRC.

### Incomplete data

**A balance must disclose when it is incomplete.** If a statement was accepted with quarantined rows, any list balance computed over it is understated. Balances derived from statements with unresolved rows must say so.

### Shape for v2

v1 must compute balances from **per-transaction share allocations** (and per-expense payer) that a future payments table can draw down — not from a month-scoped aggregate.

`[OPEN]` How a settlement payment that also appears in a statement avoids being counted twice. Deferred with settlement, but the v1 line-type taxonomy should be able to distinguish an inter-member transfer when it arrives.

### Shared-expenses view

Each shared list has a view whose job is to answer: **given what was imported and how it was attributed, what should each member return to each payer, in CRC?**

**Period.** The view is aligned to **statement / billing cycles**, not a plain calendar month — so the numbers match the documents people just imported.

**Layout.**

1. **Top — settle up.** How much each person needs to pay (in CRC) so the period is even. Includes an option to **simplify** the settlement: recompute who should pay whom so the group makes fewer transfers, without recording that anyone has paid yet. Actual payment recording remains v2; simplify is a suggested transfer plan only.
2. **Below — receipt list.** Items for the period, **most recent first**, in a receipt-like format so members can verify "my items vs yours" the way they already do on paper. Foreign-currency lines show enough original amount + converted CRC to audit the FX step. Incomplete/quarantined data for the period is disclosed on this screen.

`[ASSUMPTION]` "Simplify" minimizes the number of person-to-person transfers while preserving net balances; it does not invent debt or change item splits.

`[OPEN]` How statement-cycle boundaries are chosen when a list holds cards with different billing cycles (pick one cycle, union of cycles, or user-selected statement).

## Statement ingestion

### A file is not a statement

A single uploaded PDF may contain several statements bound for different lists — BAC credit statements carry multiple cards, keyed by cardholder. Ingestion therefore decomposes an upload into N statements, each with its own product identity and its own destination.

This extends the brief's adapter contract, which mapped one file to one product. A splitting step sits between detection and parsing: detect the bank, split the file into statements, then parse each. The Promerica stub and the adapter contract tests must exercise the multi-statement case, not just the single-statement one.

### Review modes

Before review begins, the user chooses one of two modes with a checkbox.

**Bulk.** The whole upload goes to a single list chosen from a dropdown.

**Individual.** Statements are reviewed one at a time, each assigned by a directional gesture:

| Gesture | Result |
|---|---|
| Right | Accept into a chosen list |
| Left | Accept into the user's personal list |
| Down | Skip — the statement is never stored |

Left is the low-effort default for a user's own spending; down exists so that a statement the user does not want tracked at all has somewhere to go.

`[OPEN]` Whether the literal swipe interaction survives implementation. The review-one-at-a-time *pattern* is the requirement; the swipe is the proposed presentation of it. See **Form factor** below.

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

`[ASSUMPTION]` Quarantine also resolves by re-upload: once the parser is fixed, re-uploading lets dedup absorb rows already stored while previously unresolved rows parse and land. This holds only if canonical identity is stable across the fix, which makes dedup correctness load-bearing for recovery rather than merely convenient.

**Hand-fixed rows vs later parse.** When a user has typed a row by hand and a later re-upload produces a parsed row that is the same line or a near match, the system **does not resolve it silently**. It surfaces a conflict and the user chooses: **keep the manual row**, **take the parsed row**, or **keep both**. Ordinary duplicates among fully parsed rows remain automatic ("imported N, skipped M"); only the manual-vs-parsed collision requires this prompt.

### Duplicates

Re-uploading a statement, or uploading one whose period overlaps stored data, is absorbed silently by canonical identity dedup — no interruption, no prompt. Afterwards the user is told what happened, in the shape of "imported 12 new, skipped 43 duplicates."

### Correction

Two paths, because they fail differently.

**Reassignment** handles the common case: a statement went to the wrong list, so move it. **Batch removal** is the escape hatch when an import went badly wrong — the brief's journaled-batch model is retained, so every import remains an atomic unit that can be rolled back and re-run.

### Form factor

The product is used from both a desktop browser and a phone. Mobile is not a later concern: the review flow's gestures and the split-screen comparison view are both described in mobile terms.

Streamlit is a preference, not a commitment. It reruns its script on every interaction and offers no native gesture handling, no first-class PDF viewer, and a weak responsive story — and v1's review flow needs all three. Architecture selects whatever actually delivers the flow described here; this document specifies the experience, not the framework.

## Scope

### In for v1

- Statement upload through the web UI, decomposing multi-statement files, with bulk or individual review before anything is committed
- Bank and product auto-detection via the adapter contract, failing loudly on unknown or ambiguous statements
- BAC PDF parsing for the four products with sample data: walmart, eco, dolares, colones. Walmart is the acceptance bar; the others are provisional until their layouts are reviewed against real statements
- Canonical line-type taxonomy, required canonical fields, and fail-loud handling of unparseable must-parse sections
- Idempotent re-import: re-uploading a statement, or one with an overlapping period, never duplicates ledger lines, with a post-import summary of what was added and what was skipped
- A side-by-side view of the source PDF against extracted items when parsing fails, usable on a phone
- Correction of misfiled imports by reassigning a statement, and rollback of a whole import batch
- A usable mobile layout, not desktop-only
- Installment schedules stored as a distinct record type, excluded from shared totals
- PostgreSQL persistence in its own container, with a data volume outside the repository
- Email-and-password authentication, with users, personal lists created on signup, user-created lists, and per-member splits
- Email invitations to lists, handling both registered and unregistered addresses, with post-signup redirect to the inviting list
- Manual resolution of quarantined rows against the rendered PDF, with provenance recorded per row; on re-upload, conflicts between a hand-fixed row and a new parse prompt the user (keep manual / take parsed / keep both)
- Explicit payer on shared expenses, editable; statement import may default payer then allow correction
- Purchase/statement-date FX: non-CRC amounts converted into CRC for shared balances; original currency retained
- One shared-expenses view per list: statement-cycle period; top settle-up summary in CRC with optional transfer simplification; below that a receipt-style item list newest-first; FX originals auditable; incomplete-data disclosure
- A Promerica stub or contract-test adapter proving extension without modifying core import, dedup, or list logic
- Anonymized or synthetic fixtures committed to the repository, since real statements live outside it

### Out for v1

- Settlement. v1 shows balances; recording payments, drawing down debt, and settlement history are v2. v1's balance computation must be shaped so the running ledger can be built on it
- Machine-learning categorization. Deferred, but the schema reserves `category`, `category_confidence`, and `category_source`, and categorization must never block import. Model direction is recorded in the brief addendum
- Trends and analytics dashboards, and personal-spending dashboards beyond the single shared-expenses view
- Promerica statement parsing itself, pending sample collection
- CSV and HTML statement formats. The adapter contract must accommodate them as format parsers; v1 implements PDF only
- Open-source release. The product is built generic from day one with no personal data committed, but contributor documentation, CI, licensing, and a support policy are post-v1
- A command-line interface

## Constraints and commitments

**Nothing personal is committed.** Real bank statements live outside the repository at a configured path. No personal names, account identifiers, or transaction data appear in code, schema, or fixtures. The product is built with generic vocabulary throughout so that open-sourcing later requires no retrofit.

**Fixtures must survive anonymization.** Statement parsing at this layout complexity is positional — column identity depends on coordinates. A fixture generated by extracting text, anonymizing it, and regenerating a PDF will not reproduce the bank's original glyph positions, so it may not exercise the parsing path the real statement does.

`[OPEN]` How fixtures are produced such that they meaningfully test positional parsing. This is the highest technical risk in v1's test strategy.

**Two-tier test reality.** Only tests running on the owner's machine can touch real statements. Anything committed can only verify against sanitized approximations.

`[OPEN]` Which tier gates a release.

## Open questions

Consolidated from the sections above, plus items the brief assigned to the PRD.

| Question | Origin |
|---|---|
| Deterministic assignment of a one-subunit remainder after a 100%-valid percentage split | Lists; architecture may propose |
| Authoritative FX rate source, missing-date behavior, and whether rate is overridable | Balances; architecture/addendum |
| How statement-cycle boundaries work when a list has cards with different billing cycles | Balances / shared-expenses view |
| How a settlement payment visible in a statement avoids double-counting | Balances and settlement; deferred to v2 |
| Whether the literal swipe survives implementation | Statement ingestion |
| Which front end delivers gestures, PDF rendering, and mobile layout | Form factor; architecture |
| How anonymized fixtures preserve positional layout fidelity | Constraints |
| Which test tier gates a release | Constraints |
| BAC debit (dolares, colones) and eco section maps | Brief; requires fixture review against real statements |
