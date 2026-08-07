---
title: 'User alias for readable member labels'
type: 'feature'
created: '2026-08-06'
status: 'in-progress'
baseline_commit: 'adb9c6bec7276faba0db87092ced9c0b0c62aa68'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/3-2-manual-expense-with-payer-adjust-split-ui.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.2 payer/assignee pickers label members with email, but email is an identity surface — hard to read and not meant for UI display.

**Approach:** Add a globally unique slug `alias` per user, collect it after email verification (or on first signed-in visit when verification is off), and use it as the roster/picker label. Ship on `feat/3/3-2-…`. Account-menu rename is deferred.

## Boundaries & Constraints

**Always:**
- Alias: 3–32 chars, `[a-z0-9_]`, global uniqueness case-insensitive; store normalized lowercase
- Email stays auth/invite identifier; never show email as a person roster/picker label
- Every authenticated user must set an alias before list app chrome (setup surface exempt)
- Verify ON: after successful confirm → alias setup before `/lists` (or `returnTo`)
- Verify OFF: first signed-in visit → same setup until set
- Initial set only in this ship (no account-menu edit UI)
- EN+ES for new chrome; Alembic only; DB wipe OK — no alias-less prod data

**Ask First:**
- Returning email alongside alias on members roster (default: alias only)
- Changing invite UX off email identifiers
- Building account-menu alias edit in this PR despite deferral

**Never:**
- Email/masked-email display fallbacks in pickers
- Account-menu / profile rename UI (deferred)
- Bank-description aliases (FR-23 / 5.8)
- Making verification a global login wall beyond existing flow-scoped gate
- Bearer in `localStorage`

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Set after verify | Valid unused slug post-confirm | Alias saved; proceed to app | N/A |
| Set first visit (verify off) | Authed, `alias` null | Soft gate until submit | N/A |
| Duplicate | Taken slug (any case) | Rejected | `409` `{ code: "alias_taken" }` |
| Invalid format | Bad length/charset | Rejected | `422` / `{ code: "invalid_alias" }` |
| Members roster | Member with alias | `{ user_id, alias }`; UI labels with alias | Non-member read → existing 404 |
| Missing alias | Authed, no alias | Alias setup only; no list pickers | N/A |

</frozen-after-approval>

## Code Map

- `api/adapters/persistence/models.py` -- `UserModel` + `alias`
- `api/adapters/persistence/migrations/versions/` -- revision after `0010_…`
- `api/adapters/persistence/repositories.py` -- members select alias; alias claim
- `api/domain/` -- normalize/validate + `AliasTakenError` / `InvalidAliasError`
- `api/application/email_verification.py` -- confirm stays verify-only
- `api/application/preferences.py` / `api/api/schemas/auth.py` -- `MeResponse.alias`; set-alias via PATCH or dedicated set
- `api/api/routes/auth.py` -- initial alias set for authed user without one
- `api/api/schemas/lists.py` / `api/application/expenses.py` / `api/api/routes/lists.py` -- members `alias` not `email`
- `ui/app/verify/VerifyForm.tsx` -- success → alias setup (not raw `/lists`)
- `ui/app/` -- alias setup page/component; `proxy.ts` session-gated
- `ui/app/lists/ManualExpenseForm.tsx` / `listsClient.ts` / members BFF -- label `alias`
- `ui/lib/i18n/` -- EN+ES setup copy

## Tasks & Acceptance

**Execution:**
- [ ] `api/domain` + errors -- validate/normalize alias -- pure rules before IO
- [ ] Alembic + `UserModel` -- nullable `alias` + unique on `lower(alias)` -- schema
- [ ] App service + repo -- claim alias transactionally; unique race → `alias_taken`
- [ ] `GET`/`PATCH` (or set) `/auth/me` + BFF -- expose/set `alias` for users missing one -- wire identity
- [ ] Alias-required gate (API+UI) -- no list chrome without alias -- enforce set-once
- [ ] Verify UI -- post-confirm → alias setup -- verify-on path
- [ ] First-visit UI (verify off) -- shared setup component -- verify-off path
- [ ] Members roster + `ManualExpenseForm` -- `alias` end-to-end; drop roster `email` -- 3.2 labels
- [ ] Tests -- domain matrix, conflict/format API, members shape, form labels -- lock I/O

**Acceptance Criteria:**
- Given verified user without alias, when confirm succeeds, then they must set a valid unique alias before list UI
- Given verification off and no alias, when they open the app, then alias setup blocks until success
- Given a taken alias (case-insensitive), when claimed, then `alias_taken` and clear UI error
- Given members with aliases, when payer/assignee dropdowns render, then they show aliases not emails
- Given invite flows, when inviting, then email remains the invite identifier

## Spec Change Log

## Design Notes

PRD/1.6 forbade display-name; this intentionally adds a minimal slug for Soft-Ledger labels.

Keep `POST /auth/verify/confirm` verify-only; share one setup component for verify-on and verify-off. Prefer set-via `/auth/me` over a second prefs stack. For this ship, reject alias *change* if already set (or omit change UI) — rename lands in the deferred account-menu story.

`DefaultSplitPanel` UUID truncation stays out of AC.

## Verification

**Commands:**
- `cd api && python -m pytest tests/ -k "alias or manual_expense or me or verify" -q` -- alias + members surfaces green
- `cd ui && npm test -- --run ManualExpenseForm` -- picker labels use alias

**Manual checks:**
- Wipe/migrate → register → (flag on) verify → alias form → lists → payer shows alias
- Flag off → register → alias gate → set → second user cannot take same slug
