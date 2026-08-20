---
title: 'Story 4.8.1: BAC IBAN extraction & card identification at review start'
type: 'feature'
created: '2026-08-20'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: '5024387'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** BAC credit card statements contain a unique IBAN identifier ("Cuenta IBAN colones") that is the authoritative card identifier for the transaction origin. Currently, the BAC adapter extracts transaction rows but does not extract the statement-level IBAN, and the import review flow does not use IBAN to identify or create cards before accepting statements. This means imported items cannot be linked to their origin card.

**Approach:** Extract IBAN from the BAC statement header and store it as statement metadata. Wire card identification into the individual review flow (before individual accept): if the IBAN matches an existing card, silently assign it as the origin for all items in the statement. If the IBAN is unknown, block accept and prompt card registration using the existing `RegisterCardService` (Story 4.1).

## Boundaries & Constraints

**Always:**
- IBAN is extracted and normalized using the same validation rules as Story 4.1 (`domain/cards.py::normalize_iban`)
- IBAN extraction does not modify the adapter contract or `CanonicalLine` shape — it is statement-level metadata, not row-level
- Card matching happens at review-start (before individual accept), not during detection/split
- Known card (IBAN match) → automatically assigned as origin, no UI prompt
- Unknown IBAN → blocks individual accept until card is registered (AD-20 enforcement point)
- All existing import statements without IBAN data must remain importable (no breaking change to existing in-progress sessions)
- IBAN is case-insensitive and may contain spaces — normalize to uppercase, no spaces, before matching/storage

**Ask First:**
- Whether to store IBAN on the statement model/DB, or compute it on-the-fly from the PDF during review (trade-off: persistence vs. re-parsing)

**Never:**
- Do not add new columns to `CanonicalLine` — IBAN is not a per-row attribute
- Do not enforce ISO 13616 checksum validation — treat IBAN as opaque matching string per FR-37
- Do not show or prompt confirmation for known-card matches — auto-assign silently
- Do not block bulk review (Story 4.7) on IBAN — Story 4.7's bulk flow was already `done` and must remain unchanged

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| BAC statement with IBAN header | PDF with "Cuenta IBAN colones: CR03 0102 0241 2935 9242 28" | Extract and normalize to "CR03010202412935924228"; store on statement | N/A |
| IBAN matches existing card | User opens review; statement IBAN matches registered card "My Visa" | Card is automatically assigned as origin; individual accept proceeds without prompt | N/A |
| IBAN does not match any card | User opens review; statement IBAN is unknown | Before individual accept is available, show card registration form; require label + confirm IBAN before proceeding | Validation errors show in form; user can cancel and stay in review (form closes, statement remains in list) |
| BAC statement, no IBAN field | PDF missing "Cuenta IBAN colones" line | Statement has no origin card assigned; individual accept proceeds without card identification | N/A |
| USD IBAN field only | BAC statement with "Cuenta IBAN dólares: XXXX" but empty "Cuenta IBAN colones" | Use the USD IBAN as fallback if CRC is absent | N/A |
| Whitespace-only IBAN | Statement with "Cuenta IBAN colones:   " (spaces only) | After normalization, treat as absent (empty string); no origin card | N/A |

</frozen-after-approval>

## Code Map

- `api/adapters/bank/bac_credit/adapter.py` — extract IBAN from statement text during parse (or split phase); attach to statement metadata
- `api/domain/import_session.py` — statement metadata structure to carry IBAN
- `api/adapters/persistence/models.py` — `ImportStatementModel` extend with `iban` column (nullable)
- `api/adapters/persistence/migrations/versions/0017_*.py` — new migration to add `iban` to `import_statements` table
- `api/adapters/persistence/import_sessions.py` — persist/fetch IBAN on statement model
- `api/application/import_session.py` — new service `MatchStatementCardCommand` / `MatchStatementCardService` to link statement IBAN to existing card or prompt registration
- `ui/app/import/review/ReviewStatement.tsx` (or similar, Story 4.8 review component) — integrate card identification step before individual accept
- `ui/lib/i18n/import.ts` (or extend existing) — i18n copy for card registration during review ("This statement is from [IBAN]. Register a new card?" etc.)

## Tasks & Acceptance

**Execution:**

- [x] `api/adapters/bank/bac_credit/adapter.py` -- Extract IBAN from statement header using the regex/parsing logic; attach as metadata payload or return value from parse/split. Rationale: Statement-level identifier must be captured before row-level parsing; BAC adapter is the authoritative source of IBAN field location.

- [x] `api/domain/import_session.py` -- Add `iban: str | None` field to `DetectedStatement` dataclass (or create a parallel metadata structure) to carry IBAN through the pipeline. Rationale: Callers need access to statement IBAN before commit; domain layer documents the contract.

- [x] `api/adapters/persistence/models.py` -- Add `iban: String(64), nullable` column to `ImportStatementModel`. Rationale: Durable record of which IBAN each uploaded statement came from; enables re-review or audit without re-parsing the PDF.

