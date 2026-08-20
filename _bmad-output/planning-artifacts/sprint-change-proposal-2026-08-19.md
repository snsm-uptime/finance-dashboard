# Sprint Change Proposal — 2026-08-19

**Trigger:** Story 4.4/4.5's shipped `BacCreditAdapter` (Epic 4, all of 4.4–4.8 marked `done`) was validated only against a hand-authored synthetic pipe-delimited fixture, never real extracted PDF text. A real BAC credit statement upload this session produced `candidate_row_count == 0` — silent failure, not a loud error.

## 1. Issue Summary

**Problem:** `BacCreditAdapter` cannot parse real BAC credit statements. Two compounding causes, found via code inspection and a real-statement recon this session (never committed — `bank_data/` is gitignored):

1. `_SECTIONS` (`api/adapters/bank/bac_credit/adapter.py:57-72`) declares invented section titles (`"Detalle de compras"`, `"Detalle de pago"`, ...) that don't match real BAC statements' actual lettered headers (`"A) Detalle de pago del periodo"`, `"B) Detalle de compras del periodo"`, ...).
2. `parse()` (`adapter.py:154`) recognizes a data row via `"|" not in line` — an artifact of the synthetic fixture generator (`api/scripts/generate_bac_fixture.py`). Real `pdfplumber`-extracted text never contains a literal `"|"`, so every line of a real statement falls through to header handling and no row is ever classified as data.

Net effect: a real upload doesn't raise `InvalidCanonicalLineError` (which the pipeline already handles per statement) — it silently reaches `STATEMENT_STATUS_STAGED` with zero rows, which is worse than a loud failure because nothing signals the problem to a reviewer.

**Discovered by:** testing a real BAC PDF upload against the Story 4.8 individual-review UI this session, then traced to root cause via code inspection and confirmed against two real statement `mapping.yaml` structure maps (`statement_recon.py`, PII-reviewed, not committed).

**Resolved architecturally this session:** `ARCHITECTURE-SPINE.md` gained AD-28 ("Real-text row recognition + amount-column role"), extending AD-25 (section headers) with a shared, pure-domain row classifier and a product-level `AmountColumnRole` (`CURRENCY_VARIANT` / `SIGN_VARIANT`) concept. `docs/bank-statement-parsing-playbook.md` documents the checklist for applying AD-25 through AD-28 to any adapter. Neither of those closes the gap in `BacCreditAdapter` itself — that's this proposal's scope.

## 2. Impact Analysis

**Epic impact:** Epic 4 remains completable as originally scoped — this is an addition, not a rework of 4.4–4.8's delivered ACs (those stories' synthetic-fixture acceptance bar is still valid as a CI gate; it's just no longer sufficient proof of real-world compatibility, which was never its claim). No other epic is invalidated. Epic 5's Story 5.1 ("Parse failure → side-by-side comparison") stays valid and unaffected — it's the UI failure-path display, orthogonal to whether the underlying parser succeeds. No epic resequencing needed.

**Story impact:** New Story 4.11 added to Epic 4 (see Section 4). No existing story's acceptance criteria change.

**Artifact conflicts:**
- **PRD:** none. FR-14 (detect bank/product), FR-31 (pluggable adapter contract), NFR-8 (fail loud with human override) already cover this exactly — this closes a gap in their existing implementation, not new product scope.
- **Architecture:** already resolved this session (AD-28 added, spine finalized, reviewer gate passed).
- **UI/UX:** none — backend-only fix, no user-facing behavior change beyond "real uploads now actually parse."
- **Other artifacts:** `api/scripts/generate_bac_fixture.py`'s synthetic fixture output and `tests/fixtures/pdf/bac_credit_synthetic_goldens.py` need regenerating to real section titles + real (non-pipe) row shape — both currently modeled on the old invented format this story retires. `docs/bank-statement-parsing-playbook.md` already documents this as the first real application of AD-28.

**Technical impact:** New pure-domain module `api/domain/statement_row_extraction.py` (AD-1 compliant — no `pdfplumber` import). `BacCreditAdapter` wired onto it. No API/schema/DB changes.

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment.** Add one new story to Epic 4's existing structure; no rollback, no MVP scope change.

- **Rollback (Option 2):** not viable — nothing to revert. The bug is latent (present since 4.4/4.5), not introduced by a recent regression; reverting recent work wouldn't remove it.
- **MVP review (Option 3):** not applicable — no scope reduction or goal change needed. This is a correctness fix within already-committed MVP scope (real BAC parsing was always the point of Epic 4).
- **Effort:** Medium (new domain module + adapter rewire + fixture regeneration + goldens). **Risk:** Low — isolated to `adapters/bank/bac_credit/` and one new `domain/` module; does not touch commit, dedup, or list logic (AD-1 boundary).

## 4. Detailed Change Proposals

### epics.md — new Story 4.11

```
### Story 4.11: BAC credit real-statement compatibility fix

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
```

Rationale: closes the gap AD-28 was designed to fix, scoped to the one real adapter that exists today; explicitly excludes `SIGN_VARIANT`/BAC debit to stay within Rule-of-Three-evidenced scope, matching the architecture session's own boundary.

### sprint-status.yaml — new backlog entry

```yaml
  4-11-bac-credit-real-statement-compatibility-fix: backlog
```

Inserted after `4-10-multi-file-upload-pending-queue-dedup`, before `epic-4-retrospective`. `epic-4` stays `in-progress` (unchanged — already in that state).

## 5. Implementation Handoff

**Scope classification:** Moderate — backlog reorganization (this proposal) + real dev implementation, not a same-session direct edit.

**Handoff:**
1. **Product Owner / Developer** — land this proposal's edits to `epics.md` and `sprint-status.yaml` (this document does that).
2. **Developer agent** — run `bmad-create-story` against `4-11-bac-credit-real-statement-compatibility-fix` next to produce the full implementation-context story file, then `bmad-dev-story` to implement.

**Success criteria:** a real BAC credit PDF (operator's own `bank_data/`, never committed) produces nonzero `candidate_row_count` and correct `CanonicalLine` rows on upload; CI's regenerated synthetic fixture + goldens pass with zero manual edits on must-parse lines; no change to `commit`/dedup/list behavior.
