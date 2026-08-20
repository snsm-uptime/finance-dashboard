# Bank statement parsing — per-bank brainstorm playbook

**What this is:** grounding context for whoever facilitates a per-bank
brainstorm session (per `docs/bank-statement-parsing-agent-setup.md`, step
4) — load this document into that session instead of re-deriving the
contract from scratch. It is a checklist, not a tutorial: for each AD in
the abstract adapter contract, it gives the facilitator the exact question
to ask against a fresh `mapping.yaml`, and where in the code that AD is
implemented.

**Audience:** an agent (or human) about to decide how a specific new
bank/product's `BankAdapter` should be built. Not written for a first-time
reader trying to understand the system — for that, read
`ARCHITECTURE-SPINE.md`'s Design Paradigm section and AD-1, AD-16, AD-25
through AD-28 directly.

**Source of truth:** `ARCHITECTURE-SPINE.md`
(`_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`).
If anything here conflicts with that file, the spine wins — this document
is a derived checklist, not a second contract.

## The repeatable process

1. Get a real statement into `bank_data/` at the repo root — gitignored,
   local-only, **never committed**.
2. From `api/`: `uv run python scripts/statement_recon.py bank_data/<file>.pdf --bank <id>`.
   Full flag reference: `api/scripts/README.md`.
3. Review the generated `mapping.yaml` against the real PDF:
   - **PII check first, before anything else.** `statement_marker` and every
     section's `header_lines` are real text lifted verbatim from the source
     PDF. Detection is heuristic and can misclassify a stray line (e.g. a
     name printed alone) as a header. Manually confirm none of those fields
     contain personal data before this file is shown to anyone, pasted
     anywhere, or committed. Never commit a real statement PDF either.
   - Confirm the tool's structural read matches the actual PDF (it's
     heuristic — verify, don't trust blindly): section boundaries, row
     counts, dual-column presence, `statement_count_method`.
4. Walk the four-AD checklist below against the reviewed mapping. Each
   answer is either "the existing contract covers this as-is" or "this is
   a real per-bank decision to make in the brainstorm session."
5. Implement via a normal story (`bmad-create-story` → `bmad-dev-story`).

## AD checklist

Each AD below is implemented in `api/domain/` and is bank-agnostic — a new
adapter *declares* values against it, never reimplements the mechanism.

### AD-25 — Section header contract

**Implementation:** `SectionSpec` + `SectionCursor`, `api/domain/statement_layout.py`.

**Ask:**
- What are this bank's exact section title strings, in the exact order
  they print, from `mapping.yaml`'s `header_lines`? (Real title text —
  don't guess or invent friendlier names; `SectionCursor.see_header_line`
  does an exact match.)
- Does the same title text legitimately appear more than once, labeling
  different tables (as BAC credit's `"B) Detalle de compras del periodo"`
  does across a page break)? If so, each occurrence is still one
  `SectionSpec` reference — `mapping.yaml`'s sections list is intentionally
  not deduplicated by text for this reason.
- Does a section print a two-level header — a title line immediately
  followed by one column sub-header line (e.g. BAC debit's
  `"NO. REFERENCIA FECHA CONCEPTO DÉBITOS CRÉDITOS"`)? If so, capture that
  exact line as the `SectionSpec.column_header` value; if not, leave it
  `None`.
- What `line_type` and `SECTION_POLICY_*` (`MUST_PARSE` / `BEST_EFFORT` /
  `IGNORE`) does each section need? A section with no transactional
  meaning (e.g. a prior-balance summary) is `SECTION_POLICY_IGNORE`, not
  omitted — an omitted title makes its rows `unmapped` and raises.

### AD-26 — Per-product date-format contract

**Implementation:** `parse_statement_date`, `api/domain/statement_dates.py`.

**Ask:**
- What `date_format` token string does this product's dates need, built
  from `%d` / `%b` / `%y` joined by `-` or `/`? (e.g. `"%d-%b-%y"` for
  `DD-MMM-YY`, `"%b/%d"` for `MMM/DD`.)
- Does the printed date include a year (`%y`)? If not, this product's
  adapter must supply `reference_date` — the source PDF's `/CreationDate`,
  read once per statement chunk — so the shared parser can assign each
  row's year via nearest-year-at-or-before-`reference_date`. Confirm this
  is acceptable for the statement's actual date range (a statement
  spanning a year boundary with no printed year is the edge case to watch
  for).
- Are all month abbreviations covered by `SPANISH_MONTHS` in
  `statement_dates.py`? If the bank prints in a different language or
  abbreviation style, that's a real gap this AD doesn't cover — surface it,
  don't silently extend the fixed table.

