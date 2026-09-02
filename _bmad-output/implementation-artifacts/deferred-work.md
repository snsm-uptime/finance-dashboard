- source_spec: `_bmad-output/implementation-artifacts/4-13-individual-review-card-four-direction-actions-inline-title-edit.md`
  summary: A matched card whose `card.cardLabel` is falsy can render "New card!" copy even though it's already matched, in both SessionReviewPanel and IndividualReviewPanel
  evidence: Both `savedName`/`savedCardName` fall back to `t.newCardTitle` whenever `card.cardLabel` is falsy, with no separate "matched but unlabeled" case; pre-existing in SessionReviewPanel's StatementCard, and this round's CreditCardFace reuse copies the same fallback onto IndividualReviewPanel rather than introducing a new bug

- source_spec: `_bmad-output/implementation-artifacts/4-13-individual-review-card-four-direction-actions-inline-title-edit.md`
  summary: A failed left/right accept fling looks identical to a cancelled below-threshold drag — both animate back to center over 220ms, with only small `action.error` text distinguishing a real failure
  evidence: `flingAndSubmit`'s `.finally(() => setDragOffset(null))` runs the same return-to-center transition on both success-then-advance and failure paths; no distinct failure animation (e.g. a shake) was built, a UX nicety rather than a correctness bug

- source_spec: `_bmad-output/implementation-artifacts/4-13-individual-review-card-four-direction-actions-inline-title-edit.md`
  summary: Individual review card's displayed statement period (`statementPeriodBounds`) narrows/shifts as rows are resolved within a multi-row statement, instead of staying fixed to the statement's true date range
  evidence: Computed from `current.statement.rows`, which per the 4.11 `GET` contract only ever contains pending rows; as the user resolves rows one at a time, the min/max over the shrinking `rows` array visibly changes card-to-card. A correct fix needs a statement-level period field from the API independent of row status — out of this UI-only story's scope (code review, 2026-08-24)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Real statement PDFs remain reachable in git history despite untracking `bank_data/`
  evidence: Review noted prior commits still contain `bank_data/*.pdf` blobs; history rewrite was Ask First / out of this story

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Pin Compose/base image digests for reproducible rebuilds
  evidence: Floating `postgres:16` / `python:3.12-slim` / `node:20-bookworm-slim` tags can drift silently

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Harden docker-compose.prod.yml (secret assertions, docs off, bind localhost)
  evidence: Prod overlay currently only adds restart policies and NODE_ENV/ENVIRONMENT labels

## Deferred from: code review of spec-1-1-scaffold-compose-app-with-health-checks.md (2026-08-03)

- Enforce `FINANCE_HELPER_DATA` is outside the git repository root (operator policy / compose validation)
- Add CI Compose config + image build / health smoke (AC3 only required lint/typecheck)
- Pin base image digests and stop floating `pip install uv` in API Dockerfile
- Harden `docker-compose.prod.yml` (localhost binds, reject placeholder secrets, docs off)
- Rewrite git history to purge previously committed `bank_data/*.pdf` blobs (Ask First)

## Deferred from: code review of 1-3-sign-in-sign-out-and-protect-routes.md (2026-08-03)

- ~~Application-layer rate limiting / lockout on `POST /auth/sign-in` — not in Story 1.3 scope; defer to a dedicated hardening story~~ **Resolved in 1.5.6**
- Delete expired opaque session rows inside `resolve_session_user_id` — expired tokens already fail auth; cleanup is housekeeping
- Strengthen “password never logged” tests beyond INFO-level `caplog` (access logs / DEBUG / exception paths)

## Deferred from: code review of 1-2-sign-up-with-email-password-and-personal-list.md (2026-08-03)

- ~~No rate limiting on `POST /auth/register` — Argon2 CPU burn possible; defer to dedicated hardening story~~ **Resolved in 1.5.6**
- Opaque session tokens stored plaintext in `sessions.token` — consider hashing at rest in a later hardening pass
- ~~Incomplete hexagonal ports for session create/resolve and hasher (routes import concrete adapters)~~ — **Resolved by 1.5.7:** `PreferencesRepository`/`UserPreferencesRecord` live in `ports.py`; `/me` Depends on Protocol. `SqlAlchemyAuthUserRepository` remains dual-purpose adapter. Optional physical class split still residual debt (not claimed). Incomplete session/hasher route imports resolved via `SessionStore` + Protocol-typed hasher Depends; free functions retained for password-reset adapter.
- `Argon2PasswordHasher.verify` only caught `VerifyMismatchError` in the 1.2 merge (unused on signup; sign-in path owns hardening)
- CASCADE `ondelete` from users→lists/memberships/sessions untested — no user-delete API yet
- HMAC/sign opaque session cookies with `SESSION_SECRET` — Story 1.2 kept secret as config presence gate only (decision B); signing deferred to hardening

## Deferred from: code review of 1-4-password-reset-via-email.md (2026-08-03)

- Request-reset timing oracle (known email blocks on SMTP while unknown returns immediately) — client ack is identical; full constant-time padding is hardening beyond AC
- Expired/used `password_reset_tokens` table retention/cleanup — no AC for pruning; ops housekeeping
- `revoke_all_sessions_for_user` loads and deletes session rows one-by-one — fine for v1 peer households; bulk DELETE later
- DATABASE_URL default-fallback removal bundled on this branch — Story 1.1 review fix, not introduced by password-reset logic

## Deferred from: code review of 1-5-config-gated-email-verification.md (2026-08-04)

- ~~No per-user throttle on `POST /auth/verify/request` SMTP send — same hardening class as register/reset rate limits~~ **Resolved in 1.5.6**
- Request/send vs concurrent confirm can email a dead (already-invalidated) link — rare race; persist-then-send family shared with 1.4

<!-- Resolved in Story 1.5.1: claim_token re-checks expires_at via shared helper
     (api/adapters/persistence/token_claim.py). Pattern for Epic 2 invites:
     _bmad-output/implementation-artifacts/auth-email-token-claim-pattern.md -->

## Deferred from: code review of 1-6-account-menu-language-en-es-and-theme.md (2026-08-03)

- DB CHECK constraints on `users.language`/`theme` — API validates allowed values; defense-in-depth beyond story AC
- AbortSignal / fetch timeouts on BFF and client prefs requests — hardening beyond story scope; same class as other BFF routes

## Deferred from: code review of 1-6-account-menu-language-en-es-and-theme.md API chunk re-review (2026-08-03)

