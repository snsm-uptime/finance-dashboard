---
title: Master Refactor Plan - Eliminate Duplication & Simplify Code
type: architecture
created: 2026-08-12
status: ready-for-dev
---

# Master Plan: Code Simplification via Hooks & Components

## Executive Summary

Your forms and modals contain **200+ LOC of duplicate code patterns** that can be eliminated via 4 reusable hooks and 2 shared components. This refactor reduces complexity by 8.6% (-248 LOC), improves maintainability, and makes adding new forms trivial.

**Scope:** 12 commits over 2 weeks | **Risk:** Low (incremental, zero breaking changes) | **Benefit:** High

---

## The Problem

Current state: Horizontal duplication

```
Sheet.tsx               ListsPanel.tsx            ManualExpenseForm.tsx      DefaultSplitPanel.tsx     InviteForm.tsx
├─ Phase state machine  ├─ Phase state machine    ├─ Error state mgmt        ├─ Pending state          ├─ Pending state
├─ Modal animation      ├─ Modal animation        ├─ Pending guard           ├─ Try/catch boilerplate  ├─ Try/catch boilerplate
├─ Focus trap           ├─ Focus trap             ├─ Try/catch               ├─ Success callback       ├─ Success callback
├─ Keyboard handling    ├─ Keyboard handling      ├─ Success callback        └─ State sync callback    └─ State sync callback
└─ Body overflow mgmt   └─ Body overflow mgmt     └─ State sync callback

RESULT: Same logic written 5 different ways across 2,884 LOC
```

---

## The Solution

Extract 3 layers: hooks → components → simplified forms

### Layer 1: Hooks (Behavioral Patterns)
```
ui/hooks/
├─ useModalAnimation.ts      (40 LOC)  Handles: phase states, animations, timing
├─ useFocusTrap.ts           (25 LOC)  Handles: Tab trap, Escape, focus restore
├─ useFormSubmission.ts      (30 LOC)  Handles: async submission, error, pending
└─ useFormStateSync.ts       (8 LOC)   Handles: parent state tracking
```

### Layer 2: Shared Components (UI Patterns)
```
ui/components/
├─ FormIconSubmit/           (123 LOC) Moved from lists/ (already generic)
├─ IconButton.tsx            (50 LOC)  New: consolidates 3 manual button implementations
└─ Sheet.tsx                 (90 LOC)  Available for other features (after Phase 1)
```

### Layer 3: Simplified Forms (Domain Logic Only)
```
ManualExpenseForm:   365 LOC → 300 LOC (-65)   (65 LOC removed: boilerplate)
DefaultSplitPanel:   226 LOC → 180 LOC (-45)   (45 LOC removed: boilerplate)
InviteForm:          98 LOC  → 80 LOC  (-18)   (18 LOC removed: boilerplate)
```

---

## Before & After

### Before: ManualExpenseForm (onSubmit handler)
```typescript
async function onSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  if (pendingRef.current || !email.trim()) return
  pendingRef.current = true
  setError(null)
  setPending(true)
  const submitted = String(new FormData(event.currentTarget).get("email") ?? "")
  try {
    const result = await createExpense(listId, submitted, messages)
    if (!result.ok) {
      setSent(false)
      setError(result.error)
      return
    }
    setSent(true)
    setEmail("")
    router.refresh()
  } finally {
    pendingRef.current = false
    setPending(false)
  }
}
```

### After: ManualExpenseForm (using hooks)
```typescript
const { pending, error, submit, clearError } = useFormSubmission(
  async (body) => {
    const result = await createExpense(listId, body, messages)
    if (result.ok) {
      setAmount("")
      setDescription("")
      router.refresh()
    }
    return result
  },
  { onSuccess }
)

async function onSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  await submit(/* data */)
}
```

**Result:** 15 LOC → 5 LOC for submission logic (66% reduction)

---

## Three-Phase Implementation

### Phase 1: Extract Hooks (2–3 hours)
**Status:** Ready to start
**Risk:** Low (zero breaking changes)
**Commits:** 5

1. **TICKET 1.1** — Extract `useModalAnimation` hook
   - Eliminates 120 LOC duplication (Sheet.tsx + ListsPanel.tsx)
   - Both components call: `const { phase } = useModalAnimation(open)`
   - Saves: ~30 LOC per component

2. **TICKET 1.2** — Extract `useFocusTrap` hook
   - Eliminates 25 LOC duplication
   - Handles: Tab containment, Escape key, focus restoration
   - Saves: ~20 LOC per modal component

3. **TICKET 1.3** — Extract `useFormSubmission` hook
   - Eliminates 60 LOC duplication across 3 forms
   - Replaces: try/catch boilerplate, pending guard, error handling
   - Saves: ~20 LOC per form

4. **TICKET 1.4** — Extract `useFormStateSync` hook
   - Eliminates 20 LOC of `useEffect(() => { callback?.(value) })` patterns
   - Saves: ~3–5 LOC per form

**Benefit:** 150 LOC reduction, zero behavior changes, forms ready for Phase 3

---

### Phase 2: Move Components to Library (2–3 hours)
**Status:** Ready after Phase 1
**Risk:** Low (import path updates only)
**Commits:** 2

1. **TICKET 2.1** — Move FormIconSubmit to `ui/components/FormIconSubmit/`
   - Already proven, generic pattern
   - Available for settings, account menu, other features
   - Saves: Import path cleanup

2. **TICKET 2.2** — Create `IconButton` component
   - Consolidates ShareTitleButton + Sheet's sheetClose + future icon buttons
   - Single source of truth for icon button styling
   - Saves: ~90 LOC across 3 implementations

**Benefit:** 2 shared components, reusable across app

---

