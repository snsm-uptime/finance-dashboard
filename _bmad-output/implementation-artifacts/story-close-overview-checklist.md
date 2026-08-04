# Story-close overview checklist

**Team agreement (Epic 1 retro AI #1 / Story 1.5.2):** A story is **not** `done` until a short how/why overview exists for Sebas — in that story’s **Dev Agent Record / Completion Notes**, or a linked artifact. Green tests and checked ACs alone are **not** enough.

Auth/mail wiring reference: [`auth-mail-interaction-map.md`](../planning-artifacts/architecture/architecture-finance-helper-2026-08-03/auth-mail-interaction-map.md)

---

## Before marking `done`

- [ ] Paste the template below into the story file (Completion Notes) or link an equivalent short artifact
- [ ] Fill all four sections (one screen max)
- [ ] Include at least one concrete “what not to break” invariant
- [ ] If auth/mail paths changed, update the living interaction map in the same PR

---

## Copy-paste template

```markdown
## Story-close overview — {story id / key}

**Request path:**
(browser → ui BFF/proxy → api → application → adapters — happy path only)

**Key components:**
(files / services touched)

**Why this shape:**
(AD / review decision in one or two sentences)

**What not to break:**
(invariants later stories must preserve)
```

Keep it scannable. Prefer paths and invariants over narrative.