### AD-27 — Statement-boundary detection

**Implementation:** `detect_statement_boundaries`, `api/domain/statement_layout.py`.

**Ask:**
- What did `mapping.yaml`'s `statement_count_method` report —
  `page_counter`, `repeating_marker_guess`, or `no_evidence_assumed_single`?
- If `page_counter`: reliable as-is, nothing to decide.
- If `repeating_marker_guess` or `no_evidence_assumed_single`: is the
  fallback actually correct for this bank's real multi-statement PDFs (if
  any), or does this product need a stronger per-statement marker? This is
  a real per-bank judgment call, not something the shared detector can
  infer — bring sample evidence, don't assume.
- What is this adapter's `marker` value (the repeating per-statement
  content-sniff string used by both `detect()` and as the boundary
  fallback)? Confirm it actually repeats once per statement in the real
  PDF, not once per page for an unrelated reason (a running letterhead).

### AD-28 — Real-text row recognition + amount-column role

**Implementation:** intended for `domain/statement_row_extraction.py`
(not yet built — promote from `api/scripts/statement_recon.py`'s
`_has_date_token` / `_amount_tokens` regex logic, the same functions that
generate `mapping.yaml` in the first place). Currency-variant resolution
reuses the existing `normalize_dual_column_amount`,
`api/domain/canonical_line.py`.

**Ask:**
- Does a real data row contain a date-shaped token and at least one
  amount-shaped token, with no description text in this bank's real
  statements colliding with either shape? (This has held for both BAC
  products checked so far — verify it holds for the new bank rather than
  assuming.)
- Does this bank's amount format match the default `#,###.##` pattern
  (US-style thousands comma, two decimals)? If not (decimal-comma,
  parenthesized negatives, a currency glyph), this product must declare
  its own token pattern — AD-28 requires a declared override here, the
  same way AD-26 requires a declared `date_format`; it does not allow
  patching the shared classifier in place for one bank.
- Does a data row have one amount column or two?
  - **One column, or two that are a currency choice** (like BAC credit's
    `colones`/`dólares`): declare `AmountColumnRole.CURRENCY_VARIANT` —
    behavior is unchanged, reuses `normalize_dual_column_amount` as-is.
  - **Two columns where the physical column determines sign/`line_type`**
    (like BAC debit's `DÉBITOS`/`CRÉDITOS`, which carries no textual
    DB/CR marker at all — the column position is the only signal):
    declare `AmountColumnRole.SIGN_VARIANT` and its named x-position
    ranges, one per outcome, 1:1 with outcomes, non-overlapping. Resolution
    is nearest-midpoint-distance, fixed — not a per-adapter choice.
  - This role is declared **once per product**, not per section (AD-28's
    own rationale: evidenced by both real BAC products, each internally
    consistent across its own sections). If a real bank's statement turns
    out to genuinely mix `SIGN_VARIANT` and `CURRENCY_VARIANT` behavior
    across different sections of the *same* product, that is explicitly
    unhandled today (see `ARCHITECTURE-SPINE.md`'s Deferred table) — bring
    it to the brainstorm session as a live open question, not something to
    quietly work around.
  - A `SIGN_VARIANT` declaration with missing, non-1:1, or overlapping
    ranges must raise from the adapter's own construction — confirm the
    new adapter's `__init__` (or equivalent) actually does this before
    calling the declaration done.

## Known gap: the first real application of AD-28

`BacCreditAdapter` (`api/adapters/bank/bac_credit/adapter.py`) is
**currently broken against real BAC PDFs** — confirmed via a real upload
producing `candidate_row_count == 0`, not hypothetical. Follow-up story,
out of scope here, but noted so the connection isn't lost:

- `_SECTIONS` (`adapter.py:57-72`) has invented titles (`"Detalle de
  compras"`, `"Detalle de pago"`, ...) that don't match real lettered
  headers (`"A) Detalle de pago del periodo"`, ...) — plain data-fix once
  real titles are copied from a `statement_recon.py` run; AD-25's
  mechanism already covers it, no new decision needed.
- `parse()` (`adapter.py:154`) still checks `"|" not in line` — the exact
  synthetic-fixture artifact AD-28 replaces. Fix = wire onto AD-28's shared
  classifier (once `domain/statement_row_extraction.py` exists) and
  declare `AmountColumnRole.CURRENCY_VARIANT` for its existing
  colones/dólares columns — behavior unchanged, this is the case AD-28
  leaves untouched.

Treat this fix as AD-28's first real proof, the role the synthetic fixture
played for AD-25/26/27.