### Phase 3: Simplify Forms (2–3 hours)
**Status:** Ready after Phase 1 hooks merged
**Risk:** Medium (test coverage—already tested)
**Commits:** 3

1. **TICKET 3.1** — Refactor ManualExpenseForm using hooks
   - Remove: `[error, sent, pending, pendingRef]` state (now in hooks)
   - Remove: try/catch boilerplate (now in useFormSubmission)
   - Result: 365 → 300 LOC (-65 LOC)

2. **TICKET 3.2** — Refactor DefaultSplitPanel using hooks
   - Similar cleanup
   - Result: 226 → 180 LOC (-45 LOC)

3. **TICKET 3.3** — Refactor InviteForm using hooks
   - Similar cleanup
   - Result: 98 → 80 LOC (-18 LOC)

**Benefit:** 128 LOC reduction, forms easier to understand, onboarding new forms faster

---

## Results Summary

### Code Metrics
| Metric | Before | After | Δ |
|--------|--------|-------|---|
| Total LOC (lists folder) | 2,884 | 2,636 | **-248** |
| Duplication patterns | 200+ | 0 | **Eliminated** |
| Custom hooks | 0 | 4 | **+4** |
| Shared components | 0 | 2 | **+2** |
| Form boilerplate per form | ~30 LOC | ~5 LOC | **-83%** |

### Quality Metrics
| Aspect | Impact |
|--------|--------|
| Maintainability | ⬆️ High (single source of truth) |
| Reusability | ⬆️️ High (4 hooks, 2 components) |
| Testability | ⬆️ Medium (hooks are unit-testable) |
| Onboarding | ⬆️ High (new forms just use hooks) |
| Risk | ✅ Low (incremental, backward-compatible) |

---

## Implementation Strategy

### Commit Schedule (Recommended)

**Week 1:**
- Mon: TICKET 1.1 (useModalAnimation)
- Tue: TICKET 1.2 (useFocusTrap)
- Wed: TICKET 1.3 (useFormSubmission)
- Thu: TICKET 1.4 (useFormStateSync)
- Fri: TICKET 2.1 (Move FormIconSubmit)

**Week 2:**
- Mon: TICKET 2.2 (Create IconButton)
- Tue: TICKET 3.1 (Refactor ManualExpenseForm)
- Wed: TICKET 3.2 (Refactor DefaultSplitPanel)
- Thu: TICKET 3.3 (Refactor InviteForm)
- Fri: Testing, polish, merge

### Risk Mitigation
- ✅ Phase 1 has zero breaking changes (can merge immediately)
- ✅ Each ticket is small (~50–100 LOC change) and reviewable
- ✅ Existing tests verify all behavior
- ✅ Incremental commits enable rollback if needed
- ✅ No changes to form/modal behavior (refactor only)

---

## Dependency Graph

```
Phase 1 (Hooks)
├─ 1.1 useModalAnimation ──┐
├─ 1.2 useFocusTrap        │
├─ 1.3 useFormSubmission   │
└─ 1.4 useFormStateSync    │
                            ↓
Phase 2 (Components)
├─ 2.1 Move FormIconSubmit
└─ 2.2 Create IconButton
                            ↓
Phase 3 (Simplify Forms) ← DEPENDS ON Phase 1
├─ 3.1 ManualExpenseForm
├─ 3.2 DefaultSplitPanel
└─ 3.3 InviteForm
```

**Key:** Phase 1 must complete before Phase 3 starts. Phase 2 is independent.

---

## Decision Points

| Decision | Recommendation | Rationale |
|----------|---|---|
| Extract hooks first? | ✅ Yes | Unblocks form simplification, zero risk |
| Move FormIconSubmit now? | ✅ Yes | Already proven, enables reuse |
| Create IconButton? | ✅ Yes | Consolidates 3 inline implementations |
| Keep forms in lists/? | ✅ Yes | Domain-specific (not generic) |
| Move Sheet to components? | 🟡 Later | Nice-to-have; Phase 1 already delivers value |

---

## Success Criteria

**Phase 1 Complete:**
- ✅ All 4 hooks exported and documented
- ✅ Sheet.tsx and ListsPanel.tsx use hooks (behavior unchanged)
- ✅ All forms accept useFormSubmission + useFormStateSync
- ✅ TypeScript passes
- ✅ Existing tests pass (no new tests needed)

**Phase 2 Complete:**
- ✅ FormIconSubmit in `@/components/FormIconSubmit`
- ✅ IconButton component available
- ✅ All import paths updated
- ✅ Visual appearance unchanged

**Phase 3 Complete:**
- ✅ All forms simplified (using hooks)
- ✅ Form submission behavior identical
- ✅ Error handling works correctly
- ✅ All tests pass
- ✅ 128 LOC reduction achieved

**Overall Refactor Complete:**
- ✅ 248 LOC reduction
- ✅ 200+ LOC duplication eliminated
- ✅ 4 reusable hooks available
- ✅ 2 shared components available
- ✅ Easier to onboard new forms

---

## Detailed Tickets

👉 See:
- **Phase 1:** `refactor-hooks-and-components-tickets.md`
- **Phase 2 & 3:** `refactor-phase2-phase3-tickets.md`

Each ticket includes:
- Clear acceptance criteria
- Step-by-step implementation checklist
- Testing strategy
- File changes required
- One commit per ticket

---

## Questions?

**For clarification on any ticket:**
1. Read the detailed ticket file (acceptance criteria + implementation checklist)
2. The checklists are prescriptive—follow them step by step
3. Each commit should pass TypeScript and existing tests

**Ready to start?** Begin with TICKET 1.1 (useModalAnimation). It's the foundation for subsequent cleanup.