- Dead API Accept-Language helpers on HTTP path after UI-owned defaults — retained for domain unit tests / possible future consumers
- Unauthenticated `/me` 401 shape mismatch (HTTPException string detail vs JSON `code`) — pre-existing `require_authenticated_user` pattern
- Application-layer unit tests for GetMe/UpdatePreferences services — domain + Postgres integration cover the path when DATABASE_URL is set
- ~~Split PreferencesRepository port from SqlAlchemyAuthUserRepository concrete~~ — **Resolved by 1.5.7:** `PreferencesRepository`/`UserPreferencesRecord` live in `ports.py`; `/me` Depends on Protocol. `SqlAlchemyAuthUserRepository` remains dual-purpose adapter. Optional physical class split still residual debt (not claimed). Incomplete session/hasher route imports resolved via `SessionStore` + Protocol-typed hasher Depends; free functions retained for password-reset adapter.

## Deferred from: code review of 2-1-create-and-rename-owned-lists.md (2026-08-04)

- Invisible/ZWSP-only list names accepted by strip-only `validate_list_name` — polish beyond Story 2.1 AC
- No per-user owned-list creation cap — product limit not in v1 / FR-6 scope
- BFF `/api/lists` Route Handlers lack Vitest coverage (client helper tested; cookie-forward hop untested)

## Deferred from: code review of 1-5-2-auth-mail-interaction-map-and-story-close-overview.md (2026-08-04)

- Known-user SMTP failure returns 503 while unknown email returns identical 200 ack — timing/oracle class already deferred from Story 1.4; map may reference but not “fix” here

## Deferred from: code review of 1-5-6-auth-smtp-rate-limit-hardening.md (2026-08-04)

- Max-key eviction can reset victim windows under key churn — story required hard max-key eviction; deny-new is alternate hardening
- `threading.Lock` inside async `sign_in` can block the event loop — story required Lock for sync+async coexistence on single-worker Compose
- IPv4-mapped IPv6 peer hosts may miss CIDR trust matches — rare under Compose bridge; normalize later if dual-stack peers appear

- Optional `require_authenticated_user` docstring still says “membership ACL = Epic 2” — optional docs-only; Story 2.2 can update when implementing the port
- First-paint client clearing stale `last_opened_list_id` on membership deny — Story 2.2 UX, not contract sketch scope
- Malformed non-UUID `list_id` FastAPI validation (422) vs forcing 404 for anti-enumeration — pre-existing framework path validation
- Rename (`RenameListService`) migration exit criteria / when 2.1 pays AD-24 bare-`list_id` debt — intentional grandfather until an implement story migrates it

## Deferred from: code review of 1-5-7-hex-port-polish-and-compose-pytest-ergonomics.md (2026-08-04)

- Shared `make_client` omits per-request `except`/`rollback` (preferences-style): protects 422 paths sharing the outer test transaction; mid-handler DB errors can leave an aborted transaction for later assertions in the same test — revisit if flakes appear
- New shared `api/tests/conftest.py` has no rate-limiter store reset; if Story 1.5.6 merges first (or after), preserve limiter-store fixture/hooks on rebase per Task 6 conflict map

## Deferred from: code review of 2-2-lists-homepage-membership-scoped-access.md (2026-08-06)

- No HTTP clear for `last_opened_list_id` — first-paint ACL revalidation already falls back without clearing
- Broader UI/first-paint automated coverage (ListsPanel render, serverLanding) — residual Task 5; pure landing + balanceTone covered
- Auto-clear stale last-opened after failed landing — deferred with clear-API; homepage fallback already safe

## Deferred from: code review of 2-3-invite-members-by-email.md (2026-08-06)

- Concurrent invites for same `(list_id, email)` can leave multiple unused live tokens — same invalidate-then-insert shape as password-reset; no partial unique index in v1
- SMTP send can succeed then `get_db` session commit fail — emailed token not durable; shared persist-then-send + commit-on-exit pattern from auth mail
- BFF `POST /api/lists/{id}/invites` has no upstream fetch timeout — consistent with other list BFF routes
- No rate limit on owner invite send — auth SMTP paths limited in 1.5.6; invite abuse hardening out of Story 2.3 AC

- source_spec: `_bmad-output/implementation-artifacts/spec-dev-compose-worktree-scripts.md`
  summary: Primary-checkout Compose can stall ~1h on first boot when a healthcheck fails because base compose uses interval 1h without the worktree overlay
  evidence: Pre-existing docker-compose.yml healthcheck intervals; frozen intent keeps primary on base+dev only, so scripts do not always attach docker-compose.worktree.yml

## Deferred from: code review of 2-5-configurable-list-default-split.md (2026-08-06)

- TOCTOU between member roster snapshot and default-split persist — no row lock/version fence against concurrent invite accept
- No DB integrity that share rows ⊆ current memberships — relies on application soft-fallback; schema FK only to lists/users
- Owner default-split editor labels truncated UUIDs only — display names later; operational mis-assign risk until then

## Deferred from: code review of 2-6-item-and-receipt-split-overrides-domain-api.md (2026-08-06)

- Item override survival across list reassignment — Story 5.5 must migrate/re-key overrides with the ledger subject
- Hardcoded `currency_exponent=2` — v1 CRC/USD only; ISO minor units later
- Settle double-count if summing receipt + item allocations — Epic 3.4 settle must choose one subject grain

## Deferred from: code review of 3-2-manual-expense-with-payer-adjust-split-ui.md (2026-08-07)

- Dual expenses list entry points (`ListExpensesService` vs `GetListExpensesStubService` still calling `list_ledger_entries`) — test/stub bridge; routes use the real service
- `list_ledger_entries` silently skips rows with NULL hand fields — intentional for legacy 2.6 stub seeds until those rows are gone

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-user-alias-display.md`
  summary: Account-menu edit of user alias after initial set
  evidence: Split from alias display intent to keep first ship = set-once gate + 3.2 roster labels; edit deferred as independently shippable

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-user-alias-display.md`
  summary: Invite-accepted members can appear on roster with null alias (UUID label) until they complete setup
  evidence: Review — invites router and signup still mint membership before alias claim; gate blocks their chrome but not other members seeing them

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-user-alias-display.md`
  summary: fetchMe treats upstream/network failures like signed-out and redirects to sign-in
  evidence: Review — requireAlias cannot distinguish 401 from 5xx/offline

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-user-alias-display.md`
  summary: Alias setup locale uses Accept-Language only, ignoring fh_lang_cache
  evidence: Review — list chrome and alias setup can disagree on ES/EN until prefs loaded

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-user-alias-display.md`
  summary: No rate limit or reserved-name list on alias claims
  evidence: Review — global unique slugs are probeable/squattable without throttling or blocked words

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-user-alias-display.md`
  summary: No dedicated test that POST /auth/verify/confirm never mutates alias
  evidence: Review — design says verify-only; locked only by absence of call sites today

