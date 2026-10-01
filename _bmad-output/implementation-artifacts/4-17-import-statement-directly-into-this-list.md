---
baseline_commit: 9e1b0fc5a2ddf71205c9831831e5d185283a1a79
---

# Story 4.17: Import statement directly into this list

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Origin note — read before starting

Added 2026-09-30 via `bmad-correct-course` (Sprint Change Proposal 2026-09-30), surfaced
mid-UX-pass while scoping Epic 12 (Statement browsing & retouch). FR-58, new 2026-09-30.
Part of the same batch as Story 5.10 (Epic 5) and Epic 12 — see Epic 12's cross-reference
note in `epics.md` for backlog-tracking visibility across the three.

UX spines for this batch: `_bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-30/DESIGN.md` and `.../EXPERIENCE.md` (both `status: final`).

## Story

As a list member,
I want to start a statement import right from a list's detail page,
so that I don't have to rely on card-routing or a default-list setting to land a statement where I already know it belongs.

## Acceptance Criteria

1. **Given** I am viewing a list's detail page (`ui/app/lists/[listId]/page.tsx`), **when** I activate its new "Import statement" entry point, **then** the existing upload/review flow opens (parse, comparison, individual/bulk review) exactly as it does from the global `/upload` entry — no destination-list picker step is shown or needed, because this list is already the destination (FR-58).
2. **Given** a statement imported this way under review-routing (Story 4.3 "review" mode), **when** the review flow resolves a destination for a row that would otherwise fall back to the account's configured default list, **then** this list is used as that fallback instead — the user is never asked to pick a list for rows routed by this entry point.
3. **Given** a statement imported this way whose card is in **fixed-list** mode (Story 4.3) with a *different* fixed list configured, **when** the session auto-routes, **then** the card's fixed-list routing still wins (unchanged from today) — this entry point only overrides the *default-list fallback* used in review-routing mode, it does not override an explicit per-card fixed-list setting. (See Dev Notes — "Open question" — for the rationale and what to do if product wants the reverse.)
4. **Given** a statement imported this way, **when** parse failures, same-price conflicts, or quarantine would normally apply, **then** they apply identically to today's behavior — this entry point changes only how the destination list is chosen, nothing about review/safety behavior.
5. **Given** the list detail page's "Import statement" control, **when** a screen-reader user encounters it alongside the app's global Upload control, **then** its accessible name names the destination list (e.g. "Import statement to {list name}"), distinct from the global Upload button's label (EXPERIENCE.md Accessibility Floor).
6. **Given** I activate "Import statement" while I already have an active (unfinalized) Import Session open, **when** the entry point runs, **then** it follows the same single-active-session behavior the global Upload page already has (`/upload` redirects into the existing active session rather than letting two sessions run) — this entry point does not bypass that rule.

## Tasks / Subtasks

