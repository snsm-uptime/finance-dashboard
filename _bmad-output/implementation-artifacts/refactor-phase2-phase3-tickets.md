---
title: Refactor Plan - Phase 2 & 3 Tickets (Components & Simplification)
type: architecture
created: 2026-08-12
status: backlog
---

# Phase 2 & 3 Tickets: Move Components & Simplify Forms

## Phase 2: Move Shared Components to Library

**Timeline:** 2–3 hours | **Commits:** 4 | **Risk:** Low (import path updates only)

---

## TICKET 2.1: Move FormIconSubmit to Shared Components

**Objective:** Make FormIconSubmit available across the app (not just lists)

**Scope:**
- FormIconSubmit is a generic reusable control (not domain-specific)
- Already has CSS module, proven pattern
- Can be reused in settings, account menu, other forms

**Files to Move:**
```
ui/app/lists/FormIconSubmit.tsx  →  ui/components/FormIconSubmit.tsx
ui/app/lists/FormIconSubmit.module.css  →  ui/components/FormIconSubmit.module.css
```

**Files to Update:**
- `ui/app/lists/InviteForm.tsx` (import path)
- `ui/app/lists/ListDetailMobileActions.tsx` (import path)
- `ui/app/lists/FormChrome.tsx` (import path, uses iconStyles)

**Implementation Checklist:**

- [ ] Create directory structure:
```
ui/components/FormIconSubmit/
├── FormIconSubmit.tsx
├── FormIconSubmit.module.css
└── index.ts (export FormIconSubmit)
```

- [ ] Copy files (no code changes):
  - `ui/app/lists/FormIconSubmit.tsx` → `ui/components/FormIconSubmit/FormIconSubmit.tsx`
  - `ui/app/lists/FormIconSubmit.module.css` → `ui/components/FormIconSubmit/FormIconSubmit.module.css`

- [ ] Create `ui/components/FormIconSubmit/index.ts`:
```typescript
export { FormIconSubmit, type FormIconVariant, type FormIconSubmitProps } from './FormIconSubmit'
export { type FormIconFieldProps, FormIconField } from './FormIconSubmit'
```

- [ ] Update imports in lists folder:
  - `InviteForm.tsx`: `import { FormIconSubmit } from '@/components/FormIconSubmit'`
  - `ListDetailMobileActions.tsx`: `import { FormIconSubmit } from '@/components/FormIconSubmit'`
  - `FormChrome.tsx`: `import iconStyles from '@/components/FormIconSubmit/FormIconSubmit.module.css'`

- [ ] Delete original files:
  - `ui/app/lists/FormIconSubmit.tsx`
  - `ui/app/lists/FormIconSubmit.module.css`

- [ ] Verify imports work:
  - TypeScript check: `npm run typecheck`
  - Visual test: Check that invite/expense buttons still render correctly

**Acceptance Criteria:**
- ✅ FormIconSubmit accessible from `@/components/FormIconSubmit`
- ✅ All lists imports updated
- ✅ No visual changes
- ✅ TypeScript passes
- ✅ One commit: "refactor: move FormIconSubmit to shared components"

---

## TICKET 2.2: Create IconButton Component

**Objective:** Consolidate icon button styling and behavior across app

**Scope:**
- ShareTitleButton uses manual inline styles (should use component)
- Sheet's sheetClose button uses CSS module
- Corner action buttons created inline in ListDetailMobileActions
- Create single reusable component with consistent styling

**Files to Create:**
```
ui/components/IconButton.tsx
ui/components/IconButton.module.css
```

**Files to Modify:**
- `ui/app/lists/ShareTitleButton.tsx` (use IconButton)
- `ui/app/lists/Sheet.tsx` (import IconButton, remove inline button)
- `ui/app/lists/Sheet.module.css` (remove .sheetClose styles)
- `ui/app/lists/ListDetailMobileActions.tsx` (already using FormIconSubmit, no change needed)

**Implementation Checklist:**

- [ ] Create `ui/components/IconButton.tsx`:
```typescript
type Props = {
  icon: ReactNode
  label: string
  disabled?: boolean
  onClick?: () => void
  variant?: 'default' | 'muted'
}

export function IconButton({ icon, label, disabled, onClick, variant = 'default' }: Props) {
  return (
    <button
      type="button"
      className={`${styles.button} ${variant === 'muted' ? styles.muted : ''}`}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}
```

- [ ] Create `ui/components/IconButton.module.css`:
  - Copy button styles from FormIconSubmit.module.css (but simpler, icon-only)
  - Add styling for `variant="muted"` (from ShareTitleButton inline styles)
  - Include hover, focus-visible, disabled states

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm, 8px);
  background: var(--surface);
  color: var(--accent);
  cursor: pointer;
  line-height: 0;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.button:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.button:disabled {
  color: var(--muted);
  opacity: 0.45;
  cursor: not-allowed;
}