## Deferred from: code review of 3-5-1-install-tailwind-sass-warm-balance-theme.md (2026-08-12)

- `@custom-variant dark` is class-only; legacy CSS vars have a `prefers-color-scheme` fallback for the no-class state but `dark:` Tailwind utilities do not — masked today because no component uses `dark:` utilities yet and `themeBootScript` runs pre-paint; revisit when 3.5.2/3.5.3 first uses `dark:` utilities
- `sass` added with zero `*.module.scss` files to prove the compile pipeline works end-to-end — lower risk than the Tailwind PostCSS issue since Next's Sass loader is built-in/stable, but still unverified; will get real coverage once 3.5.2 adds the first `.module.scss`
- "Forbidden: new `*.module.css`" convention is prose-only with no lint/tooling enforcement; 21 pre-existing `*.module.css` files remain, making an accidental violation easy — enforcement tooling is beyond Task 3's scope (convention note only)

## Deferred from: code review of 3-5-4-convention-lock-project-context-architecture.md (2026-08-12)

- `## Story-close overview` heading breaks the Dev Agent Record outline (sits at `##` level between two `###` subsections) — pre-existing pattern, also present in Story 1.5.2; fixing it would deviate from established repo convention across multiple stories
- Story 3.5.3's own file has 3 disagreeing status signals (header "review", Completion Status "in-progress", sprint-status.yaml "done") — pre-existing drift in a different story's file, not caused by 3.5.4's diff
- Task 5's prior explicit constraint ("do not claim CSS Modules removed") was replaced wholesale rather than marked superseded in the Dev Notes — this rewrite predates the current dev session (already staged before work began)
- AD-23 "enforced end-to-end" claim relies on a file-count proxy (0 `.module.css` / 10 `.module.scss` under `ui/`) without auditing whether the 10 `.module.scss` files are genuinely custom-styles-only — explicitly out of scope for this docs-only story per its own Scope Boundaries
- Sibling story 3-5-2 remains `review` (not `done`) while 3-5-4 flips to `review`; `epic-3-5-retrospective` still `optional` — epic-level gate bookkeeping, out of scope for 3.5.4

## Deferred from: code review of 4-1-register-and-match-cards-by-iban.md (2026-08-14)

- No rate limit or per-user cap on `POST /cards` (`api/api/routes/cards.py:32`) — same gap exists on all authenticated CRUD routes (lists, splits), not specific to cards
- No uniqueness constraint on card `label` (`api/adapters/persistence/models.py:137-153`) — duplicate labels across different IBANs weaken the "You already have a card named X" conflict message; cosmetic UX rough edge, no functional harm
- `list_cards_for_user` has no pagination/limit (`api/adapters/persistence/cards.py:52-58`) — same unbounded-query pattern used elsewhere in the app
- `CardsPanel` load-error message is captured pre-translated and does not re-render in the new language after a locale switch while an error is showing (`ui/app/cards/CardsPanel.tsx:30-46`) — minor cosmetic, low-traffic path

- source_spec: `_bmad-output/implementation-artifacts/spec-home-screen-lists-cards.md`
  summary: Home's Cards section heading/subtitle are cookie-locale server text while the embedded CardsPanel's own headings are usePreferences-locale client text, so the two can briefly disagree on EN/ES
  evidence: Review — extends the same SSR-cookie-vs-client-usePreferences locale split already present on the Lists page (h1/subtitle from cookie, ListsPanel internals from usePreferences) to a second, more visible surface; fixing properly means centralizing locale resolution, out of scope for this refactor

- source_spec: `_bmad-output/implementation-artifacts/spec-home-screen-lists-cards.md`
  summary: No test coverage for the new /home route (unauth redirect, alias-gate redirect, dual-panel render, fetchMembershipLists failure branch) or the /lists redirect stub's actual behavior
  evidence: Review — diff only updates pre-existing unit tests' literal "/lists" → "/home" strings; new page logic in ui/app/home/page.tsx and ui/app/lists/page.tsx is unverified by tests

## Deferred from: code review of 4-4-adapter-contract-canonicalline-bac-normalize.md (2026-08-17)

- Sign convention (positive charges / negative payments+credit-notes) was invented without a real BAC statement to validate against — `_signed_amount` (`api/adapters/bank/bac_credit/adapter.py:97-98`) would double-flip an amount if the source ever prints a row already signed; already flagged as a judgment call in this story's own Completion Notes for Story 4.5 to validate against real data
- `LINE_TYPE_CREDIT_NOTE` has no section mapping in `BacCreditAdapter` (`api/adapters/bank/bac_credit/adapter.py:48-59,64`) — unreachable; a real BAC credit-note/refund section would currently fall into the unmapped-section path. Acceptable per this story's Scope Note ("not full statement coverage"); tracked for Story 4.5

## Deferred from: code review of 4-2-manual-origin-card-cash-blank-no-origin-filter.md (2026-08-15)

- Card deletion leaves `origin_kind="card"` with `origin_card_id=NULL` after `ON DELETE SET NULL` (`api/adapters/persistence/models.py:280-285`) — already flagged as a deliberately-deferred gap in this story's own Dev Notes/Completion Notes; also currently unreachable since no card-delete endpoint exists anywhere in the app
- `NoOriginFilter`'s `origin_kind === null` filter can't surface that future corrupted origin state either (`ui/app/lists/NoOriginFilter.tsx:63`) — same root cause and deferral as the card-deletion gap above
- TOCTOU gap between the card-ownership check and the entry write could surface a raw `IntegrityError` (500) instead of a clean 422 if a card is deleted concurrently (`api/application/expenses.py:357-364,389-392`) — currently unreachable, no card-delete feature exists yet
- `fetchCards()` call sites in `NoOriginFilter.tsx`/`ManualExpenseForm.tsx` stuff the generic error string into card-creation-specific message fields (`errorInvalidLabel`/`errorInvalidIban`/`errorDuplicateIban`) — inherited from Story 4.1's `fetchCards()` signature, not introduced by this diff
- Card labels aren't disambiguated in the origin dropdowns (no IBAN suffix) — same underlying gap as 4.1's "No uniqueness constraint on card label" entry above, now also visible in the new origin selectors

