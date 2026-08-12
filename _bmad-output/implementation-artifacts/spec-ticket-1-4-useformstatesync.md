---
title: 'Extract useFormStateSync Hook'
type: 'refactor'
created: '2026-08-12'
status: 'done'
ticket: 'TICKET-1.4'
phase: 1
review_loop_iteration: 0
context: 
  - "_bmad-output/implementation-artifacts/refactor-ticket-status.yaml"
  - "_bmad-output/implementation-artifacts/refactor-hooks-and-components-tickets.md"
baseline_commit: 'a69eebfcda4e2909f04ec2aaf4039e2496ac1697'
completed_commit: '203e52595883e3cdf1e7083cd144806717c1b322'
date_started: '2026-08-12'
date_completed: '2026-08-12'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ManualExpenseForm and DefaultSplitPanel both implement identical parent state tracking: a useEffect that watches a boolean value (canSubmit/canSave) and calls a parent callback when it changes. This 3-line pattern is duplicated across both components.

**Approach:** Extract the state-sync pattern into a reusable `useFormStateSync` hook that centralizes the useEffect callback pattern. Drop-in replacement for each form's current pattern.

## Boundaries & Constraints

**Always:**
- Hook accepts a boolean value and optional callback
- Calls the callback whenever the value or callback reference changes
- Exports from `ui/hooks/index.ts` for consistent import location
- TypeScript with proper typing on callback parameter

**Ask First:**
- If parent state-sync strategy needs to change (currently synchronous callback)

**Never:**
- Debounce or throttle the callback (out of scope)
- Cache or memoize the callback (parent is responsible for stability)
- Auto-call on component mount (only on value change)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial mount with callback | `useFormStateSync(true, callback)` | Callback fires with `true` on first render | N/A |
| Value changes | Value changes from `false` → `true` | Callback fires with new `true` value | N/A |
| Callback is stable | Value stable, callback ref same | No callback invoked | N/A |
| Callback is undefined | `useFormStateSync(true, undefined)` | No callback invoked, hook still works | N/A |
| Callback is replaced | Parent re-provides new callback ref | New callback fires immediately | N/A |

</frozen-after-approval>

## Code Map

- `ui/hooks/useFormStateSync.ts` — New hook, ~5 LOC
- `ui/app/lists/ManualExpenseForm.tsx` — Remove useEffect (lines 170-172), add hook call (~3 LOC change)
- `ui/app/lists/DefaultSplitPanel.tsx` — Remove useEffect (lines 146-148), add hook call (~3 LOC change)
- `ui/hooks/index.ts` — Add export for new hook (1 line)

## Tasks & Acceptance

**Execution:**

- [x] `ui/hooks/useFormStateSync.ts` -- Create hook with state sync pattern -- Encapsulates parent callback invocation on value change
- [x] `ui/app/lists/ManualExpenseForm.tsx` -- Remove useEffect block (lines 170-172), import and call useFormStateSync -- Reduces boilerplate
- [x] `ui/app/lists/DefaultSplitPanel.tsx` -- Remove useEffect block (lines 146-148), import and call useFormStateSync -- Reduces boilerplate
- [x] `ui/hooks/index.ts` -- Export useFormStateSync from index -- Enable clean imports across project

**Acceptance Criteria:**

- Given ManualExpenseForm, when canSubmit value changes, then onCanSubmitChange callback is invoked with new value
- Given DefaultSplitPanel, when canSave value changes, then onCanSaveChange callback is invoked with new value
- Given parent ListDetailMobileActions with registered callback, when form state syncs, then button disabled state updates correctly
- Given both forms refactored, when existing tests run, then all pass without modification
- Given new hook usage, when form state-sync workflow runs, then behavior is identical to original (callback timing, dependency tracking)

## Spec Change Log

- Created 2026-08-12: Initial draft from refactor-hooks-and-components-tickets.md TICKET-1.4

## Design Notes

### Hook Signature Rationale

```typescript
export function useFormStateSync(
  value: boolean,
  onChange?: (v: boolean) => void
): void {
  useEffect(() => {
    onChange?.(value)
  }, [value, onChange])
}
```

- Generic pattern: watches a boolean and syncs to parent
- `onChange` is optional to handle `undefined` callbacks gracefully
- Dependencies are explicit: `[value, onChange]` ensures callback fires when either changes
- Return type `void` — hook is side-effect only, no returned state

### Why This Hook Exists

Both ManualExpenseForm and DefaultSplitPanel had this exact pattern:
```typescript
useEffect(() => {
  onCanSubmitChange?.(canSubmit)
}, [canSubmit, onCanSubmitChange])
```

Extracting centralizes the pattern and reduces duplication. Each form reduces by 3 LOC.

## Verification

**Commands:**
- `npm run build` -- Expected: TypeScript compiles without errors
- `npm run lint` -- Expected: No new linting issues
- `npm test` -- Expected: All existing form tests pass without modification

**Manual checks:**
- Open ManualExpenseForm in a list, fill amount/description → verify submit button enables
- Clear description → verify submit button disables
- Open DefaultSplitPanel, change split percentage → verify save button enables
- Undo change back to original → verify save button disables
- Verify no visual or behavioral regressions in either form
