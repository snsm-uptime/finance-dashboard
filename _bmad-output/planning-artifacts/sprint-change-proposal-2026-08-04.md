# Sprint Change Proposal — Epic 1.5 prep before Epic 2

**Date:** 2026-08-04  
**Project:** finance-dashboard (finance-helper)  
**Trigger:** Epic 1 retrospective (`epic-1-retro-2026-08-04.md`)  
**Mode:** Incremental  
**Status:** Approved 2026-08-04 (Sebas)

---

## 1. Issue summary

Epic 1 shipped FR-1…FR-5 and tagged v0.1.0, but the retrospective committed **prep/hardening and process items** that were never turned into tracked stories. Continuing Epic 2 (shared lists / invites) would:

- Copy a known token-claim gap (`expires_at` not re-checked on claim) into invite tokens  
- Start membership ACL and verify-gate work without agreed contracts  
- Leave Sebas without an auth/mail interaction map / story-close how/why habit  

**Evidence:** `epic-1-retro-2026-08-04.md`; 10 open `action_items` in `sprint-status.yaml`; Story **2.1** already in `review` while 2.2+ are `ready-for-dev`.

**Decision (Sebas):** Insert **Epic 1.5**; park **2.1 in review**; do not start **2.2+** until Epic 1.5 critical path (1.5.1–1.5.5) is done. Include parallel stories 1.5.6–1.5.7. Light architecture spine addenda.

---

## 2. Impact analysis

### Epic impact

| Epic | Impact |
|------|--------|
| Epic 1 | Remains `done` — no reopen of product stories |
| **Epic 1.5 (new)** | Auth spine hardening & Epic 2 prep — 7 stories |
| Epic 2 | Queue paused after 2.1; sequencing note added; 2.1 stays `review` |
| Epics 3–5 | No content change |

### Story impact

| Stories | Change |
|---------|--------|
| 1.5.1–1.5.5 | **Critical path** — claim fix, auth/mail map + close process, verify-gate contract, ACL sketch, spine smoke |
| 1.5.6–1.5.7 | **Parallel** — rate limits; hex ports + Compose pytest ergonomics |
| 2.1 | Parked in `review` until critical path done |
| 2.2–2.6 | Unchanged text; blocked by sequencing until 1.5.1–1.5.5 done |

### Artifact conflicts

| Artifact | Change |
|----------|--------|
| PRD | None — MVP unchanged |
| `epics.md` | Epic 1.5 inserted; Epic List + Epic 2 sequencing |
| `ARCHITECTURE-SPINE.md` | Light addenda on AD-8, AD-19; Consistency Conventions row |
| UX | None |
| `sprint-status.yaml` | `epic-1-5` + seven stories + pause comment |

### Technical impact

- Code: claim helper / `expires_at` tests; optional rate limits and hex polish  
- Docs: auth/mail map; ACL + verify-gate contracts; smoke checklist  
- Process: story-close how/why overview before `done`  
- No deploy/stack change  

---

## 3. Recommended approach

**Selected:** Option 1 — **Direct Adjustment** (add Epic 1.5; pause Epic 2 queue).

| Option | Verdict |
|--------|---------|
| Direct Adjustment | **Selected** |
| Rollback | Not viable — do not revert Epic 1 or 2.1 |
| MVP Review | Not viable — MVP unchanged |

**Effort:** Medium · **Risk:** Low (sequencing + tracked debt)

---

## 4. Detailed change proposals (approved incrementally)

### 4.1 `epics.md` — [a] approved & applied

- Epic List: Epic 1.5 + Epic 2 sequencing note (incl. 2.1 park)  
- Full section: Stories 1.5.1–1.5.7 with AC  
- Epic 2 body: sequencing paragraph  

### 4.2 `ARCHITECTURE-SPINE.md` — [a] approved & applied

- AD-8 addendum: hash/TTL/`expires_at` on claim; shared helper; fail-loud SMTP  
- AD-19 addendum: one application-layer ACL path; 1.5 sketch → 2.x impl  
- Consistency: Auth email tokens row  

### 4.3 `sprint-status.yaml` — [a] approved & applied

```text
epic-1-5: backlog
1-5-1-token-claim-rechecks-expires-at: backlog
1-5-2-auth-mail-interaction-map-and-story-close-overview: backlog
1-5-3-invite-verify-gate-contract: backlog
1-5-4-membership-acl-enforcement-sketch: backlog
1-5-5-epic-1-spine-smoke: backlog
1-5-6-auth-smtp-rate-limit-hardening: backlog
1-5-7-hex-port-polish-and-compose-pytest-ergonomics: backlog
epic-1-5-retrospective: optional
# PAUSED: do not start 2.2+ until epic-1-5 critical path …; 2-1 stays in review
```

**Key naming:** `1-5-N-…` = Epic **1.5** story N (distinct from Epic 1 story 5: `1-5-config-gated-…`).

### 4.4 PRD / UX — skipped (no conflict)

---

## 5. Implementation handoff

**Scope classification:** **Moderate** — backlog reorganization (PO/DEV); then normal story cycle.

### Handoff

| Role | Responsibility |
|------|----------------|
| Product Owner / Sebas | Approve this proposal; prioritize Epic 1.5 over 2.2+ |
| Developer | `[CS]` create-story for `1.5.1` first → validate → `[DS]` → `[CR]`; continue through critical path, then parallel 1.5.6–1.5.7 as capacity allows |
| Architect | Support ACL sketch + verify-gate contract stories; keep spine addenda authoritative |
| QA | Own/execute 1.5.5 spine smoke |

### Success criteria

1. Epic 1.5 critical path (1.5.1–1.5.5) `done`  
2. Smoke checklist green on Compose  
3. Auth/mail map + contracts exist and are referenced from stories  
4. Only then: finish 2.1 review → resume 2.2+  

### Next workflow (after final approval)

1. Fresh chat: **`bmad-create-story`** for Story **1.5.1** (`1-5-1-token-claim-rechecks-expires-at`)  
2. Then validate → dev-story → code-review  
3. Do **not** create/start 2.2+ until critical path complete  

---

## Checklist completion

| Section | Status |
|---------|--------|
| 1 Trigger & context | Done |
| 2 Epic impact | Done (A + park 2.1) |
| 3 Artifacts | Done (light spine; no PRD/UX) |
| 4 Path forward | Direct Adjustment |
| 5 Proposal components | This document |
| 6 Final review | Approved (yes) |