- [x] `api/adapters/persistence/migrations/versions/0018_import_statements_iban.py` -- Create Alembic migration adding `iban` column to `import_statements` table. Rationale: Schema must evolve before code reads/writes the column; downgrade-safe.

- [x] `api/adapters/persistence/import_sessions.py` -- Persist `iban` on `create_session` when building statement records; fetch it on `get_session`. Rationale: Application layer expects the IBAN to be available during review.

- [x] `api/application/import_session.py` -- Add `MatchStatementCardService` encapsulating the card-identification logic. Given a statement IBAN, either return an existing card or a prompt-state indicating "unknown card, needs registration". Rationale: Centralizes the decision logic (match vs. register) and integrates Story 4.1's services.

- [x] `api/api/routes/import_sessions.py` -- Add new route `POST /import/sessions/{session_id}/statements/{statement_id}/identify-card` accepting `{ "label"?: str }` (optional — if present, register a new card; if absent, return the matched card or status=unknown). Rationale: Review UI needs an endpoint to confirm card identity before individual accept.

- [x] Unit & integration tests -- Test IBAN extraction on real BAC PDF (Task 1); test statement persistence with IBAN (Task 3/4); test card matching on existing card hit, unknown IBAN with registration, missing IBAN (Task 6); test that existing pre-IBAN import sessions remain unblocked (backward compat).

- [ ] Review UI integration (UI) -- Integrate card identification step into the individual review flow before individual accept button is enabled. Reuse `RegisterCardForm` component from Story 4.1. Rationale: User cannot accept a statement without confirming its card origin. (Deferred to separate UI story)

**Acceptance Criteria:**

- Given a BAC statement with "Cuenta IBAN colones: CR03 0102 0241 2935 9242 28", when the PDF is uploaded and split, then the IBAN is extracted and normalized to "CR03010202412935924228" and stored on the statement record.
- Given a statement with a known IBAN that matches a user's existing registered card, when the user opens individual review, then that card is automatically assigned as the origin — no UI prompt or confirmation required.
- Given a statement with an unknown IBAN, when the user attempts to proceed with individual accept, then card registration is required — the form blocks accept until a label + IBAN confirmation is provided (reusing Story 4.1's domain/service logic).
- Given a BAC statement with a missing or whitespace-only IBAN field, when review opens, then import proceeds without card identification and without blocker (graceful degrade).
- Given an import session created before this story (no IBAN data), when the session is re-opened in review, then statements without IBAN do not block or error — review proceeds as before (backward compatible).
- Given a registered card and a matching statement IBAN, when the user accepts the statement, then all ledger entries created inherit that card as `origin_card_id` (integration with origin-chip wiring that will happen in a later story).

## Design Notes

**Card identification timing:** This story gates the *review* flow, not the *upload* flow. Card matching happens when the user opens individual review for a statement:
- If IBAN matches → auto-assign silently, proceed to accept
- If IBAN unknown → show registration form before accept is allowed
- If IBAN absent → proceed without card (no blocker)

Stories 4.6–4.8 already define the import flow; this story inserts the card-matching step into 4.8's individual review, using existing infrastructure (session fetch, statement record, services from 4.1).

**Fallback for missing IBAN:** Real statements might have empty/missing IBAN fields (e.g., old PDFs, non-credit products). The spec does not require IBAN — if it's absent, the review proceeds with no card assignment. This avoids breaking existing in-progress sessions. A future story can add an "unknown origin" filter (like Story 4.2 does for blank/cash/card filters).

**Bulk review unaffected:** Story 4.7 (Bulk review) commits all statements to one list in a batch. That story is already `done`. This story only affects individual review (4.8). Bulk's flow does not call the new card-identification service — bulk pre-dates card routing anyway.

## Verification

**Commands:**

- `uv run pytest api/tests/test_bac_adapter.py -xvs -k "iban"` -- Verify IBAN extraction from the real BAC PDF and synthetic fixture
- `uv run pytest api/tests/test_import_session_domain.py -xvs` -- Verify IBAN field in `DetectedStatement`
- `uv run pytest api/tests/test_import_session_application.py -xvs -k "card"` -- Verify card matching logic
- `uv run pytest api/tests/test_import_session_application.py -xvs -k "integration"` -- Verify full pipeline with real BAC PDF
- `uv run pytest api/tests/ -xvs -m "integration"` -- All integration tests pass (schema migrations, backward compat)
- `npx vitest run ui/app/import/review/*.test.tsx` -- UI review flow integration tests (if applicable)

**Manual checks:**

- Upload the real BAC PDF via the UI; confirm the statement shows the matched card (or registration prompt if unknown)
- Test re-opening an old import session (created before IBAN support); confirm it is not blocked by missing IBAN
- Verify that the card persists across sessions (re-upload same BAC card IBAN; see the same card auto-identified)