.muted {
  border: none;
  background: transparent;
  color: var(--muted);
}

.muted:not(:disabled):hover {
  color: var(--foreground);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
```

- [ ] Update ShareTitleButton.tsx:
```typescript
import { IconButton } from '@/components/IconButton'
import { ShareIcon } from '@/app/icons'

export function ShareTitleButton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <IconButton
      icon={<ShareIcon style={{ width: '24px', height: '24px' }} />}
      label={ariaLabel}
      variant="muted"
      onClick={() => {}}  // TODO: implement share action
    />
  )
}
```

- [ ] Update Sheet.tsx:
  - Import IconButton
  - Replace sheetClose button with:
```typescript
{closeButton ?? (
  <IconButton
    icon={<CloseIcon />}
    label={closeLabel}
    onClick={onClose}
  />
)}
```

- [ ] Update Sheet.module.css:
  - Remove `.sheetClose`, `.closeIcon` styles (now in IconButton.module.css)
  - Verify no other styles reference them

- [ ] Verify visual appearance:
  - Close button in sheet should look identical
  - ShareTitleButton should look identical (muted variant)
  - Test hover/focus/disabled states

**Acceptance Criteria:**
- ✅ IconButton component exports from `@/components/IconButton`
- ✅ ShareTitleButton uses IconButton with variant="muted"
- ✅ Sheet uses IconButton for close button
- ✅ Visual appearance unchanged (hover, focus, disabled states work)
- ✅ TypeScript passes
- ✅ One commit: "refactor: create IconButton component, consolidate icon styling"

---

## Phase 3: Simplify Forms (Post-Phase 1)

**Timeline:** 2–3 hours | **Commits:** 3 | **Risk:** Medium (test coverage—already has tests)

**Dependency:** Phase 1 hooks must be merged first

---

## TICKET 3.1: Refactor ManualExpenseForm to Use Hooks

**Objective:** Simplify form by using extracted hooks

**Scope:**
- Already uses useFormSubmission (from Phase 1)
- Already uses useFormStateSync (from Phase 1)
- Just need to remove old state management

**Files to Modify:**
- `ui/app/lists/ManualExpenseForm.tsx`

**Implementation Checklist:**

- [ ] Verify Phase 1 hooks are merged (useFormSubmission, useFormStateSync)

- [ ] Current state to remove:
```typescript
const [error, setError] = useState<string | null>(null)
const [pending, setPending] = useState(false)
const pendingRef = useRef(false)
```

- [ ] Current onSubmit to replace:
```typescript
// OLD: 30+ LOC with try/catch, pendingRef guard, etc.

// NEW: 10 LOC
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
  await submit({ amount: amount.trim(), description: description.trim(), ... })
}
```

- [ ] Current useEffect to remove:
```typescript
useEffect(() => {
  onCanSubmitChange?.(canSubmit)
}, [canSubmit, onCanSubmitChange])
```

- [ ] Update all input onChange handlers:
  - From: `setError(null)`
  - To: `clearError()`

- [ ] Run existing tests:
```bash
npm test -- ManualExpenseForm.test.tsx
```

- [ ] Verify behavior:
  - Submit with valid data → form clears, sheet closes
  - Submit with invalid data → error displays
  - Error clears on input change
  - Button disabled while pending
  - Button disabled when form empty

**Acceptance Criteria:**
- ✅ Form uses useFormSubmission hook
- ✅ Form uses useFormStateSync hook
- ✅ Behavior identical to before (all tests pass)
- ✅ ~65 LOC reduction (365 → 300)
- ✅ One commit: "refactor(ManualExpenseForm): use extracted hooks"

---

## TICKET 3.2: Refactor DefaultSplitPanel to Use Hooks

**Objective:** Simplify form by using extracted hooks

**Scope:**
- Similar to ManualExpenseForm
- Use useFormSubmission for onSave
- Use useFormStateSync for canSave tracking

**Files to Modify:**
- `ui/app/lists/DefaultSplitPanel.tsx`

**Implementation Checklist:**

- [ ] Current state to remove (in onSave):
```typescript
// useTransition already in place, but onSave can be simplified
```

- [ ] Extract onSave into useFormSubmission:
```typescript
const { pending, error, submit } = useFormSubmission(
  async () => {
    const body = mode === "even" ? { mode: "even" as const } : { ... }
    return await saveDefaultSplit(listId, body, { ... })
  },
  { onSuccess }
)