- source_spec: `_bmad-output/implementation-artifacts/spec-fix-manual-expense-origin-non-self-payer.md`
  summary: `listsClient.ts`'s error-code mapping for `createExpense`/`updateExpenseOrigin` has no specific message for the new `not_entry_payer` (403) code, so a user who somehow hits it (stale page, race with a payer reassignment, non-UI API caller) only sees the generic fallback error text
  evidence: Review (Blind Hunter) — the UI's own flows (hidden Origin field for non-self payer, `NoOriginFilter` scoped to the viewer's own items) already prevent normal users from reaching this 403, so it's low-frequency; not blocking this fix

## Deferred from: code review of 4-5-bac-credit-card-acceptance-bar-promerica-stub.md (2026-08-17)

- Acceptance-bar release gate never proves compatibility with a real BAC statement's section-header text (`api/adapters/bank/bac_credit/adapter.py:56-69`) — real BAC statements print lettered/differently-worded headers (`A) Detalle de pago del periodo`) that don't match the exact-string `_SECTIONS` map, so every row of a real statement would currently raise `InvalidCanonicalLineError`. Deferred: fixing requires diverging from Task 2.2's explicit "do not diverge from the section map" instruction — a scope decision beyond this story.
- `last_split_boundary_method` mutable instance attribute on shared adapter singletons (`api/adapters/bank/promerica_stub.py:97`, `api/adapters/bank/bac_credit/adapter.py:131`) — newly reachable for concurrent-request corruption now that `ADAPTERS` (`api/adapters/bank/__init__.py:15`) is the first shared singleton registry. Deferred: no concurrent caller exists yet — Story 4.6's upload/import pipeline hasn't landed.
- Latent pdfium/PDF-handling edge cases in `promerica_stub.py` (`api/adapters/bank/promerica_stub.py:99,128-132,154`) — pdfplumber/pdfium page-count mismatch when slicing `split()` chunks, unguarded `pdfium.PdfDocument()` call, page-counter footer lines that would be misclassified as unmapped section headers during `parse()`, and a bare `assert line_type is not None` stripped under `-O`. All four replicate identical patterns already accepted in `api/adapters/bank/bac_credit/adapter.py` (Story 4.4, merged) and aren't exercised by either story's current fixtures.
- Task 2.4's "quarantined list" concept has no equivalent in the real `BankAdapter.parse()` contract — `parse()` is all-or-nothing (`list[CanonicalLine]` or raise, confirmed in `api/application/bank_adapters.py`); this stale reference predates the story and the 2026-08-17 correct-course pass missed it.
- `SectionCursor` doesn't distinguish `best_effort` from `must_parse` behavior (`api/domain/statement_layout.py:75-84`) — only `ignore` is special-cased in `classify_data_row()`; domain code untouched by this diff (Story 4.4).
- `LINE_TYPE_CREDIT_NOTE` still has no section mapping in `BacCreditAdapter` (`api/adapters/bank/bac_credit/adapter.py:56-69`) — carried forward again from the 4.4 deferred-work entry above (which explicitly tracked it "for Story 4.5"); this story's section map has no credit-note section either, so still unreachable/unexercised.

## Deferred from: code review of 4-6-upload-pdf-detect-split-import-session.md (2026-08-19)

- No `GET`/list endpoint for Import Sessions (`ui/app/upload/UploadPanel.tsx`) — session state after upload lives only in React `useState`, so a page refresh loses the only handle on an already-created session, leaking its PDF + DB rows with no cleanup path. Pre-existing scope boundary already documented in the story's own Scope Note ("No bulk/individual review UI... Stories 4.7/4.8").
- No enforced max upload size on either the API route (`api/api/routes/import_sessions.py:68`) or the UI BFF proxy (`ui/app/api/import/sessions/route.ts`) — both buffer the whole file into memory unbounded, and `docker-compose.yml` sets no request-size limit. Deferred: revisit if the app ever goes multi-tenant/public — low risk today given the self-hosted/personal-use trust model.
- source_spec: `_bmad-output/implementation-artifacts/spec-hide-no-origin-filter-when-empty.md`
  summary: List-detail `asExpenses` does not coerce a missing `origin_kind` to null the way `listsClient.asExpense` does
  evidence: Review (Blind Hunter) — `page.tsx` spreads SSR rows without the string-or-null coercion used in `listsClient.asExpense`; `ownBlankOriginExpenses` uses `origin_kind === null`. Pre-existing parser mismatch; hide-when-idle also removes the old empty-state reminder if those rows were ever omitted from the actionable set.

## Deferred from: code review of 4-7-bulk-review-assign-commit-path (2026-08-19)

- AC #2's `?listId=` pre-select mechanism is unreachable dead code — no shipped entry point ever constructs the query param; self-documented in the story's own Task 4.1 as awaiting a future list-scoped upload entry point.
- AC #3's "payer remains editable" has no backing edit endpoint anywhere in the app — matches Story 3.2 hand-expense payer semantics exactly (no payer-edit route exists for any expense today, hand or imported), so it's a pre-existing system-wide gap, not a regression unique to this story.
- A staged statement with zero candidate rows produces a valid but empty Import Batch — `validate_bulk_commit_eligible` only checks that some statement is staged, not that each has rows. Benign, untested.
- `_session_record` (`api/adapters/persistence/import_sessions.py`) eagerly builds full `CanonicalLine` objects for every candidate row on every call site (`create_session`/`get_session`/`discard_session`), though only `AssignBulkImportService` needs that data.
- FX materialization in Bulk commit is sequential per candidate row with no batching and no NFR timing test for the commit path (Story 4.6 added one for upload) — inherited from the existing Story 3.5 manual-expense pattern, not a new regression.
- Application-tier unit tests (`api/tests/test_import_session_application.py`) use a no-op 1:1 `_FakeFxService` for every currency, so non-CRC FX flow through `commit_statement_batch` is only exercised at the Postgres-integration tier.
- `_own_list_id` integration-test helper (`api/tests/test_import_sessions_integration.py`) blindly takes `lists[0]` with no assertion that exactly one list exists — brittle if default-list registration behavior ever changes.

## Deferred from: code review of 4-8-individual-review-swipe-desktop-buttons.md (2026-08-19)

- `discarded_at: object | None` typing on `validate_individual_accept_eligible`/`validate_individual_skip_eligible` loses type-checker protection — inherited from Bulk's identical `validate_bulk_commit_eligible` signature (Story 4.7), not a new regression.
- Zero-candidate-row staged statement can be committed via Individual accept with 0 ledger entries — extends the identical Bulk-path gap already accepted as "benign, untested" in the 4.7 deferred-work entry above; Individual has no equivalent check either.

