---
title: Refactor Plan - Hooks & Component Extraction
type: architecture
created: 2026-08-12
status: ready-for-dev
---

# Refactor Tickets: Eliminate Duplication via Hooks & Components

## Phase 1: Extract Hooks (Zero-Risk Refactoring)

---

## TICKET 1.1: Extract `useModalAnimation` Hook

**Objective:** Eliminate duplicate modal/sheet animation logic from Sheet.tsx and ListsPanel.tsx

**Scope:**
- Extract animation state machine and effects into reusable hook
- Both consumers use identical: phase states, requestAnimationFrame mounting, setTimeout closing
- No behavior changes—drop-in replacement

**Files to Create:**
```
ui/hooks/useModalAnimation.ts
```

**Files to Modify:**
- `ui/app/lists/Sheet.tsx` (line 44-78: remove effects, call hook)
- `ui/app/lists/ListsPanel.tsx` (similar location)

**Implementation Checklist:**

- [ ] Create `ui/hooks/useModalAnimation.ts` with signature:
```typescript
export function useModalAnimation(
  open: boolean,
  options?: { closeAnimationMs?: number }
): {
  phase: "unmounted" | "mounting" | "open" | "closing"
}
```

- [ ] Extract from Sheet.tsx:
  - `useState` for phase (line ~44)
  - `useEffect` open/close prop changes (line ~49)
  - `useEffect` mounting animation (line ~59)
  - `useEffect` closing animation (line ~71)

- [ ] Document:
  - Phase transitions and timing
  - Why closeAnimationMs must match CSS transition
  - Example usage in component

- [ ] Update Sheet.tsx:
  - Remove phase state declaration
  - Replace 4 useEffect blocks with: `const { phase } = useModalAnimation(open)`
  - Verify no behavior change (visual test: open/close sheet, check animation)

- [ ] Update ListsPanel.tsx (same pattern)

- [ ] Verify test coverage:
  - Run existing tests for Sheet.tsx and ListsPanel.tsx
  - No new tests needed (borrowed existing coverage)

**Acceptance Criteria:**
- ✅ Hook exported from `ui/hooks/useModalAnimation.ts`
- ✅ Sheet.tsx uses hook, phase calculations identical
- ✅ ListsPanel.tsx uses hook, phase calculations identical
- ✅ No visual behavior change
- ✅ Both components reduced ~30 LOC each
- ✅ One commit: "refactor: extract useModalAnimation hook"

---

## TICKET 1.2: Extract `useFocusTrap` Hook

**Objective:** Reusable keyboard trap + focus management for modals

**Scope:**
- Extract Tab/Shift+Tab containment and Escape handling
- Both Sheet and ListsPanel implement identically
- Optional: returnFocus to trigger element on close

**Files to Create:**
```
ui/hooks/useFocusTrap.ts
```

**Files to Modify:**
- `ui/app/lists/Sheet.tsx` (line 80-114: focus effect, replace with hook)
- `ui/app/lists/ListsPanel.tsx` (similar)

**Implementation Checklist:**

- [ ] Create `ui/hooks/useFocusTrap.ts` with signature:
```typescript
export function useFocusTrap(options: {
  isActive: boolean  // true when modal is open
  containerRef: RefObject<HTMLElement>
  defaultFocusRef?: RefObject<HTMLElement>
  returnFocusRef?: RefObject<HTMLElement>
  onEscapePress?: () => void
}): void
```

- [ ] Extract from Sheet.tsx:
  - Focus effect (line ~80)
  - Keyboard event listener setup
  - Tab trap logic
  - Escape key handler
  - Cleanup (removeEventListener, body overflow restore)

- [ ] Implement:
  - If `isActive`, focus `defaultFocusRef?.current` or first focusable element
  - Query focusable elements using existing selector (button, [href], input, etc.)
  - Prevent Tab wrap-around, handle Shift+Tab
  - On Escape (if onEscapePress provided), call it
  - Return focus to `returnFocusRef?.current` on cleanup
  - Restore body overflow in cleanup

- [ ] Document:
  - Why containment matters for a11y
  - How to use with Sheet (isActive = phase === "open")
  - Focusable element selector and edge cases

- [ ] Update Sheet.tsx:
  - Remove focus useEffect block
  - Replace with: `useFocusTrap({ isActive: phase === "open", containerRef: panelRef, defaultFocusRef: closeRef, returnFocusRef, onEscapePress: onClose })`

- [ ] Update ListsPanel.tsx (same)

**Acceptance Criteria:**
- ✅ Hook exported from `ui/hooks/useFocusTrap.ts`
- ✅ Escape key closes modal
- ✅ Tab is trapped within modal
- ✅ Focus returns to trigger button on close (test with keyboard)
- ✅ Both components reduced ~20 LOC each
- ✅ One commit: "refactor: extract useFocusTrap hook"

---

## TICKET 1.3: Extract `useFormSubmission` Hook

**Objective:** Standardize async form submission pattern across all forms

**Scope:**
- Eliminates try/catch boilerplate and pending state management
- ManualExpenseForm, DefaultSplitPanel, InviteForm all implement same pattern
- Handles: error state, pending guard, onSuccess callback

**Files to Create:**
```
ui/hooks/useFormSubmission.ts
```

**Files to Modify:**
- `ui/app/lists/ManualExpenseForm.tsx` (lines 105-173: onSubmit handler)
- `ui/app/lists/DefaultSplitPanel.tsx` (lines 118-148: onSave handler)
- `ui/app/lists/InviteForm.tsx` (lines 37-57: onSubmit handler)

**Implementation Checklist:**