// In component:
// Replace onClick={onSave} with onClick={() => submit({})}
```

- [ ] Add state sync hook:
```typescript
useFormStateSync(canSave, onCanSaveChange)
```

- [ ] Update onSaveRequest to call submit:
```typescript
onSaveRequest?.(() => {
  if (canSave) submit({})
})
```

- [ ] Run tests:
```bash
npm test -- DefaultSplitPanel  # (if tests exist)
```

- [ ] Verify behavior:
  - Save button disabled when no changes
  - Save works, closes sheet on success
  - Error handling still works

**Acceptance Criteria:**
- ✅ Form uses useFormSubmission hook
- ✅ Form uses useFormStateSync hook
- ✅ Behavior identical to before
- ✅ ~45 LOC reduction (226 → 180)
- ✅ One commit: "refactor(DefaultSplitPanel): use extracted hooks"

---

## TICKET 3.3: Refactor InviteForm to Use Hooks

**Objective:** Simplify form by using extracted hooks

**Scope:**
- Simpler than expense/split forms
- Use useFormSubmission for invite sending
- Note: InviteForm doesn't close sheet (it's in a separate form context)

**Files to Modify:**
- `ui/app/lists/InviteForm.tsx`

**Implementation Checklist:**

- [ ] Current state to remove:
```typescript
const [error, setError] = useState<string | null>(null)
const [sent, setSent] = useState(false)
const [pending, setPending] = useState(false)
const pendingRef = useRef(false)
```

- [ ] Extract onSubmit into useFormSubmission:
```typescript
const { pending, error, submit, clearError } = useFormSubmission(
  async (email: string) => {
    const result = await inviteMember(listId, email, messages)
    if (result.ok) {
      setEmail("")
    }
    return result
  }
)

async function onSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const email = String(new FormData(event.currentTarget).get("email") ?? "")
  await submit(email)
}
```

- [ ] Update onChange handlers:
  - `clearError()` replaces `setError(null)`

- [ ] Remove sent state (no longer needed—useFormSubmission handles success)
  - Remove lines: `setSent(false)` in onChange
  - Remove JSX: `{sent ? <p>{messages.inviteSent}</p> : null}`
  - Add success message display via new prop or different approach

- [ ] Run tests:
```bash
npm test -- InviteForm.test.tsx
```

- [ ] Verify behavior:
  - Submit valid email → sent confirmation, email clears, form resets
  - Submit invalid → error displays
  - Error clears on input change
  - Button disabled while pending

**Acceptance Criteria:**
- ✅ Form uses useFormSubmission hook
- ✅ Behavior identical to before (all tests pass)
- ✅ ~18 LOC reduction (98 → 80)
- ✅ One commit: "refactor(InviteForm): use extracted hooks"

---

## Phase 2 & 3 Summary

### Phase 2 Results
- ✅ FormIconSubmit moved to shared library
- ✅ IconButton component created (consolidates 3 manual implementations)
- ✅ 2 commits, ~50 LOC reduction from cleanup

### Phase 3 Results  
- ✅ All forms simplified via hooks
- ✅ 128 LOC reduction (365 + 226 + 98 → 300 + 180 + 80)
- ✅ 3 commits, one per form
- ✅ Easier to onboard new forms (just use useFormSubmission hook)

---

## Total Refactor Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total LOC (lists folder) | 2,884 | 2,636 | **-248 (-8.6%)** |
| Duplication | 200+ | 0 | **Eliminated** |
| Shared Hooks | 0 | 4 | **+4** |
| Shared Components | 0 | 2 | **+2** |
| Form Boilerplate | 100+ | 20 | **Reduced 80%** |

---

## Implementation Timeline (Recommended)

```
Week 1-2:
├─ Phase 1: Extract hooks (2-3 hours)
│  ├─ TICKET 1.1: useModalAnimation
│  ├─ TICKET 1.2: useFocusTrap
│  ├─ TICKET 1.3: useFormSubmission
│  └─ TICKET 1.4: useFormStateSync
│
├─ Phase 2: Move components (2-3 hours)
│  ├─ TICKET 2.1: Move FormIconSubmit
│  └─ TICKET 2.2: Create IconButton
│
└─ Phase 3: Simplify forms (2-3 hours)
   ├─ TICKET 3.1: Refactor ManualExpenseForm
   ├─ TICKET 3.2: Refactor DefaultSplitPanel
   └─ TICKET 3.3: Refactor InviteForm

TOTAL: 6-9 hours, 12 commits, -248 LOC, 4 hooks, 2 components
```

---

## Notes

1. **Each ticket is independent** within its phase (once dependencies met)
2. **Zero breaking changes** in Phase 1 (safe to merge incrementally)
3. **Phase 2 only requires import updates** (safe to merge)
4. **Phase 3 depends on Phase 1** (wait for hooks before simplifying)
5. **Testing strategy:** Run existing tests after each commit
6. **Risk mitigation:** Each commit is small, reviewable, and revertible