## Deferred from: code review of 4-10-row-level-review-data-model-per-row-commit (2026-08-21)

- Blanket `except IntegrityError` around the ledger-insert SAVEPOINT (`api/adapters/persistence/import_sessions.py`) maps *any* integrity violation (FK, NOT NULL, other uniques) to `ImportRowNotAvailableError`/409, masking genuine bugs as a benign race — narrowing requires inspecting `orig.diag.constraint_name`, beyond this story's AC.
- `ledger_entries.import_candidate_row_id` is never backfilled for pre-4.10 committed rows, so the reverse link stays permanently NULL for historical data — no AC required a backfill, and the pre-4.10 batch→statement association is not row-granular enough to reconstruct it.
- The `uq_ledger_entries_import_candidate_row_id` backstop sits on an `ON DELETE SET NULL` column under a `delete-orphan` cascade: if a candidate row is deleted the link nulls out and the duplicate guard silently stops protecting that ledger entry (Postgres treats NULLs as distinct, so multiple orphaned entries coexist). Acceptable today since deleted rows are terminal, but fragile.
- No HTTP-level test asserts the `ImportRowNotAvailableError` → 409 `import_row_not_available` mapping on the bulk-commit route; coverage stops at the application tier.

## Deferred from: code review of 4-11-row-level-review-api-rows-assign-delete-undo-edit.md (2026-08-21)

- ~~Last-row assign/delete still runs `_release_source_pdf_if_idle` … ImportReviewSheet …~~ **Owned by Story 4.13.1** (`sprint-change-proposal-2026-08-21.md`): last-card opens the sheet; PDF stays until Save; per-row discard; one Save at the bottom.
- ~~Failed-statement Skip is wired to `deleteRow` on the first pending row (`IndividualReviewPanel.tsx`); leave failed-statement UX for Story 4.13.~~ **Resolved by Story 4.13**: the row-level rewrite retired statement-level skip entirely — a failed statement simply carries an empty `rows` array and contributes nothing to the flattened review queue, so it never produces a card at all. Failed-statement reporting (surfacing that N statements never parsed) remains Story 4.14's completion summary, not this story's.

## Deferred from: Story 4.12 commit batch, dedup summary, land on settle strip (2026-08-23)

- **Revisit dedup scope after Stories 5.5 and 5.6.** Dedup is scoped to the **destination list**, not the importing user. That was chosen because re-import is currently the only informal way to repair a misrouted statement — there is no reassign (5.5), no batch rollback (5.6), and `ReceiptRowMenu`'s Edit does not persist (recorded in 4.15). The accepted cost is that a genuine misroute can leave the same purchase in two lists with no warning. Once real repair routes exist, per-importing-user scope becomes viable and prevents cross-list double-counting.
- `ledger_entries.import_identity` is **not backfilled** — pre-4.12 imported rows keep `NULL` and are invisible to dedup, so re-uploading a statement that was imported before this story duplicates it once. Deliberate (Task 2.6): a pre-4.12 import was never identity-keyed, so claiming one as a duplicate would be a guess. Affects the main dev stack's 70 existing parser-sourced rows, not the 4.12 worktree stack (verified empty 2026-08-23).
- The residual dedup race — two **concurrent** commit actions writing the same identity to the same list — produces one extra ledger line rather than corruption. Not guarded, by design: a UNIQUE index would turn the specified skip-and-count into a 500 on a legitimate statement (two distinct purchases can share a fallback identity), and its `IntegrityError` would be indistinguishable from the candidate-row one at the point the current code maps it. Recoverable via Story 5.6 rollback. Dedup is scoped per destination list, and lists support multiple members (`ListMembershipModel`, AD-19) — this is not limited to a user racing themselves; two different members of a shared list committing overlapping data at the same time hit the identical race.
- ~~A **duplicate-skipped row** is `committed` with a `resolved_list_id` but no ledger entry, and 4.11's pending-only `GET /import/sessions/{id}` contract (kept intact here) means the sheet cannot currently see it at all. **Story 4.13.1 owns both**: widening the payload, and deciding the per-row Discard behavior — returning a duplicate to `pending` sends it back through review where re-assigning skips it again, a loop with no exit, so showing it as *already in this list* with Discard suppressed is the likely answer.~~ **Done in Story 4.13.1**: `assigned_rows` (sibling to the pending-only `rows`) carries `resolved_list_id` + `dedup_skipped` for every committed row; `ImportReviewSheet` shows a dedup_skipped row as already in that list with Discard suppressed in the UI, and `POST .../rows/{rowId}/unassign` 409s `import_row_not_discardable` if called on one anyway (blocked before `_undo_assign`, not silently absorbed).
- Alembic revision id had to be shortened to `0024_import_dedup_identity` (26 chars); the story text's `0024_import_dedup_identity_and_finalize` is 39 and `alembic_version.version_num` is `VARCHAR(32)`. Filename is unchanged.

## Deferred from: code review of 4-12-commit-batch-dedup-summary-land-on-settle-strip (2026-08-23)

