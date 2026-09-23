# Sprint Change Proposal — 2026-09-22

## 1. Issue Summary

This proposal covers two related triggers raised in the same session, both "add support for a real bank/product statement template not yet implemented":

**Trigger A — BAC debit.** Sebas wants to add support for `bank_data/BAC_DEB_COLONES_jun.pdf` as a real-statement template for a BAC **debit** account import.

No story currently implements a BAC debit adapter. Story 4.9 (BAC credit real-statement compatibility fix) explicitly deferred this: *"a future bank/product needs SIGN_VARIANT (e.g. a BAC debit adapter) ... that remains out of scope"* and pointed at `ARCHITECTURE-SPINE.md`'s Deferred table, which listed *"A real BAC debit adapter (first concrete `SIGN_VARIANT` implementation) ... no BAC debit adapter has been built yet — out of this update's scope."*

**Evidence gathered (Trigger A):**
- `api/adapters/bank/` contains only `bac_credit/` and `promerica_stub.py` — no debit adapter exists.
- `ARCHITECTURE-SPINE.md` (AD-26, AD-28) already specifies the contract this adapter must satisfy: `date_format = "%b/%d"` (`MMM/DD`, no year token, resolved via `/CreationDate` + nearest-prior-year), and `AmountColumnRole = SIGN_VARIANT` (DÉBITOS/CRÉDITOS resolved by physical x-position, since BAC debit statements carry no textual DB/CR marker).
- Both real PDFs inspected (`BAC_DEB_COLONES_jun.pdf`, `BAC_DEB_DOLARES_jun.pdf`) confirm the architecture's description: no lettered sections (unlike BAC credit's A–G), a single continuous `NO. REFERENCIA FECHA CONCEPTO DÉBITOS CRÉDITOS` table, `CUADRO RESUMEN` header block, `ÚLTIMA LÍNEA SALDO AL CORTE` footer, and single-amount-column rows with no DB/CR text marker.

**Trigger B — Promerica cards.** Sebas asked, mid-workflow, to also add support for Promerica credit cards, then supplied a real sample (`bank_data/PROMERICA_CRED.pdf`).

Story 4.5 shipped only a deliberately-fake Promerica stub, because FR-36 explicitly states *"real Promerica parsing is out of scope until samples exist."* A real sample now exists.

**Evidence gathered (Trigger B):**
- `api/adapters/bank/promerica_stub.py` docstring confirms it: *"Not a real Promerica parser: real Promerica parsing is out of scope until real statement samples exist."*
- `PROMERICA_CRED.pdf` (4 pages, real statement) shows a structure very close to BAC credit's already-solved shape: lettered-equivalent sections ("Detalle de pagos del periodo", "Detalle de compras del periodo", "Detalle de intereses", "Detalle de otros cargos", "Detalle de productos y servicios de elección voluntaria", "Cargos por gestión evidenciable de cobro"), dual colones/US$ amount columns (`CURRENCY_VARIANT`, same as BAC credit — not `SIGN_VARIANT`), and full `DD/MM/YYYY` dates (year present, so no `/CreationDate` fallback needed).

Both triggers are new requirements surfacing gaps the architecture and PRD had already anticipated and flagged as blocked-on-samples, not defects or misunderstandings.

## 2. Impact Analysis

**Epic impact:** Epic 4 (Statement upload & review) is unaffected in structure — all its existing stories (4.1–4.16) stay `done` and valid. Two new stories are inserted, both sequenced immediately after 4.9:
- **4.9.1 — BAC debit adapter (first SIGN_VARIANT implementation)** — depends on 4.9's shared `domain/statement_row_extraction.py` classifier and completes the contract 4.9 deliberately left half-built.
- **4.9.2 — Real Promerica credit-card adapter** — replaces the Story 4.5 stub now that FR-36's blocking condition ("until samples exist") is satisfied; reuses the `CURRENCY_VARIANT` path Story 4.9 already implemented, no new domain logic.

No other epic is affected. No epic becomes obsolete.

