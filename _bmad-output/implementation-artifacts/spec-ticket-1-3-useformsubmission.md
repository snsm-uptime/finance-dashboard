---
title: 'Extract useFormSubmission Hook'
type: 'refactor'
created: '2026-08-12'
status: 'done'
ticket: 'TICKET-1.3'
phase: 1
review_loop_iteration: 0
context: 
  - "_bmad-output/implementation-artifacts/refactor-ticket-status.yaml"
  - "_bmad-output/implementation-artifacts/refactor-hooks-and-components-tickets.md"
baseline_commit: '67e91f552c66bdcd7dcf5a169e0a9487b04edf1b'
completed_commit: 'a69eebfcda4e2909f04ec2aaf4039e2496ac1697'
date_started: '2026-08-12'
date_completed: '2026-08-12'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ManualExpenseForm, DefaultSplitPanel, and InviteForm all implement identical async form submission patterns: try/catch blocks, pending state management with refs, and error handling (~20 LOC each). This duplication across three forms makes maintenance harder and error-prone.

**Approach:** Extract the async form submission lifecycle into a reusable `useFormSubmission` hook that standardizes error state, pending guards, and success callbacks. No behavior changes—drop-in replacement for each form's current pattern.

## Boundaries & Constraints

**Always:**
- Hook prevents duplicate submissions via pending state guard (guard before async call, same as current `pendingRef.current` check)
- Error state set on API failure, cleared explicitly via `clearError()` or on user input changes
- Success callback fires after successful submission result, before form reset
- All three forms must continue submitting identical data to their APIs (no payload changes)
- TypeScript with strict typing on generic submit function and return value
- Hook exported from `ui/hooks/index.ts` for consistent import location

**Ask First:**
- If error display strategy needs to change (currently aria-describedby + role="alert")

**Never:**
- Auto-clear error on submission attempt (must be explicit or tied to input change)
- Retry logic or exponential backoff (out of scope)
- Loading spinner or UI manipulation inside hook (stateful return only)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First submission | `submit(data)` called, not pending | API called, pending=true during flight | On API error: error state set, returns false |
| Duplicate submission guard | `submit(data)` called while pending=true | Returns false immediately, no API call | N/A |
| API success | `submitFn` returns `{ ok: true }` | pending→false, onSuccess callback fires, submit returns true | N/A |
| API error | `submitFn` returns `{ ok: false, error: "msg" }` | pending→false, error state set to "msg", submit returns false | N/A |
| User clears error | `clearError()` called | error state→null, no API call | N/A |

</frozen-after-approval>

## Code Map

- `ui/hooks/useFormSubmission.ts` — New hook, ~30 LOC
- `ui/app/lists/ManualExpenseForm.tsx` — Remove pendingRef, setState calls; use hook in onSubmit (~50 LOC change)
- `ui/app/lists/DefaultSplitPanel.tsx` — Adapt onSave handler to hook pattern (~40 LOC change)
- `ui/app/lists/InviteForm.tsx` — Remove pendingRef, setState calls; use hook in onSubmit (~40 LOC change)
- `ui/hooks/index.ts` — Add export for new hook (1 line)

## Tasks & Acceptance

**Execution:**

- [x] `ui/hooks/useFormSubmission.ts` -- Create hook with state management and generic submit function -- Encapsulates async form lifecycle to eliminate duplication
- [x] `ui/app/lists/ManualExpenseForm.tsx` -- Remove pending state and pendingRef, replace onSubmit handler with hook usage, update onChange clearError calls -- Reduces from 365 LOC to ~300 LOC
- [x] `ui/app/lists/DefaultSplitPanel.tsx` -- Adapt onSave handler pattern to use hook (note: currently uses useTransition; align with other forms) -- Reduces LOC, consistent pattern
- [x] `ui/app/lists/InviteForm.tsx` -- Remove pending state and pendingRef, replace onSubmit handler with hook usage -- Reduces from 98 LOC to ~80 LOC
- [x] `ui/hooks/index.ts` -- Export useFormSubmission from index -- Enable clean imports across project

**Acceptance Criteria:**

- Given ManualExpenseForm submission, when form is submitted successfully, then onSuccess callback fires and form fields reset
- Given ManualExpenseForm pending submission, when submit is called again before first completes, then second call returns false without API call
- Given any form submission failure, when submitFn returns `{ ok: false, error }`, then error is displayed and user can correct and retry
- Given error displayed, when user calls `clearError()` or changes input, then error state clears visually
- Given all three forms refactored, when existing tests run, then all pass without modification
- Given new hook usage, when form submit workflow runs, then behavior is identical to original (pending state, error handling, success callback timing)

## Spec Change Log

- Created 2026-08-12: Initial draft from refactor-hooks-and-components-tickets.md TICKET-1.3

## Design Notes

### Why no `pendingRef`?

The current forms use `pendingRef.current` to guard against duplicate submissions if React re-renders during the async call. The hook will use state alone: `pending` prevents calling the async function again, and the guard executes before any state update, matching the original behavior.

### Hook Signature Rationale

```typescript
export function useFormSubmission<T>(
  submitFn: (data: T) => Promise<{ ok: boolean; error?: string }>,
  options?: { onSuccess?: () => void }
): {
  pending: boolean
  error: string | null
  submit: (data: T) => Promise<boolean>
  clearError: () => void
}
```

- Generic `<T>` allows typed form data without casting
- `submitFn` matches current async handlers (ManualExpenseForm.createExpense, etc.)
- Return value `{ ok: boolean; error?: string }` matches all three APIs
- `onSuccess` callback fires before form reset (allows parent notifications)
- `submit()` returns boolean for parent conditional logic (e.g., disable button)
- `clearError()` is explicit—not auto-cleared on input change (keeps control with component)

## Verification

**Commands:**
- `npm run build` -- Expected: TypeScript compiles without errors
- `npm run lint` -- Expected: No new linting issues
- `npm test` -- Expected: All tests pass (existing ManualExpenseForm, DefaultSplitPanel, InviteForm tests unchanged)

**Manual checks:**
- Open ManualExpenseForm (expense sheet), submit valid expense → verify form clears and animates closed
- Open InviteForm, submit valid email → verify "sent" message appears
- Trigger API error (inspect network to simulate), verify error message displays
- With error displayed, click input and change value → verify error clears
- Attempt double-submit (rapid clicks on submit button) → verify only one API call fires