- A `staged` statement with zero candidate rows can never resolve in the individual-review UI (Skip/Accept both no-op on an empty row list), and vacuously satisfies `FinalizeImportSessionService`'s pending-row check — a session can end up `finalized` while `session_needs_source_pdf` still retains its PDF forever. Pre-existing statement-lifecycle edge case (`api/application/import_session.py:939-953`), newly interacting with finalize; also untested at the empty-session level.
- `ref_quality` is an adapter-emitted hint, not an authoritative signal (documented in `compute_canonical_identity`'s own docstring) — the same transaction reparsed with a different quality classification across two imports produces two different identities and evades dedup (`api/domain/canonical_line.py:105-106`). Inherent to the hint-based `external_ref` design; this story did not introduce it.
- `_release_source_pdf_if_idle` deletes the PDF file before the DB flush that clears `pdf_path` / sets `finalized_at` commits (`api/application/import_session.py:949-956`) — a mid-request failure after the delete leaves a dangling path reference. The helper and its non-atomicity predate this story; this story adds a new, directly user-triggerable `POST /finalize` call site that widens exposure.
- `imported_new_count` / `skipped_duplicate_count` share field names across `ImportSessionResponse` (session-lifetime, derived fresh every fetch) and `BulkCommitResponse` (scoped to one commit call only) with different scope semantics (`api/api/schemas/import_sessions.py:57-58,90-91`) — worth a naming or doc pass before Story 4.14 wires a summary screen to both.

## Deferred from: code review of 4-14-resume-entry-point-session-completion-summary.md (2026-08-24)

- Discard no longer deletes the source PDF for untouched/partially-reviewed sessions, with no cleanup job to ever reclaim it (`api/application/import_session.py:548-559`) — accepted as designed per user decision: this is exactly what Story 4.14's own AC #6 / Task 5.3 directed (route through `_release_source_pdf_if_idle` instead of the prior unconditional delete). Since `discard_session` never transitions a statement's status away from `staged`, `_PDF_RETAIN_STATUSES` keeps the PDF forever for every "Close" on an unstarted or partially-reviewed import. PDF garbage collection for permanently-`staged` discarded sessions is out of this story's scope; belongs in a future dedicated cleanup story.

## Deferred from: code review of 4-13-1-import-review-sheet.md (2026-08-25)

- Save/Change-List per-row mutation loops (`ui/app/upload/uploadClient.ts`) can't distinguish "mutation succeeded but the response was lost" from a real failure — `postRowMutation`'s catch returns a generic `{ok:false}`, so a dropped connection after a successful delete/unassign leaves the client stuck retrying (now legitimately 409ing) with no path forward short of a full page reload. Pre-existing generic fetch-error handling shared across all row mutations, not introduced by this story; low likelihood, recoverable via reload.

## Deferred from: code review of 4-16-multi-file-upload-pending-queue-dedup.md (2026-08-25)

- Upload 409 is an undeclared `JSONResponse` beside a 201 `response_model` (`api/api/routes/import_sessions.py:200`) — same pattern as the existing 422 upload catches; OpenAPI still advertises only 201 `ImportSessionResponse`.
- Concurrent same-hash uploads can both pass the application check (`api/application/import_session.py:464`) — deferred to a later hardening story: UI drain is sequential; spec forbids a unique `content_hash` constraint. Two overlapping POSTs of the same bytes can both `save` and both insert sessions until `get_db` commits. A partial UNIQUE on active `(user_id, content_hash)` would close it without permanently blocking re-upload after discard/finalize.
- Unrelated `uploadMessages` rewrites in the 4.16 queue diff (`ui/lib/i18n/upload.ts`) — completion strings and `individualReviewNoDefaultList` (cards → account) belong with Group C side-UI/docs, not the queue ACs.
- 10-file cap and SubtleCrypto fallback hashing have no `UploadPanel` tests — Task 6.1 listed other cases; add coverage in a follow-up if the queue stays this shape.
- SoftLedgerSelect blur-after-choose (keyboard vs pointer) — **shipped** on the 4.16 branch: listbox arrows, Enter/Space confirm, blur-after-choose; ↑ opens the picker from individual review.
- ~~Chrome back no longer discards; completion Continue removed; receipt layout, owe-colored sheet Discard, bulk/session spinners, Personal seed default, and SoftLedgerSelect blur are implemented but not written into 4.14 / 4.13.1 / 4.16 Completion Notes — Group D docs (author intent).~~ **Done in Group D (2026-08-25):** 4.16 story-close, 4.14 AC #7 / Tasks 5.2 & 6.4 / completion notes, and 4.13.1 AC #3 + Deviations now match shipped UI.
- Signup still creates Personal without `default_import_list_id`; only `seed_dev_user.py` sets it.
- Settle refund uses abs-amount then sign invert (`api/domain/settle.py`); extra cases (classified reversal, split overrides, payer not in allocations) untested; out of 4.16 ACs.
- Review/bulk/completion files were on 4.16’s “leave alone unless compile error” list; they shipped on this branch anyway.
- `hasRemainingUploadWork` is the in-memory tab queue only (`ui/app/upload/uploadQueueStore.ts`). After a reload, finalized chrome Back lands on the list even if sibling files existed in an earlier queue — 4.16 tab-lifetime by design.
- Sheet Discard still stages `deleteRow` at Save rather than unassign-to-pending (`ImportReviewSheet.tsx`) — already recorded in 4.13.1 Deviations; Change List is the unassign path.

## Deferred from: code review of 5-1-parse-failure-side-by-side-comparison.md (2026-08-26)

- `FilesystemPdfStorage.delete` still unlinks any path with no volume `is_relative_to` check (`api/adapters/storage/pdf_storage.py:27`). Story 5.1 confined `read` only; `delete` is the pre-existing 4.6 helper. A corrupted stored path would be refused on PDF GET but still unlinked on cleanup.

## Deferred from: code review of 5-3-reassign-statement-to-another-list.md (2026-08-26)

- GET expenses swallows `InvalidSplitOverrideError` and sets `lens=None` (`api/application/expenses.py:382`) — pre-existing Epic 3 path; story 5.3 409s on reassign but dest Soft-Ledger can still go blank if an override is invalid after the move.
- `fetchLists` always calls `replaceMembershipLists` (`ui/app/lists/listsClient.ts:109`) — opening the reassign picker reuses that helper and can rewrite homepage membership cache on a partial GET.
- Reassign has no row lock (`api/application/reassign_statement.py` read then `apply_statement_reassign`) — same last-write-wins pattern as other list mutations; 5.4 rollback follows whichever dest flushed last.

## Deferred from: code review of 5-4-roll-back-an-import-batch.md (2026-08-27)

- No audit trail for import-batch rollback (who deleted a committed batch and when) — `RollbackImportBatchService`/`rollback_batch` hard-delete ledger rows, split overrides, and the batch row with no log entry. Pre-existing gap: no audit-log infrastructure exists anywhere in this codebase for any mutation today (`api/application/import_rollback.py`).

## Deferred from: code review of 5-5-same-price-conflict-review-manual-parsed.md (2026-08-28)

- If the actor loses membership on one side of a same-price conflict after detection (removed from `manual_list_id` or `parsed_list_id`), the conflict becomes invisible to everyone — `list_unresolved_conflicts`/`resolve_conflict`'s ACL both require current membership on both lists — and can never be resolved, leaving it in the durable queue forever (`api/adapters/persistence/same_price_conflicts.py`, `api/application/same_price_conflicts.py`). Deferred, rare edge case, fix later.
- No test exercises same-price detection through the actual production wiring in `AssignBulkImportService.execute`/`AssignCandidateRowService.execute` (`api/application/import_session.py`) — every existing test calls `DetectSamePriceConflictsService` directly. A Postgres-integration test through the real commit path (likely via the existing `test_import_sessions_integration.py` PDF-fixture TestClient setup) would close this gap against AD-15's "Postgres 16 integration for the commit→detect→resolve path" requirement.

## Deferred from: code review of 5-6-alias-on-confirm-manual-entry-re-upload-conflict.md (2026-08-28)

- `normalize_alias_pair` strips but does not case-fold or collapse internal whitespace, so `"Supermercado XYZ"` vs `"SUPERMERCADO XYZ"` (or double-spaced variants) coexist as separate rows under the exact-match `UNIQUE (list_id, manual_label, bank_description)` constraint, undermining the dedup guarantee for the same real-world pair (`api/domain/description_alias.py`). Matches the story's literal strip-only scope (Task 1); deeper normalization belongs with the future ML read-path, not this write-only schema-seed story.
- `description_aliases.source_conflict_id` has no standalone index (`api/adapters/persistence/migrations/versions/0030_description_aliases.py`) — Postgres doesn't auto-index FK columns. Currently moot since every write path in this diff writes `None` (documented deviation: the conflict row is cascade-deleted before the alias write runs); revisit if a future write path ever populates it.
- The identical constraint-name-swallowing pattern reused verbatim in this story's `record_alias` (see the story's own Review Findings for the in-scope patch) also exists unfixed in the pre-existing `create_conflict` (Story 5.5, `api/adapters/persistence/same_price_conflicts.py:148-150`) — `constraint is not None and constraint != "uq_same_price_conflict_pair"` silently swallows any `IntegrityError` whose driver can't resolve `constraint_name`, instead of re-raising per its own comment's intent. Out of this diff's scope; worth closing alongside the 5.6 instance for consistency.

