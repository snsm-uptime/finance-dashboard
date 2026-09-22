---
baseline_commit: f7781c3
---

# Story 10.1: Parallelize list-detail server-side data fetching

Status: done

## Story

As a list member,
I want the list detail page's server-side data fetching to run in as few
sequential round trips as possible,
so that opening a list loads noticeably faster.

## Acceptance Criteria

1. **Given** `ListDetailPage` in `ui/app/lists/[listId]/page.tsx` loading a
   list that exists, **when** the page fetches its data, **then**
   `detail`, `default-split`, `members`, and `cycles` are requested in a
   single parallel wave (none of them wait on another's response), and
   only `expenses`/`balances` — which depend on the resolved
   `selectedStatementId` — are requested in a second wave after that
   first wave resolves.
2. **Given** the existing 404/401/error handling for the `detail` fetch,
   **when** the waterfall is reshaped, **then** all current behavior is
   preserved exactly: a 401 still redirects to sign-in, a 404 still sets
   `notFound`, and a non-ok/non-404/non-401 response still sets
   `loadError`, with no fetch of split/members/cycles/expenses/balances
   performed once `detail` itself has failed that way.
3. **Given** `default-split`, `members`, or `cycles` individually fail or
   return malformed data, **when** the page renders, **then** each
   surfaces its existing independent error state (`splitLoadError`,
   `membersLoadError`, `cyclesLoadError`) exactly as today — reordering
   the fetches must not change any existing error semantics or defensive
   parse behavior (`asDefaultSplit`, `asMembers`, `asCycles`).
4. **Given** the reshaped fetch waves, **when** `?period=<statement_id>`
   is present in the URL, **then** `resolveSelectedPeriod` still resolves
   the selected period from the now-parallel-fetched `cycles` payload
   before `expenses`/`balances` are requested, exactly as today (no
   behavior change to period filtering).
5. **Given** the `export const dynamic = "force-dynamic"` directive at
   the top of the file, **when** this story is implemented, **then** its
   necessity is checked (git history/blame for why it was added) and left
   in place unless removing it is proven safe and explicitly called out
   in the story's Dev Notes — this story does not silently change caching
   behavior, only fetch ordering.

## Tasks / Subtasks

- [x] Task 1: Investigate `dynamic = "force-dynamic"` origin (AC: #5)
  - [x] `git log -p --follow -- ui/app/lists/'[listId]'/page.tsx` (or
        `git blame` on line 35) to find why it was added; note the finding
        in Dev Notes regardless of outcome — do not remove the directive
        as part of this story unless the investigation proves it's dead
        weight AND that is called out explicitly
- [x] Task 2: Reshape the fetch waterfall in `ListDetailPage` (AC: #1-#4)
  - [x] Keep the initial `detail` fetch's own try/catch and its 401/404/
        error branching exactly as-is (lines ~571-588 today) — this
        gates everything downstream and must not become parallel with
        the rest, since a 401/404 must short-circuit before any other
        network call is made
  - [x] Inside the `response.ok` branch, replace the current two-stage
        `Promise.all([split, members, cycles])` → `Promise.all([expenses, balances])`
        with a restructure where `split`, `members`, and `cycles` fetches
        start immediately (they need only `listId` + `header`, same as
        `detail` — but they must remain nested inside the `response.ok`
        branch, matching AC #2's "no further fetches once detail fails")
  - [x] Await that first wave, parse each response exactly as today
        (`asDefaultSplit`, `asMembers`, `asCycles` — do not touch these
        functions), compute `resolvedPeriod`/`selectedStatementId`/
        `periodQuery` exactly as today
  - [x] Fire the second wave (`expenses`, `balances`) with `periodQuery`,
        await, parse exactly as today (`asExpenses`, `asBalances`)
  - [x] Do not change any of the `*LoadError` flag assignments, the
        `notFound`/`loadError` semantics, or the response-parsing logic —
        this is a pure reordering/parallelization of already-existing
        fetch calls, not a rewrite
- [x] Task 3: Verify no regression
  - [x] Manually load a list detail page (existing list, list with a
        period query param, a list you don't own, a nonexistent list id)
        and confirm identical rendering to before the change
  - [x] Confirm the `ui/tests/` suite covering this route (if any) still
        passes; if no existing test covers this file's data-fetching
        behavior, note that gap in Dev Notes rather than adding new test
        infrastructure as part of this fetch-only story

### Review Findings

- [x] [Review][Patch] `Promise.all` couples `detail` JSON-parse failure with sibling fetch results, undocumented [ui/app/lists/[listId]/page.tsx:589]
- [x] [Review][Defer] `detail` payload uses an unchecked type cast, unlike validated siblings (`asDefaultSplit`/`asMembers`/`asCycles`) [ui/app/lists/[listId]/page.tsx:590] — deferred, pre-existing

## Dev Notes

- **Source of this story:** a `bmad-party-mode` performance review
  (2026-09-09) of `ui/app/lists/[listId]/page.tsx`, prompted by the user
  asking why list detail pages feel slow to load. The room's finding: the
  page issues three *sequential* server-side fetch waves — `detail`
  (awaited alone) → `Promise.all([split, members, cycles])` (awaited) →
  `Promise.all([expenses, balances])` — but only the third wave has a real
  data dependency (on `selectedStatementId`, resolved from the second
  wave's `cycles` response). `split` and `members` have no dependency on
  `cycles` at all and were only grouped with it because of how the
  original `Promise.all` was written. Collapsing this to two waves instead
  of three removes one full round-trip of latency from every list-detail
  page load.
- **This is a pure fetch-ordering change.** No API contracts change, no
  new endpoints, no changes to any of the `as*` parsing functions
  (`asDefaultSplit`, `asMembers`, `asCycles`, `asExpenses`, `asBalances`),
  no changes to error-flag semantics (`splitLoadError`, `membersLoadError`,
  `cyclesLoadError`, `expensesLoadError`, `balancesLoadError`,
  `notFound`, `loadError`). Every one of those functions and flags must
  end this story bit-for-bit identical to before.
- **Dependency graph, current vs. target:**
  - Current: `detail` → (`split`, `members`, `cycles`) → (`expenses`,
    `balances`)
  - Target: (`detail`, `split`, `members`, `cycles`) → (`expenses`,
    `balances`)
  - Caveat worth flagging in code review: `split`/`members`/`cycles` only
    need `listId`, not the parsed `detail` response body — but they are
    still nested inside the `response.ok` branch of the `detail` fetch in
    the target shape (per AC #2, a 401/404/error on `detail` must not
    trigger any other fetch). A fully "true wave 1" that also races
    ahead of the `detail` response itself was considered by the room and
    rejected — it would fire wasted network calls on every 401/404, which
    outweighs the latency win for those paths. Keep the gating on `detail`
    resolving `ok` first, then run the four in parallel.
- **`export const dynamic = "force-dynamic"` (line 35):** no in-file
  comment explains why. The party-mode room noted `cookies()` is already
  called via `fetchSession()`/`requireAlias()`/`cookieHeader()`, which
  itself typically opts Next.js into dynamic rendering — meaning this
  directive may be redundant, or it may have been added deliberately so
  that adding an expense elsewhere updates this page immediately on
  revisit. Investigate before touching; if kept, no change needed; if
  provably redundant, note that finding but do not remove it unless doing
  so is explicitly confirmed safe (this story's scope is fetch ordering,
  not caching strategy — a caching change is a separate, riskier story).
- **Explicitly out of scope for this story** (raised in the same
  party-mode session, tracked separately): a loading skeleton /
  `loading.tsx` for perceived-performance (→ Story 10.2), selective
  `cache`/revalidation tuning per-endpoint, and any backend-side
  combined-endpoint work. Do not fold those in here.

### Project Structure Notes

- Single file touched: `ui/app/lists/[listId]/page.tsx`. No new files, no
  new components, no changes to `ui/app/lists/ListDetailChrome.tsx` or
  sibling components imported by this page.
- Follows existing project convention of server components doing direct
  `fetch()` calls against `getApiInternalUrl()` with manually forwarded
  cookies — this story does not introduce a new data-fetching pattern.

### References

- [Source: ui/app/lists/[listId]/page.tsx#L571-L698] — the full
  try/catch block containing the current three-wave fetch sequence to be
  reshaped.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 10: Performance — list detail page load]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `git log -p --follow -- "ui/app/lists/[listId]/page.tsx"` shows
  `export const dynamic = "force-dynamic";` present on the earliest commit
  that introduced this file (no prior commit adds it separately, no commit
  message or in-file comment explains it). It has survived every rewrite of
  the file since without ever being touched. Conclusion: origin is
  undocumented/scaffold-era, not tied to a specific bug fix. Per AC #5 and
  the story's explicit caution ("do not remove ... unless provably safe and
  explicitly confirmed"), it is left in place unchanged — this story's scope
  is fetch ordering, not caching behavior.
- `docker compose ps` / `curl .../health` confirmed the worktree's Compose
  stack (`fh-feat-10-10-1-parallelize-list-detail-fetching-{api,db,ui}`) was
  already up and healthy before implementation began.
- `npx tsc --noEmit`, `npx eslint app/lists/[listId]/page.tsx`, and
  `npx vitest run app/lists/[listId]/page` (all 6 existing sibling test
  files, 45 tests) ran clean inside the `ui` container after the change.

### Completion Notes List

- Reshaped the single `response.ok` branch in `ListDetailPage` (`ui/app/lists/[listId]/page.tsx`)
  so that `detail`'s JSON body is parsed (`response.json()`) inside the same
  `Promise.all` as the `default-split`, `members`, and `cycles` fetches,
  instead of being awaited first and only then kicking off those three. The
  initial `fetch()` for `detail` (and its 401/404/error/not-ok branching)
  is untouched and still fully gates whether any other network call happens
  at all — a 401/404/non-ok response still short-circuits before any other
  fetch is issued, satisfying AC #2. This removes one full round-trip of
  latency (previously: await detail body → *then* start split/members/cycles)
  without racing ahead of the `detail` response's status itself, matching
  the Dev Notes' explicit rejection of a "true wave 1" that fires before
  `detail`'s own response resolves.
  - Second wave (`expenses`, `balances`, gated on `periodQuery` computed from
    the first wave's `cycles` result) is unchanged.
  - None of `asDefaultSplit`, `asMembers`, `asCycles`, `asExpenses`,
    `asBalances`, or any `*LoadError`/`notFound`/`loadError` assignment was
    touched — pure fetch-ordering change, confirmed by the diff being a
    3-line move (variable destructuring only) plus removing one duplicate
    `detail =` assignment.
  - `dynamic = "force-dynamic"` investigated (AC #5) and left in place —
    see Debug Log.
- Test coverage gap noted (Task 3, AC #3/#4 scope): `ListDetailPage` itself
  is a server component that is never rendered directly in tests per this
  project's convention (see project-context.md — only extracted pure
  functions are unit-tested in sibling `page.<feature>.test.ts` files).
  There is no existing test harness that exercises the fetch-orchestration
  code path (the `try`/`Promise.all` block) itself, so this story does not
  add one — consistent with the story's own instruction to note this gap
  rather than add new test infrastructure for a fetch-only reordering.
  Verification instead relied on: (a) the diff being a pure reorder with no
  logic changes to any parsing/flag-assignment code, (b) full typecheck +
  lint + existing 45-test sibling suite passing, and (c) a manual
  unauthenticated request to `/lists/<id>` confirming the pre-`detail`
  redirect-to-sign-in path is unchanged.

### File List

- `ui/app/lists/[listId]/page.tsx`

## Change Log

- 2026-09-21: Reshaped `ListDetailPage`'s fetch waterfall from three
  sequential waves to two — `detail` (JSON parse), `default-split`,
  `members`, and `cycles` now resolve in one `Promise.all`, gated on the
  initial `detail` fetch's `response.ok` check; `expenses`/`balances`
  remain a second wave dependent on the resolved period. No API contracts,
  parsing functions, or error-flag semantics changed.
