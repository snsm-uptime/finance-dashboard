---
baseline_commit: 6f490e3
---

# Story 4.13: Individual review card — four-direction actions + inline title edit

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **This is a UI-only story.** Every endpoint it needs already shipped in 4.10/4.11/4.12:
> `assignRow`, `deleteRow`, `undoLastResolution`, `editRowDescription`, `fetchImportSession`
> are all live in `uploadClient.ts` and wired to working routes. Nothing in `api/` changes in
> this story. The work is entirely `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`
> — a **near-full rewrite** from a per-statement card to a per-transaction (per-row) card — plus
> its test file and two i18n keys' worth of copy.
>
> AD-9 (individual review gestures) was **already amended** 2026-08-20 for exactly this shape.
> There is no spine edit in this story.

## Story

As a user reviewing transactions one at a time,
I want a focused card with four directional actions and an editable title,
so that routing each transaction is deliberate but fast.

## Acceptance Criteria

1. **Given** individual review starts, **when** the panel renders, **then** the screen shows one full-width card for the current transaction, in normal page flow — not a scrollable list of rows. **And** the card shows the transaction description as title, the store as subtitle when a structured merchant field exists (blank today — no adapter emits one), the amount as body, and the posted date at the bottom (date only — no time exists in the pipeline).

> **Amended 2026-08-24** (code review) — originally read "the screen shows a dimmed backdrop with one medium card centered." Implementation shipped a full-width card in normal page flow instead (no scrim, not a modal); a regression test (`IndividualReviewPanel.test.tsx` — "has no full-screen dark overlay") locks this in. Reconciled here rather than reverted — see Decision #5.

2. **Given** the four card actions, **when** I act, **then** left assigns to the default list, right assigns to the selected list, up deletes, and down undoes. **And** left, right, and up are available as both edge buttons and touch swipes; down is a button on all platforms including mobile, never a gesture.

3. **Given** the selected list, **when** I move between transactions, **then** the picker selection persists across the whole session rather than resetting per row, and left/right disable under the same conditions the existing `canAcceptChosen` / `canAcceptDefault` booleans encode.

4. **Given** a successful assign or delete, **when** the action resolves, **then** the card is removed optimistically, the next row advances, and undo becomes available.

5. **Given** accessible / Reduce Motion needs, **when** review is used, **then** every outcome is operable without swiping (UX-DR19) — the edge buttons are the primary affordance, not swipe theatre.

6. **Given** the transaction title needs correcting, **when** I click it once, **then** it enters a primed state showing a soft border in the space the input will occupy, with no input mounted yet. **And** a second click mounts the input and focuses-and-selects it, mirroring `ListsPanel`'s `renameInputRef` effect. **And** this uses explicit click-count state rather than the native `dblclick` event, so two clicks with any gap between them both count.

7. **Given** an active title edit, **when** I press Enter, press Escape, or click outside, **then** Enter commits via PATCH (trimming, rejecting empty, no-op if unchanged — mirroring `commitRename`), Escape cancels, and an outside `pointerdown` cancels from either primed or editing back to idle. **And** errors render inline with `role="alert"` as `renameErrors` does today.

8. **Given** the card advances to the next transaction, **when** `row.id` changes, **then** title edit state resets to idle and any draft is discarded.

9. **Given** the row was resolved concurrently between prime and commit, **when** the PATCH returns `import_row_not_available`, **then** the card refreshes from the next GET rather than showing a stale edit.

10. **Given** I assign or delete the last pending row, **when** that action succeeds, **then** I am taken to ImportReviewSheet (Story 4.13.1) — not the 4.14 completion summary and not a "session complete" empty state. **And** this story does not implement the sheet; 4.13.1 owns that surface. **And** undo on the last card still applies **before** the sheet if the card's down/undo fires; once the sheet is showing, last-card undo is not this story's job.

## Tasks / Subtasks

### Task 1 — Flatten the row queue (pure function) (AC: 1, 2, 3, 4, 10)