- [ ] Task 1 — List detail entry point (AC: #1, #5)
  - [ ] Add an "Import statement" control to `ui/app/lists/[listId]/page.tsx` (placement: alongside/near the existing receipts chrome or in `ListDetailMobileActions`/`mobileActions` — follow this file's existing action-slot conventions, do not invent a new chrome pattern)
  - [ ] Accessible name includes the list's name (`t`-driven i18n string with a `{list}` placeholder — mirror the pattern other list-scoped messages use, e.g. `individualReviewAcceptDefault.replace("{list}", ...)` in `IndividualReviewPanel.tsx:1004`)
  - [ ] Add EN/ES strings to `ui/lib/i18n/lists.ts` (or wherever `listsMessages`/`uploadCopy` keys for this surface belong — check both, since the control lives on a list page but drives the upload flow)
- [ ] Task 2 — Carry the bound list through to the upload flow (AC: #1, #6)
  - [ ] Decide and implement the hand-off mechanism from the list detail page to `/upload` (recommended: a `?listId=` query param read by `ui/app/upload/page.tsx` / `UploadPanel.tsx`, since there is no existing session-scoped "pre-bound destination" field server-side — see Dev Notes)
  - [ ] Confirm the existing active-session redirect in `/upload` (AC #6) is not bypassed when arriving via this entry point
- [ ] Task 3 — Override the review-routing default-list fallback (AC: #2, #3)
  - [ ] In `IndividualReviewPanel.tsx`, `defaultListId` currently comes only from `GET /api/auth/me`'s `default_import_list_id` (lines 424-438) — when this flow carries a bound list id, that bound id must be used as `defaultListId` instead, without touching the account-level setting
  - [ ] In `SessionReviewPanel.tsx`'s `sessionAutoRoute` (lines 157-193), fixed-list routing (`autoRoute.kind === "fixed"`) must still win over the bound list — only the "review" (undetermined) path's eventual default-list fallback is affected
- [ ] Task 4 — Accessibility (AC: #5)
  - [ ] Verify the control's `aria-label` is distinct from the global Upload button's label (check `ui/app/upload/UploadButton.tsx` for its current label) — add a dedicated i18n key, do not reuse the global one
- [ ] Task 5 — Tests
  - [ ] Component/unit test for the new entry point rendering with the correct accessible name
  - [ ] Test that `IndividualReviewPanel` uses a passed-in bound list id over `/api/auth/me`'s default when both are present
  - [ ] Test that fixed-list card routing is unaffected by a bound list id (AC #3)
  - [ ] Existing upload-flow tests (`UploadPanel.test.tsx`, `SessionReviewPanel.test.tsx` if present) still pass unmodified for the global `/upload` entry (no regression to today's behavior)

## Dev Notes

### How destination-list resolution actually works today (read this before implementing)

This story's AC #1-3 depend on understanding that **there is no existing concept of a
session-level "pre-bound destination list"** in the backend. Destination resolution today
is entirely client-driven, in two different ways depending on routing mode:

- **Fixed-list cards** (Story 4.3): `SessionReviewPanel.tsx`'s `sessionAutoRoute()`
  (`ui/app/upload/SessionReviewPanel.tsx:157-193`) checks every statement's identified
  card for a `fixed_list_id`; if every card agrees, it auto-assigns every pending row to
  that list via `assignRow(sessionId, row.id, listId, ...)` and redirects into the review
  sheet. This path never asks the user to pick a list.
- **Review-routing cards** (the "undetermined"/"review" `autoRoute.kind`): the session
  redirects to `/upload/review/{sessionId}` → `IndividualReviewPanel.tsx`, whose
  `defaultListId` state (`ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:424-438`)
  is fetched client-side from `GET /api/auth/me`'s `default_import_list_id` field — an
  **account-level** setting, not a per-session one. The user can also pick any other list
  via `pickedListId` (`SoftLedgerSelect`) for the "chosen list" accept direction.
  `landing_list_id` on the session (`api/domain/import_session.py:163`,
  `select_landing_list_id`) is a **post-hoc summary** of where rows ended up — it is
  computed from already-resolved rows, not settable at upload time.

There is **no `list_id` field anywhere on `UploadStatementPdfCommand`**
(`api/application/import_session.py:465-469`) or the `POST /import/sessions` route
(`api/api/routes/import_sessions.py:228-284`). Backend session creation does not know
about a destination list at all today.

**Recommended approach (not mandatory — flag if you find a cleaner one):** since the
destination is resolved client-side, the simplest correct implementation is also
client-side: carry the originating list's id from the list detail page through to
`/upload` (e.g. a `?listId=` query param), and have `IndividualReviewPanel` prefer that
bound id over the `/api/auth/me` fetch for `defaultListId` when present — no backend
change needed for the review-routing path. This keeps AC #3's fixed-list precedence
trivially correct, too, since `sessionAutoRoute`'s fixed-list check never looks at
`defaultListId` in the first place — it only matters whether `autoRoute.kind` reaches
`"review"` before the bound list id is consulted.

### Open question — fixed-list vs. list-scoped import precedence (AC #3)

The Sprint Change Proposal and UX pass did not explicitly resolve what should happen when
a user launches "Import statement" from List A, but the statement's card is configured
(Story 4.3) with a **different** fixed list (List B). This story's AC #3 defaults to
**fixed-list wins** — treating the card's configured routing as the stronger, deliberate
setting, and this entry point as only filling the *fallback* a review-routing card would
otherwise use. This is a reasonable default consistent with Story 4.3's intent ("imports
land where I expect" per the card's own config), but it does mean the entry point can be
a no-op for a fixed-list card pointed elsewhere — which may surprise a user who explicitly
pressed "Import statement to List A." If the product wants the explicit launch point to
win instead (i.e., override fixed-list routing for just this session), that is a larger
change (needs a real session-level override, since `sessionAutoRoute` currently has no
such concept) and should go back through `bmad-correct-course` rather than being decided
silently here.

### Accessibility (EXPERIENCE.md, finalized 2026-09-30)

- The control's accessible name must name the destination list and must not collide with
  the global Upload button's label — see `ux-designs/ux-finance-dashboard-2026-09-30/EXPERIENCE.md`,
  Accessibility Floor, final bullet.
- No new interaction pattern is introduced — reuses whatever existing button/link pattern
  the list detail page already uses for its other actions (`ListDetailMobileActions`,
  `mobileActions` in `page.tsx:718-783`).

### Project Structure Notes

- No new routes, no new backend service, no new DB fields are required under the
  recommended approach — this is a frontend-only story. Flag in review if an
  implementation detail forces a backend change; that would be a scope increase worth a
  second look rather than silently absorbing it.
- Touches: `ui/app/lists/[listId]/page.tsx` (new entry point), `ui/app/upload/page.tsx` /
  `UploadPanel.tsx` (read the bound list id), `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`
  (prefer bound id over `/api/auth/me`), `ui/lib/i18n/lists.ts` and/or `ui/lib/i18n/upload.ts`
  (new strings, EN+ES).
- Does not touch: `api/application/import_session.py`, `api/api/routes/import_sessions.py`,
  `SessionReviewPanel.tsx`'s fixed-list branch (read-only reference for AC #3's precedence
  check, not modified).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.17: Import statement directly into this list]
- [Source: _bmad-output/planning-artifacts/epics.md#FR-58]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-30.md]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-30/EXPERIENCE.md#Accessibility Floor]
- [Source: ui/app/upload/SessionReviewPanel.tsx:40-62,157-193 — sessionAutoRoute / fixed-list precedence]
- [Source: ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:424-438,455 — defaultListId from /api/auth/me]
- [Source: api/application/import_session.py:465-469 — UploadStatementPdfCommand has no list_id]
- [Source: api/domain/import_session.py:163 — select_landing_list_id is post-hoc, not a pre-bind]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Flagged open question (fixed-list vs. list-scoped import precedence) is a default, not
  a locked decision — confirm with product/UX if it matters before/while implementing;
  otherwise proceed with "fixed-list wins" as written in AC #3.

### File List
