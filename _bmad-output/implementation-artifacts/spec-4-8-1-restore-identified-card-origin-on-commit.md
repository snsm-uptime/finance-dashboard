---
title: 'Restore 4.8.1 identified-card origin on list commit'
type: 'bugfix'
created: '2026-08-20'
status: 'draft'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-8-1-bac-iban-extraction.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Identifying or registering a card no longer stamps that card as origin on ledger rows when the upload is committed to a list. 4.8.1 did this on individual statement accept (`c1fa004`); 4.8.3 moved identification to upload/`SessionReviewPanel`, whose continue path is bulk, and bulk never inherited the stamp. Identify-card also never persists `import_statements.card_id`.

**Approach:** Reuse the 4.8.1 draft stamp — `origin_kind="card"` and `origin_card_id` on every `ManualExpenseDraft` when a card id is known. Persist that id on the statement at identify/register, then bulk (and existing per-row assign) read `statement.card_id`. Do not invent a second origin model.

## Boundaries & Constraints

**Always:**
- Origin fields stay `ManualExpenseDraft.origin_kind` / `origin_card_id`; `commit_statement_batch` already copies them onto `ledger_entries`.
- Stamp is the 4.8.1 two-liner: `origin_kind=ORIGIN_KIND_CARD if card_id else None`, `origin_card_id=card_id`.
- Source of truth at commit is `StagedStatementRecord.card_id` (upload match or identify/register persist).
- Unknown or missing IBAN still commits with blank origin — do not block bulk (4.8.1 Never).
- EN+ES unchanged unless a string must be added (none expected).

**Ask First:**
- Any change to Stories 4.10–4.13 story files or sprint-status.
- Restoring statement-level individual commit/skip BFF routes deleted by 4.10.

**Never:**
- Do not restore `ui/app/api/import/sessions/.../statements/.../commit` or `/skip`.
- Do not add a `routing_mode` gate on bulk (4.7 canary was about routing, not origin).
- Do not pass `card_id` from `BulkReviewPanel` — server already has `statement.card_id`.
- Do not change origin-chip UI, list PATCH origin, or CanonicalLine.
- Do not rewrite `AssignIndividualImportService` for 4.10 `candidate.line` / missing skip service — that path is retired by 4.10.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload matches registered card | Statement IBAN hits an owned card; user bulk-commits | Every committed ledger row has `origin_kind="card"` and that `origin_card_id` | N/A |
| Register then bulk | Unknown IBAN; identify-card with label; then bulk-commit | Statement `card_id` persisted; GET session echoes it; all committed rows carry that origin | Invalid label/IBAN still 422; no persist |
| Identify match (already registered) | identify-card with no label, IBAN matches | Response `matched=true` and statement row `card_id` written | N/A |
| No card | Missing/unknown IBAN, no register; bulk-commit | Rows commit with `origin_kind` and `origin_card_id` both null | N/A |
| Mixed statements | One statement with `card_id`, sibling without | Each statement's rows take that statement's card or blank — no cross-statement bleed | N/A |

</frozen-after-approval>

## Code Map

- `api/application/import_session.py` — `AssignBulkImportService` drafts (~498) omit origin; `AssignCandidateRowService` stamps `command.card_id` only (~707); `ImportSessionRepository` has no statement `card_id` updater.
- `api/api/routes/import_sessions.py` — `identify_card_for_statement` (~416) returns the card, never writes `ImportStatementModel.card_id`.
- `api/adapters/persistence/import_sessions.py` — `commit_statement_batch` already sets `origin_kind`/`origin_card_id` from the draft (~253).
- `api/tests/test_import_session_application.py` — bulk/per-row fakes inspect `commit_calls[].rows[].draft`; canary `test_staged_statement_record_has_no_unchecked_card_routing_field` currently fails because `card_id` already exists on statement records.
- `api/tests/test_import_sessions_integration.py` — `test_bulk_commit_happy_path_lands_ledger_rows_payer_is_actor` asserts ledger columns but not origin.
- Working reference: commit `c1fa004` (individual drafts). Working-but-retired surface: `AssignIndividualImportService` ~620.

## Tasks & Acceptance

**Execution:**

- [ ] `api/application/import_session.py` -- Add `set_statement_card_id` to `ImportSessionRepository`. In `AssignBulkImportService.execute`, set draft origin from `statement.card_id` using the 4.8.1 two-liner. In `AssignCandidateRowService.execute`, use `command.card_id or statement.card_id` for the same stamp so 4.11 inherits this without a new origin design. Rewrite the 4.7 bulk comment: `card_id` is origin, not a routing_mode gate.

- [ ] `api/adapters/persistence/import_sessions.py` -- Implement `set_statement_card_id` (session+user scoped, statement in session, set `ImportStatementModel.card_id`, flush). Raise the existing not-found errors; do not invent a new error type.

- [ ] `api/api/routes/import_sessions.py` -- After a successful match, register, or concurrent-register recheck in `identify_card_for_statement`, persist `card_id` via the new repo method before returning. Do not persist on unmatched / no-label unknown.

- [ ] `api/tests/test_import_session_application.py` -- Fake repo grows `set_statement_card_id`. Assert bulk drafts get origin when `statement.card_id` is set and stay blank when it is not; mixed two-statement session does not bleed. Assert per-row assign uses `statement.card_id` when `command.card_id` is omitted. Rewrite the canary: `card_id` on statement records is allowed; `routing_mode` still fails loud if it appears without a bulk routing gate.

- [ ] `api/tests/test_import_sessions_integration.py` -- Register a card whose IBAN matches the BAC fixture (or identify-card with a label), bulk-commit, assert every ledger row's `origin_kind`/`origin_card_id`. Cover identify-card persist via GET session `statements[].card_id`. Cover no-card bulk still null origin.

**Acceptance Criteria:**

- Given a statement whose `card_id` is set, when bulk commit runs, then every ledger row created from that statement inherits that card as origin (4.8.1 AC, now on the bulk path the upload UI uses).
- Given identify-card matches or registers a card, when the session is fetched, then that statement's `card_id` is present so a later bulk commit does not depend on UI hook state.
- Given Stories 4.10–4.13 remain untouched, when this lands, then statement-level individual BFF commit/skip stay deleted and no epic story file is edited.

## Design Notes

4.8.1 stamped origin from `command.card_id` on statement accept. After 4.8.3 the card lives on the statement; bulk is the list-commit path (`SessionReviewPanel` → `/upload/bulk/...`). Persist + bulk stamp is the same behavior with a durable source.

Do not extract a new origin service. Copy the two-liner next to each draft construction:

```python
origin_kind=ORIGIN_KIND_CARD if card_id else None,
origin_card_id=card_id,
```

`AssignIndividualImportService` already has this from `c1fa004` but is half-broken vs 4.10 (`candidate.amount`, missing skip/BFF). Leave it; 4.10 deletes that path.

## Verification

**Commands:**

- `uv run pytest api/tests/test_import_session_application.py -xvs -k "origin or card_routing or bulk_assign or candidate_row"` -- origin stamp + rewritten canary
- `uv run pytest api/tests/test_import_sessions_integration.py -xvs -k "origin or identify or bulk_commit_happy"` -- persist + ledger origin

**Manual checks:**

- Upload a BAC PDF with a registered matching card, Assign to list, open the list: origin chip shows that card on every imported row.
- Upload with an unknown IBAN, register a label in SessionReviewPanel, Assign to list: same, using the new card.