**Story impact:** Two new stories only (4.9.1, 4.9.2). No existing story's acceptance criteria change — Story 4.5's stub is superseded (removed) by 4.9.2, not amended, since it was always explicitly a temporary proof, not a real parser.

**Artifact conflicts:**
- Architecture: none — AD-26/AD-28 already specify the `SIGN_VARIANT` contract 4.9.1 implements, and 4.9.2 reuses the already-implemented `CURRENCY_VARIANT` path from Story 4.9. Both stories are "wiring an existing contract onto a new adapter."
- PRD: FR-36 updated with a one-line note that a real Promerica sample now exists (its stated blocking condition). No requirement is rewritten, no MVP scope changes.
- UX: none — both are backend adapters with no user-facing surface of their own.

**Technical impact:**
- New adapter module `api/adapters/bank/bac_debit/`, a debit-specific content-sniff marker, a synthetic fixture + goldens for CI (mirroring Story 4.9's pattern), and two declared x-position ranges for DÉBITOS/CRÉDITOS columns (measured from real extracted token geometry during implementation).
- New adapter module replacing `api/adapters/bank/promerica_stub.py` with a real `PromericaAdapter`, real section titles, a synthetic fixture + goldens, and removal of the now-dead stub module once the real adapter is registered.

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment** for both triggers (add two new stories within the existing Epic 4 structure).

**Rationale:**
- 4.9.1: the architecture contract (AD-26, AD-28) is already fully designed and was validated against real BAC debit statement text before being written — this is pure implementation, not a design decision.
- 4.9.2: FR-36's own stated blocking condition ("until samples exist") is now satisfied, and the required domain machinery (`CURRENCY_VARIANT`, real-header section matching, the shared row classifier) already exists from Story 4.9 — this is replacing a deliberate stub with its planned real counterpart, not new design.
- No rollback is needed for either — nothing built so far is wrong or in the way.
- No PRD/MVP scope change — bank-adapter coverage was always meant to grow; FR-36 gets a one-line status note, not a rewrite.

**Effort estimate:** Low–Medium for each (new adapter module + fixture, but contracts, shared row classifier, and date-parsing infrastructure already exist and are proven against BAC credit).
**Risk:** Low for both (4.9.1's contract is pre-validated against this exact statement family per AD-28's own text; 4.9.2 reuses an already-shipped domain path).

## 4. Detailed Change Proposals

### Epics (`_bmad-output/planning-artifacts/epics.md`)

Inserted **Story 4.9.1** and **Story 4.9.2** between Story 4.9 and Story 4.10 (full AC text is in `epics.md`).

```
### Story 4.9.1: BAC debit adapter (first SIGN_VARIANT implementation)

As a developer extending statement import to deposit accounts,
I want a BacDebitAdapter that recognizes real BAC debit statements (COLONES and DOLARES)
and resolves DÉBITOS/CRÉDITOS by physical column position,
So that debit-account uploads parse into CanonicalLine rows using the AD-28
SIGN_VARIANT contract this story implements for the first time.

7 ACs: content-sniff marker, AD-26 date_format parsing (MMM/DD, no year token),
AD-28 SIGN_VARIANT column resolution by x-position, construction-time range
validation, section-free row classification via shared
domain/statement_row_extraction.py, one adapter covering both COLONES and
DOLARES, CI synthetic fixture with goldens.

### Story 4.9.2: Real Promerica credit-card adapter

As a developer extending statement import beyond the Promerica stub,
I want a real PromericaAdapter that parses real Promerica credit-card
statements into CanonicalLine rows,
So that Promerica uploads stop routing through the deliberately-fake stub
(Story 4.5, FR-36) and parse for real, now that a real sample exists.

7 ACs: real content-sniff marker replacing the stub's fake one, real section
titles (Detalle de pagos/compras/intereses/otros cargos/productos y
servicios de elección voluntaria/gestión evidenciable de cobro) with correct
MUST_PARSE/BEST_EFFORT/IGNORE policies, DD/MM/YYYY date parsing (year
present, no reference-date fallback), CURRENCY_VARIANT amount handling
(same path as BAC credit), shared row classifier reuse, CI synthetic
fixture with goldens, and removal of the now-superseded stub module.
```

(Full Given/When/Then AC text for both stories is in `epics.md`.)

### PRD

```diff
- FR-36: v1 includes a Promerica stub or contract-test adapter proving extension without modifying core import/dedup/list logic, including multi-statement; real Promerica parsing is out of scope until samples exist.
+ FR-36: v1 includes a Promerica stub or contract-test adapter proving extension without modifying core import/dedup/list logic, including multi-statement; real Promerica parsing is out of scope until samples exist. (Update 2026-09-22: a real sample now exists — see Story 4.9.2.)
```

### Architecture (`ARCHITECTURE-SPINE.md`)

```diff
- | A real BAC debit adapter (first concrete `SIGN_VARIANT` implementation) | Contract exists (AD-28); no BAC debit adapter has been built yet — out of this update's scope |
+ | A real BAC debit adapter (first concrete `SIGN_VARIANT` implementation) | No longer deferred — scoped as Story 4.9.1 (Sprint Change Proposal 2026-09-22) |
```

Removed from the Deferred table since it now has a story. No other architecture change for either trigger — AD-26/AD-28/FR-33 already specify the contracts both stories implement.

### Sprint status (`sprint-status.yaml`)

```diff
   4-9-bac-credit-real-statement-compatibility-fix: done
+  # Added 2026-09-22 (Sprint Change Proposal 2026-09-22): first SIGN_VARIANT
+  # implementation, deferred out of 4.9's scope. Sequenced right after 4.9.
+  4-9-1-bac-debit-adapter: backlog
+  # Added 2026-09-22 (Sprint Change Proposal 2026-09-22): real sample
+  # (PROMERICA_CRED.pdf) now exists, unblocking FR-36's deferred real parser.
+  4-9-2-real-promerica-credit-card-adapter: backlog
   4-10-row-level-review-data-model-per-row-commit: done
```

## 5. Implementation Handoff

**Scope classification: Minor** for both. Each is a single new story, fully specified by already-approved architecture/PRD contracts, with no PRD/epic-structure rework needed beyond FR-36's status note.

**Route to: Developer agent** (`bmad-dev-story` or `bmad-quick-dev`) for direct implementation of Story 4.9.1 and Story 4.9.2. They are independent of each other and can be implemented in either order.

**Deliverables for 4.9.1:**
- `api/adapters/bank/bac_debit/adapter.py` implementing `BankAdapter` per AD-28's `SIGN_VARIANT` contract
- Declared, non-overlapping x-position ranges for DÉBITOS/CRÉDITOS (measured from real pdfplumber token geometry against both real PDFs)
- Content-sniff marker distinguishing debit from credit statements
- Synthetic fixture + goldens under `api/tests/fixtures/pdf/` mirroring the `bac_credit_synthetic` pattern
- Tests mirroring `api/tests/test_bac_adapter.py`'s coverage for the new adapter

**Success criteria (4.9.1):** Story 4.9.1's seven ACs pass; both real PDFs (`BAC_DEB_COLONES_jun.pdf`, `BAC_DEB_DOLARES_jun.pdf`) parse into `CanonicalLine` rows with correct sign/line_type per row, matching the visible DÉBITOS/CRÉDITOS column in each row.

**Deliverables for 4.9.2:**
- `api/adapters/bank/promerica/adapter.py` (or similar) implementing `BankAdapter` with real section titles and `CURRENCY_VARIANT`
- Removal of `api/adapters/bank/promerica_stub.py` and its registry entry once the real adapter is registered
- Synthetic fixture + goldens under `api/tests/fixtures/pdf/` derived from `PROMERICA_CRED.pdf`'s real section/row shapes
- Tests mirroring `api/tests/test_bac_adapter.py`'s coverage for the new adapter, including any existing Promerica-stub contract tests migrated to exercise the real adapter instead

**Success criteria (4.9.2):** Story 4.9.2's seven ACs pass; `PROMERICA_CRED.pdf` parses into `CanonicalLine` rows across all MUST_PARSE sections with correct colones/US$ amounts; no test still depends on the removed stub's fake marker.