## Deferred from: code review of 5-8-settle-up-simplify-suggested-transfers.md (2026-08-30)

- `GetListBalancesStubService`/`compute_viewer_pairwise_edges` re-fetches ledger entries and re-runs full allocation math 2-3x per `/balances` GET (once for the single-balance path, once-or-twice more for pairwise edges) instead of sharing one fetch (`api/application/lists.py:423-500,564-610`). Inefficiency introduced by this diff, harmless at current list sizes; revisit if `/balances` becomes a hot path.
- `ListPairwiseBalances` dataclass is added per Task 2 but never constructed anywhere — `GetListBalancesStubService` returns `ListBalancesStub` instead, exactly as the class's own docstring admits (`api/application/lists.py:234-257`). Dead code, harmless; low-cost cleanup for a later pass.
- `compute_pairwise_settle_balances` has no sum-to-zero invariant check, unlike its sibling `compute_settle_balance_for_list_members` which logs a warning on drift (`api/domain/settle.py:155-217`). Nice-to-have parity, not required for correctness.
- `compute_viewer_pairwise_edges` silently returns `((), ())` via `getattr` duck-typing when a repo lacks `list_ledger_entries`/`list_members_with_alias`, rather than raising (`api/application/lists.py:438-441`). Could mask integration gaps in non-Postgres/test repos; matches an existing duck-typing pattern elsewhere in this service.
- 3-member settle-boundary interaction (settling with two distinct counterparties) is untested — existing settled_at-boundary tests only exercise the 2-member helper (`api/tests/test_lists_integration.py`). Test-coverage gap, not a functional defect.

## Deferred from: code review of 6-2-spend-by-origin-statement-cycle.md (2026-08-31)

- Origin-spend fetch can reject the whole page's `Promise.all`, discarding already-successful expenses/balances data (`ui/app/lists/[listId]/page.tsx:681-705`) — the same throw-vs-non-ok gap already exists for the `expensesRes`/`balancesRes` fetches this diff sits beside; this diff extends the established pattern rather than introducing a new one.
- `GetListOriginSpendService` performs its own independent full-ledger fetch (`api/application/lists.py:170-171`) — every sibling read service (`GetListCyclesService`, balances, expenses) already re-fetches `list_ledger_entries` independently on the same page render; established architecture, not a regression this diff introduces.
- Origin-spend fetch/render gating doesn't distinguish "not solo" from "members failed to load" (`ui/app/lists/[listId]/page.tsx:702,731`) — mirrors `showSettleChromeFrom`'s existing coupling to bare `members.length` from Story 6.1; not a new ambiguity introduced here.

## Deferred from: code review of 6-3-budget-list.md (2026-08-31)

- The new budgets page's `redirect()` call for a 401 response sits inside a bare `try { ... } catch { loadError = true }` block that would swallow the Next.js `NEXT_REDIRECT` throw if ever reached (`ui/app/lists/[listId]/budgets/page.tsx:115,124`) — byte-for-byte the same pattern already shipped in `ui/app/lists/[listId]/page.tsx:637,772`. The session is already checked via `fetchSession()`/`requireAlias()` before either fetch runs, so the branch is effectively unreachable in practice; the real fix is a whole-codebase pattern change (rethrow on `isRedirectError`), not something scoped to this one story.

## Deferred from: code review of 6-4-budget-detail.md (2026-08-31)

- The new budget detail page copies the same bare `try { ... } catch { loadError = true }` block around a 401 `redirect()` call (`ui/app/lists/[listId]/budgets/[budgetId]/page.tsx:97-112`) — a third instance of the exact pattern already deferred from Story 6.3's review (itself matching `ui/app/lists/[listId]/page.tsx`). Still a whole-codebase pattern fix, not scoped to this story.
- `resolvePageLocale`/`cookieHeader` are duplicated verbatim between the list page and the new detail page (`ui/app/lists/[listId]/budgets/[budgetId]/page.tsx:18-29` vs. `ui/app/lists/[listId]/budgets/page.tsx:18-29`) — matches the same per-page duplication convention already established across this module; a shared helper extraction would need to span multiple existing pages, out of this story's scope.

## Deferred from: code review of 6-5-budget-attribution-manual-and-rules.md (2026-09-01)