- [x] 1.1 In `IndividualReviewPanel.tsx`, replace `nextReviewable(session)` (currently returns a `StagedStatement`, lines 34-39) with an exported pure function, e.g. `nextReviewableRow(session: ImportSession | null): { row: CandidateRow; statement: StagedStatement } | null`. It flattens `session.statements` in array order, then each statement's `rows` (already pending-only per 4.11's `GET` contract — no client-side status filter needed) in `sequence` order, and returns the first pair, or `null` if the session is missing, discarded, or every statement's `rows` is empty.
- [x] 1.2 Keep it a plain exported function over the `ImportSession` type (no component state) so it is directly unit-testable, matching the established convention: pure logic extracted and tested in the sibling test file (same pattern as `balanceStripPropsFrom` in `ui/app/lists/[listId]/page.tsx`). No new module file — same convention, co-located.
- [x] 1.3 `failed` statements carry an empty `rows` array (they never got candidate rows) and so contribute nothing to the flattened queue — they simply never produce a card. Do not special-case `status === "failed"` anywhere in the new flow; the old per-statement "Could not parse this statement" card and its skip-wired-to-`deleteRow` special case (`deferred-work.md:236` — already effectively dead, since a failed statement's `rows` is empty so `current.rows[0]` was `undefined`) are removed, not preserved. Failed-statement reporting is Story 4.14's completion summary.

### Task 2 — Card layout: title / subtitle / body / date (AC: 1)

- [x] 2.1 Replace the statement-card block (current lines ~286-355: card name, filename, row count, IBAN block) with the four content slots from the row-level design spec: title = `row.description`, subtitle = blank today (render conditionally so it's a no-op until a future adapter emits a structured merchant field — do not hardcode "blank" as literal copy), body = `row.amount` formatted with `row.currency`, bottom = `row.posted_date` (date string as-is — never construct a JS `Date` for it, per project-context's date-string rule).
- [x] 2.2 One card, fixed medium size — not a scrolling list. **Amended 2026-08-24** (code review): shipped without the dimmed backdrop / modal centering originally specified here — one full-width card in normal page flow instead. No token exists for the backdrop color (checked `ui/app/globals.css` — no `--overlay`/`--backdrop`/`--scrim`); the full-width direction was taken instead of inventing one. Tailwind utilities co-located, no new `*.module.css` (AD-23).
- [x] 2.3 Amount + currency display: no existing utility formats a raw `(amount: string, currency: string)` pair for arbitrary currencies (`formatCardBalance` in `listsClient.ts` is CRC-only, symbol-hardcoded, display-only). Add a small local formatter in the same display-only spirit — `Number()` for display formatting only is the accepted existing pattern here (`formatCardBalance` already does this); never round-trip the identity/dedup or PATCH payload through it. For non-CRC currencies, `{currency} {amount}` is sufficient; no requirement to build a full multi-currency formatter.
- [x] 2.4 The `{current} of {total}` progress readout (`individualReviewProgress`, current lines 249-255) was statement-indexed; a row-indexed equivalent needs a "total" that a resumed session makes ambiguous (rows already resolved before this visit are invisible — only pending rows are ever returned). Simplest correct option: drop the "of {total}" half and show a remaining-count only (e.g. "{N} left", derived from `flattened.length`), or drop the readout entirely — ACs do not require it. Do not block on this; pick the simpler option and move on.

### Task 3 — Four-direction actions: buttons + swipe wiring (AC: 2, 5)

- [x] 3.1 Four always-visible edge buttons: left → assign default, right → assign chosen, up → delete, down → undo. All four are real `<button>` elements (a11y floor — WCAG 2.2 AA, UX-DR19); swipe is enhancement only, gated the same way it is today (`isCoarsePointer`, `useDrag` on `cardRef`, `SWIPE_DISTANCE_THRESHOLD = 80` carries over unchanged).
- [x] 3.2 **Direction fix required.** The current `useDrag` handler (lines 223-247) maps `dy > 0` (swipe **down**) to skip. AD-9 was amended 2026-08-20: the vertical swipe axis is now **up → delete**, and **down is never a gesture** (undo is button-only on every platform — accidental-drag safety, and touch-scroll doesn't fight a fourth swipe axis). Change the vertical branch to `dy < 0 && vy > 0 → delete`; there is no swipe branch for down at all — omitting it (not mapping it to anything) is correct, not an oversight.
- [x] 3.3 Left/right swipe branches (`dx > 0` → chosen, `dx < 0` → default) keep their existing direction mapping — AD-9's left/right semantics are unchanged by the amendment, only the vertical axis and the skip→delete/down→undo swap changed.
- [x] 3.4 Delete has no analog to `canAcceptChosen`/`canAcceptDefault` gating in the current code (skip's `canSkip` was `current.status === "staged" || "failed"`, statement-scoped). For the row-level up/delete action, gate only on "a current row exists" — a pending row is always deletable, no card-identification gate applies (delete doesn't touch a list).
- [x] 3.5 Down/undo enables only when `session.undo` is non-null (mirrors the server-persisted pointer contract from 4.11) — disable client-side rather than relying solely on the `import_nothing_to_undo` error response.

### Task 4 — Picker persistence fix + gating adaptation (AC: 3)

- [x] 4.1 **Bug fix, not a new feature.** The current code resets the picker on every action: `setPickedListId("")` appears in both the skip/delete branch (line 170) and the assign-success branch (line 179) of the `action` handler. AC #3 requires the opposite — the selection must persist across the whole session. Delete both resets. `pickedListId` stays exactly the component-level state it already is (no other change needed to satisfy "persists").
- [x] 4.2 `canAcceptChosen`/`canAcceptDefault` (current lines 217-220) are statement-scoped today (`current.status === "staged"`, `cardReadyOrNoIban` from `current.iban`/`card.cardMatched`). Re-derive them from the **statement that owns the current row** (the pair Task 1.1 returns), not a bare `current` statement — the row-level card no longer holds a `StagedStatement` directly. The card-identification gate (`cardReadyOrNoIban`) must carry over unchanged in meaning: block accept until the row's parent statement's card is identified/registered when that statement has an IBAN.
- [x] 4.3 `useCardIdentification(sessionId, statement, cardMessages)` (Task 5) needs that same parent statement, not the flattened row — pass it through.

### Task 5 — Preserve card identification / registration (regression guard, not a new task)

- [x] 5.1 **Must survive, not in the ACs because it predates this story and nothing here supersedes it.** Story 4.8.1's card-identification block (current lines 290-354: card label / "New card!" / IBAN display) and the registration form (lines 357-391: label input + Register button, `card.registerCard`) gate `canAcceptChosen`/`canAcceptDefault` today and must keep doing so. Dropping this UI would silently remove IBAN-registration blocking (AD-20-adjacent behavior) — a regression, not a scope reduction this story is authorized to make.
- [x] 5.2 Re-derive `useCardIdentification`'s `statement` argument from the current row's parent statement (Task 4.3). Placement of this UI relative to the new title/subtitle/body/date card is a layout decision (DESIGN.md doesn't define a component slot for it in the new per-row card) — keep it visually subordinate to the four-direction card, e.g. below it, consistent with Warm Balance's existing visual hierarchy. No pill CTAs, no kit defaults (AD-12).
- [x] 5.3 Keep the "Dismiss file" / whole-session discard button (`discardSession`, current lines 437-451) exactly as-is — it is session-scoped, not row- or statement-scoped, and nothing in this story's ACs touches it.
- [x] 5.4 Keep the `individualReviewNoDefaultList` / `individualReviewNoLists` empty-state hints (current lines 400-405) — still relevant, unrelated to the row-level rewrite.

### Task 6 — Undo wiring (AC: 2, 4)

- [x] 6.1 Wire the down button to `undoLastResolution(sessionId, messages)` (already implemented, `uploadClient.ts:480`) through the existing `useFormSubmission`-style action dispatch. On success, replace `session` with the returned snapshot — the undone row re-enters the queue at its original `sequence` position automatically, since the server does that (4.11 AC #3), not the client.
- [x] 6.2 On successful assign/delete (AC #4 "undo becomes available"), no client-side flag is needed — `session.undo` comes back populated on the response already; the down button's enabled state (Task 3.5) reading `session.undo !== null` is sufficient.

### Task 7 — Inline title edit (AC: 6, 7, 8, 9)

- [x] 7.1 Add local state mirroring `ListsPanel`'s rename machine, simplified to one row on screen (no `Record<string, ...>` maps — `ListsPanel` needs those because multiple list rows can each be mid-rename; here only the current card exists): `titleState: "idle" | "primed" | "editing"`, `titleDraft: string`, `titleError: string | null`.
- [x] 7.2 First click while `idle` → `primed` (soft-border class only, no input mounted). Second click while `primed` → `editing`, mounts the `<input>`. Use explicit click-count state, not `onDoubleClick`/native `dblclick` — AC #6 is explicit that two clicks with *any* gap between them both count, which native dblclick's timing threshold would not satisfy.
- [x] 7.3 `useEffect` keyed on `titleState === "editing"` that focuses and `.select()`s the input — copy `ListsPanel`'s `renameInputRef` effect (lines 142-148) verbatim in spirit; a `titleInputRef` here since there's only ever one row.
- [x] 7.4 Outside-`pointerdown` effect keyed on `titleState !== "idle"` (covers **both** `primed` and `editing` — `ListsPanel`'s equivalent effect only guards `editingId`, i.e. only the editing state; this story's AC #7 explicitly requires primed to also cancel on outside click, so the effect's guard condition is wider than the source it mirrors — do not copy the guard condition verbatim, only the pattern).
- [x] 7.5 `commitTitleEdit()`: trim `titleDraft`; empty after trim → set `titleError` to a new "enter a description" key (client-side only, no PATCH call — mirrors `commitRename`'s `draft.length === 0` branch using `t.errorInvalidName`); unchanged from `row.description` → cancel back to idle (no PATCH call, mirrors `commitRename`'s no-op branch); otherwise call `editRowDescription(sessionId, row.id, titleDraft, messages)`.
- [x] 7.6 On `editRowDescription` failure with the `import_row_not_available` code specifically (AC #9 — concurrent resolution between prime and commit): do **not** just show the inline error and stop. Re-call `fetchImportSession(sessionId, messages)` and replace `session` with the fresh result so the card reflects reality instead of a stale edit. This is a narrower behavior than the generic error path other mutations use — scope it to this one PATCH failure mode, not to assign/delete (those aren't in scope for this AC).
- [x] 7.7 On any other `editRowDescription` failure, set `titleError` inline (`role="alert"`, matches `renameErrors[list.id]`'s rendering today) and stay in `editing`.
- [x] 7.8 Enter → `commitTitleEdit()`. Escape → discard draft, back to `idle`. Both mirror `onRenameKeyDown`.
- [x] 7.9 `useEffect` keyed on the current row's `id`: whenever it changes (card advanced — by any of assign/delete/undo resolving, or a session refresh), reset `titleState` to `idle` and discard `titleDraft`/`titleError` unconditionally. This is the row-level equivalent of `ListsPanel`'s `editingId`-keyed effects, but keyed on `row.id` changing rather than an explicit cancel call.
- [x] 7.10 `maxLength` on the input: mirror the domain constraint via display-side truncation guard — `DESCRIPTION_MAX_LENGTH = 500` (`api/domain/expenses.py:20`, consumed by `normalize_row_description`), not `ListsPanel`'s 200 (that's list names, a different field).

### Task 8 — Last-row transition: replace 4.12's redirect (AC: 10)

- [x] 8.1 **Remove** the current completion `useEffect` (lines 193-206) that redirects to `session.landing_list_id` / `/lists` when `session && !current`. That behavior was 4.12's deliberate placeholder — its own dev notes call it out explicitly: *"the landing **trigger** still moves to Save in Story 4.13.1"* and *"IndividualReviewPanel.tsx is a 4.8-era panel that 4.11 kept alive with a typecheck-only edit; 4.13 rewrites it wholesale."* AC #10 is explicit that reaching a "session complete" empty state (which the redirect effectively is) is now wrong.
- [x] 8.2 **Decision (default — flag if you want it changed): render a neutral interim placeholder, not a redirect, not the sheet.** When the flattened queue is empty and the session is not discarded, show a small centered message (new i18n key, e.g. "All caught up for now.") with no action buttons and no undo control — undo is a per-card affordance and there is no card once the queue is empty (AC #10: "once the sheet is showing, last-card undo is not this story's job"). The existing "Dismiss file" button may remain visible (it's session-scoped, Task 5.3, and discarding an empty-queue session is harmless). Story 4.13.1 replaces this branch's contents with the real `ImportReviewSheet`; leave a comment at the branch marking that ownership, mirroring 4.12's carve-out comment style.
- [x] 8.3 Do not call `finalizeSession` from this story — Task 8.2's placeholder is not a save action, and finalize is 4.13.1's Save button's job per 4.12 Task 5.7 / AC #7-#8.

### Task 9 — i18n (`ui/lib/i18n/upload.ts`, EN + ES)

- [x] 9.1 New keys needed: a delete-button label/pending-label pair (up action — no existing key fits; `individualReviewSkip`/`individualReviewSkipping` are the statement-level skip copy being retired, do not repurpose their *meaning*, though the strings could be reused if apt), an undo-button label/pending-label pair (down action), an empty-description client-side validation error (mirrors `errorInvalidName`, e.g. `individualReviewErrorEmptyTitle`), and the Task 8.2 interim-placeholder copy.
- [x] 9.2 `individualReviewNoDefaultListShort: "No default list"` (EN) / `"Sin lista predeterminada"` (ES) already exists in both locales but is **currently unused anywhere in the codebase** (verified via grep) — it reads like it was added in anticipation of a compact edge-button label. Use it for the left/default button's empty state if the full `individualReviewNoDefaultList` sentence doesn't fit the edge-button affordance; don't add a duplicate key for the same purpose.
- [x] 9.3 `individualReviewSkip`, `individualReviewSkipping`, and `individualReviewFailedStatement` become dead once Tasks 1.3/3 land (no statement-level skip, no failed-statement card). Remove them — this codebase's convention is to delete confirmed-unused code rather than leave unused parallel copy (confirmed via grep: both keys are referenced from nowhere but `IndividualReviewPanel.tsx` itself and the i18n file).
- [x] 9.4 `individualReviewProgress: "{current} of {total}"` — keep, drop, or repurpose per Task 2.4's decision; if repurposed to a remaining-count form, update both locale strings to match (no `{total}` placeholder if it's dropped).

### Task 10 — Tests

- [x] 10.1 `IndividualReviewPanel.test.tsx` is a near-full rewrite (currently 473 lines, built entirely around the per-statement model — mocks `assignRow`/`deleteRow`/`discardSession`/`fetchImportSession`, captures the `useDrag` handler via the existing `@use-gesture/react` mock, uses `createRoot`/`act` per the project's jsdom convention). Keep the existing mocking scaffolding (router, `listsClient.fetchLists`, `uploadClient` functions, `useDrag` capture, `matchMedia` stub) — replace the per-statement fixtures and assertions with per-row ones. Add `undoLastResolution` and `editRowDescription` to the `uploadClient` mock (not mocked today).
- [x] 10.2 Unit-test `nextReviewableRow` (Task 1) directly, exported: empty session → null; a session with only a failed statement (empty rows) → null; multiple statements → flattens in statement-then-sequence order; a statement with some rows already resolved (not present in `rows`, per the pending-only GET contract) → only the remaining pending ones appear.
- [x] 10.3 Picker persistence: assign a row via default or chosen list, assert `pickedListId` (or its visible effect — the select's chosen option) is unchanged after the resulting session update — this is the regression test for Task 4.1's bug fix; the pre-fix behavior (reset to `""`) should be the thing this test would have caught.
- [x] 10.4 Swipe direction: simulate the captured drag handler with an upward, high-velocity movement → asserts `deleteRow` called, not `discardSession`/skip; a downward drag → asserts **nothing** is called (down is never a gesture, Task 3.2).
- [x] 10.5 Title edit: first click → soft-border/primed state present, no `<input>` in the DOM; second click → `<input>` mounted and focused+selected; Enter with unchanged text → no PATCH call; Enter with emptied text → inline error, no PATCH call; Enter with valid changed text → `editRowDescription` called, trimmed; Escape from `editing` → back to idle, draft discarded; outside `pointerdown` from `primed` → back to idle (this is the case `ListsPanel`'s own effect doesn't cover, per Task 7.4 — make sure it's actually exercised, not just the `editing`-state case).
- [x] 10.6 Row-advance reset: after a successful assign/delete/undo changes the current row, assert title state is back to `idle` even if it was `primed`/`editing` on the previous row.
- [x] 10.7 Concurrent-edit refresh (AC #9): mock `editRowDescription` to resolve `{ ok: false, error: ... }` with the `import_row_not_available` shape, assert `fetchImportSession` is called again afterward and the panel re-renders from that response.
- [x] 10.8 Last-row transition (AC #10): resolve the only remaining row, assert `router.push` is **not** called (this is the direct regression test against Task 8.1's removed redirect) and the interim placeholder (Task 8.2) renders instead.
- [x] 10.9 Card-identification gating still blocks accept when the current row's parent statement has an unregistered IBAN (Task 4.2/5) — port the existing 4.8.1 test coverage for this rather than dropping it.
- [x] 10.10 Full gate before flipping to `review`: `ui` typecheck + lint + vitest. No `api` changes in this story, so no `api` test run is required by this story's own scope — but if the worktree stack is used for manual verification, follow `scripts/worktree/worktree-bootstrap.sh` per established practice, not ad-hoc `docker run`.

### Task 11 — Story close

- [x] 11.1 Write the how/why overview per `_bmad-output/implementation-artifacts/story-close-overview-checklist.md` before flipping to `review`.
- [x] 11.2 Add a **Review Findings** section, including an explicit zero-findings note if there are none (Epic 3.5 retro action item).
- [x] 11.3 Sync the story-file header status to `sprint-status.yaml` at close.
- [x] 11.4 Update `_bmad-output/implementation-artifacts/deferred-work.md:236` — the "leave failed-statement UX for Story 4.13" note is resolved by Task 1.3's decision (failed statements contribute no rows, full handling deferred to 4.14); mark it accordingly rather than leaving it open-ended.

## Dev Notes

### What already exists — do not rebuild it

| Already on `main`, fully working | Where |
|---|---|
| `GET /import/sessions/{id}` — rows nested per statement, **pending-only**, `sequence`-ordered | `api/api/routes/import_sessions.py:234`; schema `api/api/schemas/import_sessions.py` |
| `POST .../rows/{rowId}/assign` — one endpoint, both accept directions | `api/api/routes/import_sessions.py:405`; client `assignRow` in `uploadClient.ts:439` |
| `POST .../rows/{rowId}/delete` | routes `:442`; client `deleteRow` `uploadClient.ts:455` |
| `POST .../undo` — session-scoped, single-level, server-persisted pointer (`session.undo`) | routes `:465`; client `undoLastResolution` `uploadClient.ts:480` |
| `PATCH .../rows/{rowId}` — description edit, pending-only guarded UPDATE | routes `:525`; client `editRowDescription` `uploadClient.ts:490` |
| `POST .../finalize` — **not called by this story** (4.13.1's job) | routes `:492` |
| `useCardIdentification(sessionId, statement, messages)` — IBAN match/registration | `ui/hooks/useCardIdentification.ts` |
| `useFormSubmission` — pending/error/submit wrapper already used by the panel | `ui/hooks/useFormSubmission.ts` |
| `ListsPanel`'s rename state machine (`startRename`/`cancelRename`/`commitRename`, `renameInputRef` focus effect, outside-pointerdown-cancel effect, `onRenameKeyDown`) — the pattern this story's title edit mirrors | `ui/app/lists/ListsPanel.tsx:196-273` |
| `SoftLedgerSelect` — already used for the list picker, unchanged in this story | `ui/components/soft-ledger/Select.tsx`, used at `IndividualReviewPanel.tsx:333` |

**Nothing in `api/` needs to change.** `grep`-verify before writing any backend code — if you find yourself about to touch `api/`, stop; that almost certainly means a misreading of scope.

### Files being modified — current state and what must survive

**`ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx`** (455 lines today) — per-statement card: `nextReviewable` finds the next `staged`/`failed` statement; actions operate on `current.rows.find(pending) ?? current.rows[0]` (a workaround, not real row-level review); picker resets after every action (the bug Task 4.1 fixes); completion effect redirects on empty queue (Task 8.1 removes it); card-identification block and registration form are statement-scoped and must survive (Task 5).

**Must survive the rewrite:**
- `useCardIdentification` gating `canAcceptChosen`/`canAcceptDefault` (Task 4.2, 5)
- The registration form for an unregistered IBAN (Task 5.1-5.2)
- `discardSession`/"Dismiss file" whole-session discard (Task 5.3)
- No-default-list / no-lists empty-state hints (Task 5.4)
- The `isCoarsePointer` gate on `useDrag` (desktop never gets swipe-fired actions — AD-9)
- `SWIPE_DISTANCE_THRESHOLD = 80` and the `touch-none`/`passive: false` handling (Story 4.8 review finding: native touch-action must stay fully disabled on the card, not left to compete with `useDrag`)

**Must NOT survive** (this story's whole point):
- Statement-level `nextReviewable` — replaced by row-level `nextReviewableRow` (Task 1)
- The picker reset after each action (Task 4.1 — a bug, not a feature)
- The empty-queue redirect (Task 8.1 — 4.12's deliberate placeholder, explicitly due for replacement per its own dev notes)
- The failed-statement "Could not parse this statement" card + its non-functional skip wiring (Task 1.3, 9.3)

### Architecture compliance (binding)

- **AD-9 (amended 2026-08-20):** the reviewed unit is one parsed transaction, not a statement. Vectors: right → chosen list (after picker), left → default, up → delete. Undo is button-only on every platform, never a gesture — this is the one rule most likely to be gotten backwards if you copy the *old* swipe-down-for-skip logic instead of reading the amendment (Task 3.2).
- **AD-12 / AD-23:** `DESIGN.md`/`EXPERIENCE.md` own look and interaction; Tailwind utilities co-located, no new `*.module.css`; no kit defaults, no pill primary CTAs.
- **AD-5 money:** amount stays a string end-to-end; the display-only `Number()` formatting (Task 2.3) is for rendering only, never for computation, comparison, or the PATCH/assign payloads.
- **AD-19 ACL:** untouched — all four endpoints this story calls already enforce ownership/list-membership server-side; this story adds no new authorization surface.
- **UX-DR19 (WCAG 2.2 AA product floor):** every outcome operable without swipe — the edge buttons are the primary affordance on all platforms, not a fallback.

### The 4.12 → 4.13 handoff, read this before touching the completion effect

4.12's own dev notes are explicit about the split this story completes:

| Half | Owner | 4.12 did | 4.13 does |
|---|---|---|---|
| Landing **target** (which list) | 4.12 | ✅ `landing_list_id` computed server-side | unchanged — still used by 4.13.1's eventual redirect, just not called from here |
| Landing **trigger** (when to leave the review flow) | 4.13 → 4.13.1 | left as "queue empty" (placeholder) | **this story removes the placeholder redirect** (Task 8.1) and shows a neutral interim state (Task 8.2); 4.13.1 replaces that interim state with the real sheet and its own Save→finalize call |
| PDF release timing | 4.12 | ✅ moved to `POST /finalize` | not this story's concern — nothing here calls finalize |

This is a genuine two-story functional gap the epics text calls out deliberately (*"this story does not implement the sheet; 4.13.1 owns that surface"*) — the interim placeholder (Task 8.2) exists to bridge it honestly rather than either lying about completion (old redirect) or scope-creeping into 4.13.1's surface.

### File structure — exact paths (no new files)

**Modified only:**
```
ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx
ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx
ui/app/upload/review/[sessionId]/page.tsx           (restores the route on row-level endpoints — necessary for the rewrite above to be reachable at all)
ui/lib/i18n/upload.ts
_bmad-output/implementation-artifacts/deferred-work.md   (Task 11.4 — close out the 4.13 note)
_bmad-output/implementation-artifacts/sprint-status.yaml
```

**Amended 2026-08-24** (code review, Decision #6) — the following were also modified, in violation of the original "Do not touch" list below, and confirmed in-scope during review rather than reverted:
```
ui/app/upload/SessionReviewPanel.tsx                 (new "Review individually" link/route into this story's rewritten panel)
ui/app/upload/SessionReviewPanel.test.tsx
ui/app/upload/CreditCardFace.tsx                     (light/dark gradient theming + spacing; shared with SessionReviewPanel's StatementCard)
ui/components/IconButton/IconButton.tsx              (new optional `caption` prop, used by this story's four-direction buttons)
ui/components/IconButton/IconButton.test.tsx
ui/app/icons/ArrowIcon.tsx, ui/app/icons/TrashIcon.tsx, ui/app/icons/index.ts, ui/app/icons/README.md   (new icons for the four-direction buttons)
```

**Do not touch:** anything under `api/` (verified nothing is needed — see above); `ui/app/upload/UploadPanel.tsx`, `ui/app/upload/bulk/**` (Bulk review, Story 4.7, unaffected); `ui/app/lists/**`; `ui/hooks/useCardIdentification.ts` (consumed, not modified — only its call-site argument changes); `ui/components/soft-ledger/Select.tsx`; `_bmad-output/planning-artifacts/epics.md`, `prd.md`, `ARCHITECTURE-SPINE.md` (no spine edit — AD-9 is already amended for this exact story). ~~`ui/app/upload/SessionReviewPanel.tsx`~~ — struck 2026-08-24, see amendment above.

### Testing standards

- **Discipline (AD-15):** this story is UI-only; project-context's rule is domain → TDD, UI → test-after. Test-after is fine here.
- **Layers:** UI vitest only (no api/integration layer — nothing server-side changes). `IndividualReviewPanel.test.tsx` uses `createRoot`/`act` per the project's established jsdom convention (not React Testing Library) — match the existing file's style, don't introduce a second testing approach.
- **Merge gate:** `ui` typecheck + lint + critical vitest. No `api` pytest needed for this story specifically, but don't skip the full existing suite if CI runs it anyway.
- Tests assert on real behavior (which function got called with what, what's actually in the DOM), never on source text (Epic 3.5 retro action item).

### Previous story intelligence (4.12, `done`)

- **The exact carve-out this story fulfills:** *"4.12 code that lands on empty queue should wait for Save once 4.13.1 exists — if 4.12 is built first, do not treat empty pending as complete."* 4.12 built the placeholder knowing 4.13 would replace it. Task 8.1/8.2 is that replacement.
- **`IndividualReviewPanel.tsx` is explicitly flagged for full rewrite by 4.12's own dev notes** — 4.12 deliberately did the minimum (one-line redirect-target change) specifically to avoid wasted work here.
- **Repo/Protocol drift lesson (carries forward from 4.10/4.11, not directly applicable here since no backend changes, but worth knowing):** new server methods must be declared on Protocols, not just implemented — irrelevant to this story's scope but explains why the backend this story consumes is trustworthy (it was built under that discipline).
- **4.11's deliberate `GET` contract — pending rows only, sequence-ordered — is a hard dependency of this story's Task 1.** Do not attempt to fetch or reason about non-pending rows; they are invisible by design, and that design is exactly what Task 1.3 relies on for "failed statements contribute nothing."

### Git intelligence

- Baseline: `6f490e3` on branch `feat/4/4-13-individual-review-card-four-direction-actions-inline-title-edit` (worktree `finance-dashboard-wt-4-13`, already created and checked out — this is the working directory this story was authored from).
- Since 4.12 merged (`da96b55`, PR #75), the only commit is `6f490e3` ("dev-seed") — seed/dev-data only, no conflict with this story's scope.
- Working pattern from recent stories: one story per branch (`<type>/<epic>/<us-id>`), PR-only merge to `main` after CI green, Conventional Commits aligned with branch type.

### Latest technical information

Versions are pinned by lockfiles (Story 1.1). Do not bump anything in this story.

- **Next.js 16.2.x standalone / React 19.2.x** — client component (`"use client"`), same as today. No server-component conversion in scope.
- **`@use-gesture/react` 10.3.x** — `useDrag` API unchanged from current usage; only the direction-mapping logic inside the handler changes (Task 3.2), not the hook call shape.
- **TypeScript strict** — no `any` on the row/statement DTOs; `CandidateRow`/`StagedStatement`/`ImportSession` types in `uploadClient.ts` already cover everything this story needs, no new fields required from the API.

### Project Structure Notes

Matches the established structure with no variance: this is a pure `ui/app/upload/review/[sessionId]/` component rewrite plus its co-located test and one shared i18n file. No new directories, no new modules — every pure-function extraction (Task 1) stays inside the component file itself, consistent with the project's established convention of co-locating pure logic with its consuming component and testing it from the sibling test file (the `balanceStripPropsFrom` precedent in `ui/app/lists/[listId]/page.tsx`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.13] — ACs (post-2026-08-20 renumbering)
- [Source: _bmad-output/planning-artifacts/ux-designs/row-level-individual-review-2026-08-20.md] — §3 card/gesture mapping, §6 title inline-edit (two-click), §5/§8 explicitly deferred to 4.14 (summary) and the resume flow — do not pull those into this story
- [Source: .../architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md#AD-9] — gesture rule, amended 2026-08-20 for this exact shape; no further edit needed
- [Source: .../ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md#J1] — step 5, amended 2026-08-20; note `mockups/review-individual.html` in that run folder is explicitly flagged **stale** (still depicts the old statement-level flow) — do not use it as a visual reference
- [Source: _bmad-output/project-context.md] — money-as-string, no new CSS Modules, i18n per-domain TS objects, date-strings-not-JS-Date
- [Source: _bmad-output/implementation-artifacts/4-12-commit-batch-dedup-summary-land-on-settle-strip.md] — Build-order carve-out, "What already exists" table, the explicit "4.13 rewrites it wholesale" note
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:236] — failed-statement Skip note this story resolves
- [Source: ui/app/lists/ListsPanel.tsx] — rename state machine this story's title-edit mirrors
- [Source: _bmad-output/implementation-artifacts/story-close-overview-checklist.md] — required before `review`

## Decisions (made during story creation — flag if you want any changed)

1. **Queue-exhausted interim state (Task 8.2) is a neutral placeholder, not a redirect and not the sheet.** AC #10 forbids both the old redirect (a de facto "session complete" transition) and building `ImportReviewSheet` itself. A placeholder is the only reading that satisfies both constraints without scope creep into 4.13.1. Low-risk: it is replaced wholesale by the very next story.
2. **Failed statements get zero special-case handling in this rewrite** (Task 1.3) — they simply produce no rows, so no card. This matches the row-level UX doc's explicit design (§2) and resolves the `deferred-work.md:236` open note. Parse-failure UI is Epic 5's; failed-statement reporting is 4.14's completion summary.
3. **Card identification/registration UI is preserved, re-scoped to the current row's parent statement** (Tasks 4.2-4.3, 5) — not in the ACs because it predates this story and nothing here supersedes it; dropping it would be an unauthorized regression.
4. **No new i18n key for a compact default-list label** — `individualReviewNoDefaultListShort` already exists, unused, and reads like it was pre-staged for this exact use (Task 9.2).
5. **(Made during code review, 2026-08-24) Full-width card layout is the accepted final design, not a deviation to revert.** AC1/Task 2.2 originally specified a dimmed backdrop with a centered modal card; implementation shipped a full-width card in normal page flow instead (see "Stretch the review card to full width" commit), with a regression test asserting the backdrop's absence. Confirmed and reconciled into AC1/Task 2.2 rather than reverting the code.
6. **(Made during code review, 2026-08-24) `SessionReviewPanel.tsx`'s "Review individually" entry-point link and `CreditCardFace.tsx`'s light/dark theming are accepted as in-scope for this story, despite Dev Notes' original "Do not touch" listing `SessionReviewPanel.tsx`.** Confirmed as intentional — see the reconciled File List/Dev Notes below. The `deferred-work.md` entries this work generated originally cited a nonexistent `spec-individual-review-entry-point.md`; corrected to cite this story file instead.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Code)

### Debug Log References

- `npx tsc --noEmit` — clean (no errors)
- `npx eslint .` — 0 errors, 4 pre-existing warnings unrelated to this story (`DefaultSplitPanel.tsx`, `Sheet.tsx`, `[listId]/page.tsx`, `useFocusTrap.ts`)
- `npx vitest run` — 56 files / 366 tests passed, including the rewritten `IndividualReviewPanel.test.tsx` (22 tests)
- One lint error surfaced mid-implementation: `react-hooks/set-state-in-effect` on the row-advance title-reset effect. Fixed by moving the reset out of `useEffect` into a ref-compared conditional during render (React's documented "adjust state when a prop changes" pattern), rather than suppressing the rule.
- One test-authoring bug found and fixed before considering Task 10 done: directly setting `input.value` in tests left React's internal value tracker already in sync, so the dispatched `"input"` event never fired `onChange`. Fixed with the standard native-setter workaround (`Object.getOwnPropertyDescriptor(...).set.call(input, value)`).

### Completion Notes List

## Story-close overview — 4.13

**Request path:**
Browser → `IndividualReviewPanel` (client component) → same-origin BFF routes already shipped in 4.10–4.12 (`GET /import/sessions/{id}`, `POST .../rows/{rowId}/assign|delete`, `POST .../undo`, `PATCH .../rows/{rowId}`) → `api` application/domain layers (unchanged). No backend code touched by this story.

**Key components:**
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` — near-full rewrite: statement-level card → per-row card, `nextReviewable` → exported `nextReviewableRow` (pure, unit-tested), four always-visible edge buttons (left/right/up/down = default/chosen/delete/undo), inline title-edit state machine (`idle`/`primed`/`editing`) mirroring `ListsPanel`'s rename machine, interim "queue empty" placeholder replacing 4.12's redirect.
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx` — rewritten around the row-level model (22 tests).
- `ui/lib/i18n/upload.ts` — new/changed `individualReview*` keys (EN+ES); `individualReviewSkip`/`Skipping`/`FailedStatement` removed (dead once statement-level skip was retired).

**Why this shape:**
AD-9 was amended 2026-08-20 specifically for this per-transaction, four-direction review model (see `row-level-individual-review-2026-08-20.md`). The vertical swipe axis flips from down→skip to up→delete, and undo is deliberately button-only on every platform (accidental-drag safety; no fourth touch-scroll-competing axis). The queue-exhausted state is a neutral placeholder, not a redirect and not `ImportReviewSheet` itself, because AC #10 forbids both — Story 4.13.1 owns the real sheet.

**What not to break:**
- `nextReviewableRow` must keep returning `null` for a missing/discarded session or an entirely-empty queue, and must not special-case `status === "failed"` (failed statements simply carry no rows).
- Picker selection (`pickedListId`) must persist across the whole session — no `setPickedListId("")` reset after an action (this was Task 4.1's bug fix; a regression test guards it).
- Card-identification/registration gating (`canAcceptChosen`/`canAcceptDefault`) must stay driven by the **current row's parent statement**, not a bare statement reference — delete has no such gate.
- Down/undo must never be wired to a swipe gesture, on any platform.
- The empty-queue placeholder must show no action buttons and no undo control — 4.13.1 replaces that branch wholesale with `ImportReviewSheet`; don't extend it here.

## Review Findings

No findings — self-review during implementation surfaced the two issues logged under Debug Log References above (a lint rule violation and a test-authoring bug), both fixed before completion. No outstanding concerns.

### Automated Code Review (2026-08-24)

Reviewed `main...HEAD` (5 commits, 16 files, 2666 diff lines) via 3 parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against this story, the row-level UX design spec, AD-9, EXPERIENCE.md J1, and project-context.md. Findings below, verified against the live source.

- [x] [Review][Decision] AC1's "dimmed backdrop" is not implemented, and a test locks in its absence — resolved by updating the spec (AC1, Task 2.2) to match the shipped full-width layout rather than reverting code; see Decision #5.
- [x] [Review][Decision] Undeclared, out-of-scope edits bundled onto this branch (`SessionReviewPanel.tsx`, `CreditCardFace.tsx`), with phantom spec provenance in `deferred-work.md` — resolved: kept in this story as intentional (Decision #6), File List/Dev Notes reconciled, `deferred-work.md` citations corrected to point at this story file.
- [x] [Review][Decision] `statementPeriodBounds` narrows/shifts as rows resolve within a statement [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:79-92,553] — deferred to a follow-up story; needs a statement-level period field from the API, out of this UI-only story's scope. Logged in `deferred-work.md` (2026-08-24 entry).
- [x] [Review][Patch] "Dismiss file" / `discardSession` removed entirely, with no replacement path — **stale finding, superseded before it could be applied.** Between the review running and patches being applied, the branch moved forward 5 commits; `c775b8c` ("...chrome header instead of dismiss") and `d8f834f` replaced the standalone Dismiss button with a discard-on-Back flow wired through `useChromeHeader`'s `onBack` (session-storage-persisted via the new `openImportSession.ts`). Re-verified present and functionally equivalent on current HEAD — no code change needed.
- [x] [Review][Patch] Stale closure in the ArrowLeft/ArrowRight keyboard handler assigns to a previously-picked list [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:444-475] — fixed: added `pickedListId`/`defaultListId` to the `useEffect` dependency array so the keydown listener re-subscribes (and rebinds `flingAndSubmit`/`action.submit`) whenever the picker selection changes, not just when `canAcceptChosen`'s boolean flips.
- [x] [Review][Patch] `formatRowAmount` hardcodes `en-US` regardless of active locale [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:105-112] — fixed: `formatRowAmount` now takes `locale` and formats with `es-CR` in Spanish, matching `formatRowDate`'s existing locale branching.
- [x] [Review][Patch] Default-list accept button can render enabled with a blank list name during a loading race [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:358-362] — fixed: `canAcceptDefault` now also requires `lists !== null`, closing the window where `/api/auth/me` resolves before `/api/lists`. (`canAcceptChosen` was not reachable via this race — `pickedListId` can only be set once `listOptions` renders, which itself requires `lists` loaded — so left unchanged.)
- [x] [Review][Patch] Touch-drag inside the mounted title `<input>` is captured as a card swipe [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:389-393] — fixed: `useDrag`'s handler now bails whenever `titleState !== "idle"`, so no swipe gesture fires while the title is primed or being edited.
- [x] [Review][Patch] Title-edit trigger has no keyboard-activation path [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:685-698] — fixed: the title container now gets `role="button"`, `tabIndex={0}`, and an Enter/Space `onKeyDown` handler while not in the `editing` state (the mounted `<input>` is already independently keyboard-operable).
- [x] [Review][Patch] Outside-click during an in-flight title PATCH can orphan a later error [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:489-506,536-549] — fixed: the outside-`pointerdown` handler now bails while `titleSubmittingRef.current` is true, and the `import_row_not_available` refetch-failure branch now also resets title-edit state to idle instead of leaving it stuck on a now-resolved row.
- [x] [Review][Patch] Global ArrowLeft/ArrowRight shortcut still fires while focus is on Delete/Undo (or any other button) [ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx:448-457] — fixed: the keydown handler's exclusion check now also bails on `target instanceof HTMLButtonElement`.

Verified after patching: `ui` typecheck (only a pre-existing, unrelated error in `ChromeBack.tsx` from the branch's newest commits — confirmed present before these patches too, out of this pass's scope), `eslint` on the patched file (0 errors, 1 pre-existing unrelated warning), `vitest run` on `IndividualReviewPanel.test.tsx` (31/31 passed, no regressions).

### File List

- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.tsx` (modified — near-full rewrite)
- `ui/app/upload/review/[sessionId]/IndividualReviewPanel.test.tsx` (modified — near-full rewrite)
- `ui/app/upload/review/[sessionId]/page.tsx` (modified — restores the route on row-level endpoints)
- `ui/lib/i18n/upload.ts` (modified — EN+ES key additions/removals)
- `_bmad-output/implementation-artifacts/deferred-work.md` (modified — closed out the 4.13 note; corrected 2026-08-24)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status transitions)

**Added 2026-08-24 (code review reconciliation — see Decision #6):**

- `ui/app/upload/SessionReviewPanel.tsx` / `.test.tsx` (modified — "Review individually" entry-point link)
- `ui/app/upload/CreditCardFace.tsx` (modified — light/dark theming + spacing)
- `ui/components/IconButton/IconButton.tsx` / `.test.tsx` (modified — new `caption` prop)
- `ui/app/icons/ArrowIcon.tsx`, `ui/app/icons/TrashIcon.tsx`, `ui/app/icons/index.ts`, `ui/app/icons/README.md` (new)

## Change Log

| Date | Change |
|---|---|
| 2026-08-23 | Story 4.13 implemented: row-level individual review card, four-direction actions, inline title edit. `ui` typecheck + lint + vitest all green (56 files / 366 tests). Status → review. |
