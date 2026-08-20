# Version/Reality Review — AD-28 (Real-text row recognition + amount-column role)

**Scope:** `ARCHITECTURE-SPINE.md`, section "AD-28 — Real-text row recognition + amount-column role"
(lines 263–271), reviewed against `api/scripts/statement_recon.py`, `api/adapters/bank/bac_credit/adapter.py`,
and `api/domain/canonical_line.py`.

**Lens:** every committed decision should be web-researched or reality-checked, not asserted from
training data — current versions, that named tech still exists/fits, and (greenfield) starter defaults.

## Verdict

AD-28 does not introduce any new library/framework/version claims of its own (its only named
dependency, `pdfplumber`, is already pinned and verified elsewhere in the Stack table, per the task's
instruction to skip re-verifying it). Its factual load is almost entirely *reality claims about this
repo's own code and about real BAC statements the author examined out-of-band*, not claims about
external libraries. The in-repo claims check out. The two claims about real (uncommitted) BAC PDF
statements are plausible and consistent with the recon tool's documented workflow, but are
**unverifiable from the repository as committed** — there is no artifact, citation, or timestamp
backing them, which is exactly the kind of unconfirmed assertion this lens is meant to catch, even
though the underlying subject matter is "reality" rather than a library version.

## Findings

1. **(Low-severity, notable) Two empirical claims about real bank statements have no evidence trail in the repo.**
   - "validated against two real BAC statements (credit and debit products); no description text in
     either collided with either token shape."
   - "observed directly: the BAC credit mapping reported different ranges for the same declared
     section on page 2 vs. page 3."
   - `api/scripts/statement_recon.py`'s own docstring explains why: real statement content is
     deliberately never persisted except `statement_marker`/`header_lines` text lifted into
     `mapping.yaml` (a file that itself is not meant to be committed as-is — it must be hand-reviewed
     for PII first). No `mapping.yaml`, recon output, or dated note exists anywhere in either
     worktree (`find . -iname mapping.yaml` returned nothing; no `bac_debit` fixture directory
     exists). So these two claims are **not independently reproducible from what's committed** — they
     rest entirely on the author's word that the recon script was run against real files at some
     point. This is consistent with the tool's intended workflow (privacy-by-design: real statements
     are read-only, never persisted), so it's plausible the checks really happened, but the spine
     gives no date, no session reference, and no residual artifact (e.g., a checksum, a redacted
     screenshot, a note in `deferred-work.md`) to ground it. Recommend either (a) adding one line
     noting when/how this was verified (even just "confirmed by [name] against a real BAC statement,
     2026-08-xx"), or (b) softening the phrasing from an assertion of fact to "expected based on
     [author]'s review of a real statement" if no stronger record exists.

2. **(No finding — confirmed accurate) `_has_date_token`/`_amount_tokens` promotion claim is accurate.**
   Both functions exist verbatim in `api/scripts/statement_recon.py` (lines 83–92) with exactly the
   names AD-28 cites, and do what AD-28 describes (date-shaped-token regex OR-chain; amount-shaped
   regex findall). `domain/statement_row_extraction.py` does not exist yet in this repo, which is
   expected — AD-28 describes a still-to-be-built promotion, not existing code (per task framing).

3. **(No finding — confirmed accurate) The "BAC credit's current `"|" in line` check" claim is accurate.**
   `api/adapters/bank/bac_credit/adapter.py:154` has `if "|" not in line:` guarding row recognition —
   exactly the "synthetic-fixture artifact" AD-28 says needs replacing. (The same pattern also exists
   in `api/adapters/bank/promerica_stub.py:118`, not mentioned by AD-28 — not a defect since AD-28
   only commits to fixing BAC credit's adapter as a named example, but worth knowing the pattern is
   not unique to BAC credit if/when the promotion work happens.)

4. **(No finding — confirmed accurate) The `normalize_dual_column_amount` behavior claim is accurate.**
   `api/domain/canonical_line.py:63-76` implements exactly "prefer the nonzero column; if both
   nonzero, prefer CRC" as AD-28 states, and `api/tests/test_canonical_line_domain.py` has tests
   asserting that exact behavior (`prefers_nonzero_crc`, `prefers_nonzero_usd`,
   `prefers_crc_when_both_nonzero`).

5. **(No finding — confirmed accurate) The AD-26 cross-reference is accurate.**
   AD-26 ("Per-product date-format contract", line 251) does declare `date_format` at the adapter/product
   level (not per-`SectionSpec`), matching AD-28's "mirrors AD-26's `date_format` precedent" claim.

6. **(Not applicable to this repo, expected) `DÉBITOS`/`CRÉDITOS` BAC-debit claim is unverifiable in-repo but out of scope.**
   No BAC debit adapter, fixture, or reference to `DÉBITOS`/`CRÉDITOS` exists anywhere in the repo
   (`grep` returned nothing). AD-28 itself acknowledges this — the spine's Boundaries table (lines
   417–418) explicitly lists "a real BAC debit adapter" as out of scope / not yet built. This overlaps
   with Finding 1 (the underlying claim that a real debit statement was inspected and confirmed to
   carry no textual DB/CR marker is likewise unverifiable from committed artifacts) but is not a new,
   separate issue.

## Non-findings worth noting

- `pdfplumber` is the only named library in AD-28's text; per task scope it is treated as already
  verified via the Stack table (0.11.x, "Versions verified 2026-08-03").
- AD-28 makes no framework/tool version claims, no greenfield-starter-default claims, and names no
  other external technology — so most of the "web-research" lens doesn't have surface area to bite on
  here. The section's factual risk is concentrated entirely in the two unreferenced empirical
  observations in Finding 1.
