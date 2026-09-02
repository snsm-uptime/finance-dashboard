# Sprint Change Proposal — 2026-09-02 (Onboarding & documentation)

## 1. Issue Summary

The landing page (`ui/app/page.tsx`) is a scaffold placeholder ("Stack is up") from Epic 1, describing Compose services rather than the product. No epic covers replacing it with a real introduction, and no epic covers a documentation/tutorials index (including UX-feature call-outs like accessibility and keyboard navigation). This is new v1-scope, not a fix to existing work.

## 2. Impact Analysis

**Epic Impact:** New **Epic 8: Onboarding & documentation** (v1, independent — no dependency on other epics). No existing epic is modified or invalidated.

**Artifact Conflicts:**
- **PRD:** two new FRs (FR-52 landing intro, FR-53 docs index) added under a new "Onboarding and documentation" subsection, after FR-45 and before Non-functional requirements.
- **Architecture:** none — static/server-rendered content pages, no new data model or API surface.
- **UX/UX:** new page content only; must stay within Warm Balance/Soft-Ledger tokens (no new design system).
- **Other artifacts:** none.

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment.** New epic, two independent stories, no rollback or MVP scope change (this replaces a placeholder, doesn't touch delivered functionality).

- Effort: Low — both stories are content/presentation, no backend work.
- Risk: Low.

## 4. Detailed Change Proposals

### 4.1 PRD — new FRs

Added after FR-45 (`### Onboarding and documentation` subsection):

> **FR-52: Landing page introduction** — A signed-out visitor opening `/` sees an introduction to the app (what it does: shared expenses, budgets, statement import) instead of placeholder infra text. Signed-in redirect behavior and sign-up/sign-in CTAs are unaffected.
>
> **FR-53: Documentation index** — A `/docs` route, reachable without signing in, indexes tutorials grouped by area (lists, budgets, import) and calls out UX features already shipped (accessibility, keyboard navigation). The landing page links to it.

### 4.2 Epics.md — new Epic 8

Added to the Epic List overview and as a full section at the end of the file:

**Epic 8: Onboarding & documentation (v1)**
FRs covered: FR-52, FR-53. Demo gate: signed-out visitor lands on an intro page and can reach a docs index listing tutorials and UX-feature call-outs. Sequencing: independent, no prerequisite epics.

#### Story 8.1: Landing page introduction

As a new visitor, I want the landing page to explain what the app does instead of just confirming the stack is up, so I understand the product before signing up.

**Acceptance Criteria:**

**Given** a signed-out visitor opens `/`
**When** the page renders
**Then** it shows an introduction to the app (what it does: shared expenses, budgets, statement import) instead of "Stack is up" infra text

**Given** the existing authenticated-redirect behavior
**When** a signed-in user opens `/`
**Then** the redirect to their landing destination (`resolveServerAuthenticatedLanding`) is unchanged

**Given** the intro content
**When** it renders
**Then** sign-up/sign-in CTAs remain present and reachable, same as today

#### Story 8.2: Documentation index page

As a user (new or existing), I want a documentation page indexing tutorials and UX features, so I can discover things like keyboard navigation and accessibility support.

**Acceptance Criteria:**

**Given** a new `/docs` route
**When** any user (signed in or not) opens it
**Then** it shows an index of tutorial entries (topic + link/anchor), grouped by area (e.g. lists, budgets, import)

**Given** the docs index
**When** it renders
**Then** it includes a UX-features section calling out accessibility and keyboard-navigation support already built into the app (e.g. AD-9 non-gesture paths, ARIA patterns already shipped)

**Given** the landing page (Story 8.1)
**When** it renders
**Then** it links to `/docs`

### 4.3 sprint-status.yaml

```yaml
  epic-8: backlog
  8-1-landing-page-introduction: backlog
  8-2-documentation-index-page: backlog
  epic-8-retrospective: optional
```

## 5. Implementation Handoff

**Scope classification: Minor** — new, independent, additive epic with no dependency wiring needed beyond the artifact edits above (already applied). Both stories are directly implementable by the Developer agent via `bmad-create-story` → `bmad-dev-story`; no PO/architect coordination required.

- **Developer agent:** implement 8.1 and 8.2, in either order (fully independent of each other and of every other epic).
- **Success criteria:** ACs above pass as written; demo gate (signed-out visitor sees a real intro and can reach `/docs`) holds.

## Approval

Approved by Sebas on 2026-09-02, batch mode.