- [ ] Create `ui/hooks/useFormSubmission.ts` with signature:
```typescript
export function useFormSubmission<T>(
  submitFn: (data: T) => Promise<{ ok: boolean; error?: string }>,
  options?: { onSuccess?: () => void }
): {
  pending: boolean
  error: string | null
  submit: (data: T) => Promise<boolean>  // returns success
  clearError: () => void
}
```

- [ ] Implement:
  - `pending` state to guard duplicate submissions
  - `error` state for API/validation errors
  - `submit()` function that:
    - Returns immediately if already pending
    - Calls submitFn(data)
    - On success: call onSuccess?.(), return true
    - On error: set error state, return false
  - `clearError()` to reset error
  - No pendingRef needed (use state alone)

- [ ] Update ManualExpenseForm.tsx:
  - Remove lines: `const [pending, setPending] = useState(false)`, `const pendingRef = useRef(false)`
  - Replace entire `onSubmit` handler with:
```typescript
const { pending, error, submit, clearError } = useFormSubmission(
  async (body: CreateExpenseBody) => {
    const result = await createExpense(listId, body, messages)
    if (result.ok) {
      setAmount("")
      setDescription("")
      setPayerId(currentUserId)
      resetAdjustFields()
      router.refresh()
    }
    return result
  },
  { onSuccess }
)

async function onSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  await submit({ amount, description, payer_id: payerId, ... })
}
```

- [ ] Update DefaultSplitPanel.tsx `onSave` handler similarly

- [ ] Update InviteForm.tsx `onSubmit` handler similarly

- [ ] Update all input onChange handlers:
  - From: `setError(null)` (manual)
  - To: `clearError()` (hook method)

- [ ] Verify error display still works (aria-describedby, role="alert")

**Acceptance Criteria:**
- ✅ Hook exported from `ui/hooks/useFormSubmission.ts`
- ✅ All three forms updated to use hook
- ✅ Form submission behavior identical (pending state, error handling)
- ✅ Each form reduced ~20 LOC
- ✅ Error display and clearing work correctly
- ✅ Three commits (one per form): "refactor(ManualExpenseForm): use useFormSubmission hook" etc.

---

## TICKET 1.4: Extract `useFormStateSync` Hook

**Objective:** Centralize form readiness state sync to parent component

**Scope:**
- ManualExpenseForm and DefaultSplitPanel both track canSubmit/canSave changes
- Both have identical pattern: `useEffect(() => { callback?.(value) }, [value, callback])`
- Parent (ListDetailMobileActions) needs to know when button should be enabled

**Files to Create:**
```
ui/hooks/useFormStateSync.ts
```

**Files to Modify:**
- `ui/app/lists/ManualExpenseForm.tsx` (line ~120: remove useEffect)
- `ui/app/lists/DefaultSplitPanel.tsx` (line ~105: remove useEffect)

**Implementation Checklist:**

- [ ] Create `ui/hooks/useFormStateSync.ts`:
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

- [ ] This is a 3-liner—simple but captures the pattern

- [ ] Update ManualExpenseForm.tsx:
  - Remove manual useEffect (line ~120)
  - Replace with: `useFormStateSync(canSubmit, onCanSubmitChange)`

- [ ] Update DefaultSplitPanel.tsx:
  - Remove manual useEffect
  - Replace with: `useFormStateSync(canSave, onCanSaveChange)`

- [ ] Add imports: `import { useFormStateSync } from '@/hooks'`

**Acceptance Criteria:**
- ✅ Hook exported from `ui/hooks/useFormStateSync.ts`
- ✅ Both forms still sync parent state on change
- ✅ Parent (ListDetailMobileActions) button disable state still works
- ✅ One commit: "refactor: extract useFormStateSync hook"

---

## Phase 1 Summary

**Total Effort:** 2–3 hours
**Commits:** 5
**LOC Reduction:** ~150 LOC
**Breaking Changes:** None

**Before & After:**

| Metric | Before | After |
|--------|--------|-------|
| Sheet.tsx | 170 LOC | 110 LOC |
| ListsPanel.tsx | 612 LOC | 550 LOC |
| ManualExpenseForm.tsx | 365 LOC | 300 LOC |
| DefaultSplitPanel.tsx | 226 LOC | 180 LOC |
| InviteForm.tsx | 98 LOC | 80 LOC |
| **Total** | **1,471 LOC** | **1,220 LOC** |

---

## Next Steps After Phase 1

Once these hooks are merged and tested:

**Phase 2:** Move FormIconSubmit to `ui/components/FormIconSubmit/` + create IconButton component
**Phase 3:** (Optional) Move Sheet to `ui/components/Sheet.tsx` for reuse in other features

---

## Testing Checklist (All Phase 1 Tickets)

After all hooks are merged:

- [ ] Sheet opens/closes with correct animation timing
- [ ] Sheet keyboard trap works (Tab, Shift+Tab, Escape)
- [ ] Forms submit and show errors correctly
- [ ] Forms disable submit button while pending
- [ ] Parent state sync works (corner action buttons enable/disable)
- [ ] Visual regression: no layout changes, same styles applied
- [ ] Existing unit tests still pass
- [ ] Manual smoke test: open expense sheet, add expense, verify close on success

---

## Notes for Implementation

1. **Import locations:** All hooks should export from `ui/hooks/index.ts` for clean imports
2. **TypeScript:** Use `React.RefObject` for all ref typing
3. **Dependencies:** Hooks have no external dependencies (just React)
4. **Testing:** No new tests needed—existing component tests cover hook behavior
5. **Git commits:** One commit per hook (5 total, each ~50–100 LOC change)