- `LedgerEntryRecord.normalized_description: str` is typed non-optional while the underlying column is nullable (`api/adapters/persistence/models.py:287`); this story is the first to serialize it straight into a public response schema without a null guard, so a legitimately-NULL description could 500 (`api/api/schemas/budgets.py:38,73`) — pre-existing typing gap not introduced by this story.
- `assign_entry_to_budget` does an unconditional overwrite with no optimistic-locking/conflict signal for concurrent (re)assignment of the same entry (`api/adapters/persistence/budgets.py:88`) — low real-world likelihood since all entry points are solo-list-gated in the UI; the API itself is unprotected.
- `CreateBudgetRuleBody.match_text` has no schema-level `Field(max_length=...)` (`api/api/schemas/budgets.py`) — a `Field(max_length=100)` fix was attempted and reverted during review: it breaks AC #12's requirement that over-length text gets the custom `invalid_budget_rule_match_text` code (schema-level rejection short-circuits to FastAPI's generic validation error). Same tradeoff exists untested on `CreateBudgetBody.name`. A real fix needs a custom Pydantic validator that re-raises the domain error, applied codebase-wide, not a bare `Field` constraint on one field.
- **Budgets-per-user redesign needed.** An unassigned line matching rules on two different budgets currently double-counts into both budgets' `spent` (`compute_attributed_entries` runs per-budget, no cross-budget arbitration — `api/domain/budget_attribution.py:64-91`, `api/application/budgets.py:155-186`); separately, unassigning a line that still matches the same budget's own rule is immediately re-captured on the next read with no visible effect (`api/application/budgets.py:330-357`). Both are artifacts of the current list-scoped, single-attribution model — user wants budgets scoped **per user** instead of per list, with a line legitimately able to count toward multiple budgets at once, and shared-list lines split to only the current user's portion. Neither finding is a 6.5 bug under the model 6.5 was actually built against; both need a `bmad-correct-course` pass touching Stories 6.3/6.4/6.5 together to redesign budget scoping, not a point patch.

## Deferred from: code review of 7-2-cross-list-budget-detail.md (2026-09-02)

- A fourth instance of the same bare `try { ... } catch { loadError = true }` block swallowing the `NEXT_REDIRECT` throw on a 401 response, this time in the new standalone `/budgets/{budgetId}` page (`ui/app/budgets/[budgetId]/page.tsx:114-148`, `redirect()` call at line 127) — matches the pattern already deferred from Stories 6.3 and 6.4 (`ui/app/lists/[listId]/budgets/page.tsx`, `ui/app/lists/[listId]/budgets/[budgetId]/page.tsx`) verbatim. Still a whole-codebase fix (rethrow on `isRedirectError`), not scoped to this story.

## Deferred from: code review of 7-3-cross-list-attribution-rule-badge.md (2026-09-02)

- `BudgetAssignPanel`'s trigger button has no busy/loading guard while `fetchCandidates` is in flight — a rapid double-click can fire overlapping candidate fetches (last response wins, no request de-dupe/cancellation), and the empty-candidates state is indistinguishable from still-loading (`ui/app/budgets/[budgetId]/BudgetAssignPanel.tsx:38-50`). Pre-existing: verbatim port from the pre-7.1 (Story 6.5) `BudgetAssignPanel.tsx`, confirmed via `git show fd4679c^`.
- `BudgetRulesPanel`'s `deletingId` state tracks a single rule id, not a set — deleting a second rule while a first delete is still in flight re-enables the first rule's delete button mid-request, allowing a duplicate `deleteRule` call for it (`ui/app/budgets/[budgetId]/BudgetRulesPanel.tsx:29,49-53,80`). Pre-existing: verbatim port from the pre-7.1 (Story 6.5) `BudgetRulesPanel.tsx`, confirmed via `git show fd4679c^`.
- The new BFF routes (`assignments/route.ts`, `rules/route.ts`) coerce a missing/non-string required field (`ledger_entry_id`, `match_text`) to `""` and forward it upstream instead of rejecting with a 400 at the BFF boundary (`ui/app/api/budgets/[budgetId]/assignments/route.ts:39`, `ui/app/api/budgets/[budgetId]/rules/route.ts:36`). Matches the established `typeof body.x === "string" ? body.x : ""` convention already used in `ui/app/api/budgets/route.ts`; not a new deviation introduced by this story.

- source_spec: none
  summary: Redesign the standalone budget detail page (`ui/app/budgets/[budgetId]/page.tsx`) — status/3-dot header, progress line, `ReceiptRow`-based transaction history, Edit sheet (reusing `BudgetsCreateForm` + `Sheet`), delete confirm, and a Manage Rules sheet (reusing `StackedListPanel` + `Sheet`)
  evidence: Split from the same user intent at 2026-09-02 — this frontend work is blocked on budget-detail-crud-and-viewer-share (PATCH/DELETE /budgets/{id} + viewer_share_crc on history lines) shipping first; bundling both in one spec would exceed the 900-1600 token target and mixes a backend-plumbing goal with a UI goal that can be reviewed/tested separately.

## Deferred from: code review of spec-budget-detail-crud-and-viewer-share.md (2026-09-02)

- Budget rename uniqueness (`UpdateBudgetService.execute`, `api/application/budgets.py:193-196`) is enforced with an application-layer read-then-compare loop, not a DB unique constraint or row lock — two concurrent `PATCH` requests renaming different budgets to the same new name can both pass the check and both write, producing a silent duplicate the spec claims is rejected. A real fix needs a partial unique index on `(owner_user_id, name)` plus handling the resulting `IntegrityError`, which is migration-scale work beyond this story's app-layer-only ask.
- `_compute_spent_and_history`'s per-history-line viewer-share resolution (`api/application/budgets.py:283-306`) calls `list_repo.list_member_ids`/`get_stored_default_split`/`get_list` once per entry with no caching keyed by `list_id` — a budget with many entries from the same source list re-fetches identical list metadata on every line. Same "accept N-query cost, not a hot path" reasoning this module already uses elsewhere (see `ListBudgetsService`'s own docstring), but worth batching per-`list_id` if budget detail pages grow large.
- `resolve_viewer_lens_for_entry` (extracted from the pre-existing `_with_viewer_lens`, `api/application/expenses.py`) swallows `KeyError`/bare `ValueError` in addition to the domain-specific split errors, with no logging on the fallback path — pre-existing behavior, but this story adds a second call site (budget history, looped per entry) that widens its blast radius; an unrelated bug raising one of those exception types would now silently degrade to "full amount" in two places instead of one, undetectable without added logging/metrics.
- `BudgetHistoryLine.payer_id`/`BudgetHistoryLineResponse.payer_id` are typed as non-optional `UUID` while the underlying `ledger_entries.payer_id` column is nullable (`api/adapters/persistence/models.py:290`) — pre-existing typing gap on `LedgerEntryRecord.payer_id` (same class of issue already deferred for `normalized_description` from the 6.5 review), now surfaced in a second public response schema. A legitimately-NULL payer would 500 via Pydantic validation rather than any graceful path.
- No integration test exercises viewer-share resolution through an actual item/receipt split override or non-even stored default reaching a budget history line via the real `SqlAlchemyListRepository` path — only a fake-repo unit test (`test_split_resolution_failure_falls_back_to_full_amount`) covers the failure branch, and the two real-DB integration tests only cover the even-split default case. A mismatch between what the fake repo simulates and what the real adapter raises on a broken override wouldn't be caught.
