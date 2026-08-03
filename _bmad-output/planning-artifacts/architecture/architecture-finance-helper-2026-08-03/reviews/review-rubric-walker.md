# Architecture Spine Rubric Review — finance-helper

**Reviewer:** Independent rubric walker (subagent)  
**Artifact:** `ARCHITECTURE-SPINE.md` (draft, 2026-08-03)  
**Scope of review:** Spine file only — PRD/UX sources cited but not read for this pass  
**Date:** 2026-08-03

---

## Verdict

**Pass with fixes**

The spine is strong on hexagonal boundaries, import-session lifecycle, money/FX/settle math, and CI/parser policy. It would materially reduce epic/story divergence in those areas. It is **not yet safe to treat as complete** because several story-level divergence points are silent or deferred without guardrails, and the operational/environmental envelope is largely undecided.

---

## Rubric Walk

### 1. Fixes real divergence points for epics/stories; misses none that matter

| Area | Status | Notes |
| --- | --- | --- |
| Layering / dependency direction | **Fixed** | AD-1 + structural seed are clear and story-actionable |
| Process topology (sync vs worker) | **Fixed** | AD-2 locks v1 to in-process parse |
| Durable state / PDF storage | **Fixed** | AD-3 |
| Import Session staging & commit unit | **Fixed** | AD-4 |
| Money, splits, FX | **Fixed** | AD-5, AD-6, AD-7 |
| Auth cookie model (anti-Bearer) | **Mostly fixed** | AD-8 intent clear; implementation fork remains (see AD enforceability) |
| Individual review UX contract | **Fixed** | AD-9 |
| Same-price matching | **Fixed** | AD-10 |
| Parser CI / PII policy | **Fixed** | AD-11 |
| Visual authority | **Mostly fixed** | AD-12 is review-enforceable, not machine-enforceable |
| Git/CI/release process | **Fixed** | AD-13–15 |
| **Dedup identity & quarantine rules** | **Missing** | Referenced in domain, IDs convention, capability map — no AD. Two stories can implement incompatible dedup keys or quarantine vs reject behavior |
| **List ACL / authorization model** | **Missing** | AD-1 forbids UI→DB bypass but does not decide who may read/write which list, session, or ledger row |
| **Bank detect/split failure semantics** | **Partial** | Conventions say "fail-loud on unknown/ambiguous detect" but no AD binding detect→split→parse contract; adapter stories can diverge on partial success |
| **Bulk review gestures** | **Missing** | AD-9 covers Individual only; capability map includes bulk review |
| **Invite / password-reset token lifecycle** | **Missing** | Auth and invites in map; no expiry, single-use, or revocation rules |
| **Commit rollback scope** | **Partial** | AD-4 mentions "full batch rollback" but not partial rollback, post-commit correction, or idempotency of commit |
| **Settlement double-count** | **Deferred without guardrail** | See Deferred analysis — v1 settle-up epics may diverge |
| **Operational envelope** | **Silent whole** | See dimension coverage below |

**Finding (material):** Core financial and ingest pipeline divergence is well covered. Identity/dedup, authorization, quarantine, bulk review, and settle-up edge cases are the highest-risk gaps for parallel story work.

---

### 2. Every AD Rule is enforceable and prevents stated divergence

| AD | Enforceable? | Prevents stated divergence? | Gap |
| --- | --- | --- | --- |
| AD-1 | **Yes** — import lint, package boundaries, CI | **Yes** | — |
| AD-2 | **Yes** — `docker-compose.yml` service list | **Yes** | NFR-12 threshold undefined in spine; "measured pressure" is not a testable gate |
| AD-3 | **Yes** — schema review (no bytea), volume mounts | **Yes** | — |
| AD-4 | **Yes** — domain model + migration shape | **Yes** | Rollback partial vs full underspecified |
| AD-5 | **Yes** — types, schema, lint | **Yes** | — |
| AD-6 | **Yes** — domain unit tests | **Yes** | — |
| AD-7 | **Yes** — FX adapter + flags | **Yes** | — |
| AD-8 | **Partial** | **Partial** | Rule allows **JWT or opaque session id** and **reverse proxy or Next BFF** — two implementers produce incompatible session validation and cookie Path/SameSite wiring unless scaffold picks one |
| AD-9 | **Partial** — manual/a11y/e2e | **Yes** for stated UX fork | "Accessible non-gesture equivalents" needs acceptance criteria to be testable |
| AD-10 | **Yes** — server-side service + tests | **Yes** | — |
| AD-11 | **Yes** — fixture layout + CI gate | **Yes** | — |
| AD-12 | **Soft** — design review | **Mostly** | "Unstyled primitives only" is subjective without a component allowlist |
| AD-13 | **Yes** — branch protection / PR template | **Yes** | — |
| AD-14 | **Yes** — release tagging policy | **Yes** | — |
| AD-15 | **Partial** | **Mostly** | Coverage floor existence required but value deferred — enforceable only after scaffold sets a number |

**Finding:** AD-8 is the weakest adopted decision: it states what to prevent (Bearer in localStorage) but leaves two architectural forks that **will** cause integration divergence between auth middleware, cookie issuance, and UI fetch paths.

---

### 3. Deferred items — incompatible divergence risk

| Deferred item | Safe to defer? | Risk |
| --- | --- | --- |
| fastapi-users vs custom sessions | **Borderline** | AD-8 must be narrowed at scaffold; until then auth epics can diverge on JWT shape, refresh, and logout semantics |
| Redis / worker | **Yes** | AD-2 + NFR-12 trigger (once NFR-12 is defined) |
| Traefik vs Caddy | **Yes** | Same-origin cookie contract is the invariant; proxy choice is ops |
| Swipe vector mapping | **Yes** | Outcomes locked in AD-9 |
| Real-PDF harness layout | **Yes** | AD-11 policy locked |
| **Settlement payment vs statement double-count** | **No — should be AD or explicit v1 out-of-scope rule** | Settle-up is in v1 capability map; deferral without a v1 behavior rule lets ledger and settle math stories diverge incompatibly |
| User FX override | **Yes** | Explicitly excluded by AD-7 |
| CSV/HTML adapters | **Yes** | v1 PDF-only is clear |
| ML / trends | **Yes** | Out of v1 |
| UI coverage floor % | **Borderline** | AD-15 requires a floor; deferring the number is OK **only if** scaffold story is the single owner and blocks parallel UI epics until set |
| Playwright in CI | **Yes** | AD-15 explicitly not required |
| SemVer automation tool | **Yes** | AD-14 policy locked |

**Finding (material):** Settlement double-count is the clearest "should have been an AD" deferral given v1 settle-up scope.

---

### 4. Named tech — verified-current / pinning

| Observation | Severity |
| --- | --- |
| Spine states versions "verified 2026-08-03" with pointer to `stack-options.md` | **Good** |
| Versions use minor ranges (`0.141.x`, `16.2.x`) not exact pins | **Info** — spine explicitly says code owns pins at scaffold; acceptable at spine altitude |
| Python `3.12+` is open lower bound | **Info** — flag for reproducible CI once scaffold lands |
| AD-8: "fastapi-users **or** custom argon2" — library not pinned | **Info** — intentional deferral |
| Host reverse proxy "Traefik/Caddy-class" — not a pinned product | **OK** — deferred |
| PostgreSQL `postgres:16` — major pin only | **Info** — patch drift possible; normal for Compose |

**Finding:** No stale or hallucinated version claims detected within the spine. Pin precision is appropriately deferred to scaffold with explicit note. Not a blocker.

---

### 5. Spec capability coverage (spine-internal evidence only)

Sources bound: PRD, EXPERIENCE, DESIGN, stack-options. Capability map present.

| Capability (from map) | Governed? |
| --- | --- |
| Auth signup/signin/reset | AD-8, AD-1 |
| Lists, membership, splits | AD-1, AD-5, AD-6 — **ACL not governed** |
| Detect/split/parse/normalize | Paradigm, AD-2, AD-11 — **detect contract thin** |
| Import Session review (bulk/individual) | AD-4, AD-9 — **bulk not in AD-9** |
| Commit / dedup / quarantine / rollback | AD-3, AD-4 — **dedup/quarantine rules missing** |
| PDF failure comparison | AD-3, AD-12 |
| Same-price conflicts | AD-10 |
| Settle-up / simplify CRC | AD-5, AD-6, AD-7 — **double-count open** |
| Invites email | AD-8 only — **invite token rules missing** |
| Operator deploy | AD-2, AD-3 — **ops envelope thin** |

FR references embedded in ADs: FR-1–4, FR-17–18, FR-22, FR-40 — suggests PRD traceability for those items.

**Finding:** Cannot confirm full PRD coverage without reading PRD. From spine self-consistency, v1 slice capabilities are mapped but several mapped areas lack governing ADs (dedup, quarantine, bulk review, invites, settle edge case).

---

### 6. Dimension coverage — decided, deferred, or open

| Dimension | Status |
| --- | --- |
| Paradigm / layering | **Decided** |
| Service topology | **Decided** (AD-2) |
| Persistence model | **Decided** (AD-3) |
| Domain aggregates | **Decided** (Import Session ER) |
| Money / FX / splits | **Decided** |
| Auth transport | **Decided** (cookie); **implementation fork open** |
| Review UX (individual) | **Decided** |
| CI / TDD / branching / versioning | **Decided** |
| Visual system | **Decided** (AD-12) |
| **Environments** (dev/stage/prod) | **Silent** |
| **Deployment procedure / upgrades** | **Silent** — Compose mentioned, no migration-on-deploy AD |
| **Backups** (Postgres + PDF volume) | **Silent** |
| **Health checks / readiness** | **Silent** |
| **Observability** (metrics, tracing, alerting) | **Silent** — logging convention only |
| **Secrets rotation** | **Partial** — "secrets via Compose env" in conventions |
| **SSL/TLS termination** | **Partial** — Secure cookie assumes HTTPS; no AD on cert/proxy TLS |
| **Database migrations policy** | **Silent** — Alembic in stack, no AD on backward compatibility or rollback |
| **API error/versioning contract** | **Partial** — structured JSON mentioned; no versioning |
| **Concurrency** (multi-user same session) | **Silent** |
| **Pagination / performance budgets** | **Silent** — NFR-12 referenced but not defined |
| **i18n implementation** | **Decided** (EN+ES in ui) |
| **Data retention / GDPR-style delete** | **Silent** |

**Finding (material):** Operational/environmental envelope is the largest silent whole. For a self-hosted Compose feature at this altitude, at minimum **environments, migration-on-deploy, backup scope, and health/readiness** should be decided, deferred with invariants, or listed as open questions.

---

## Prioritized Findings

### P0 — Block parallel settle-up / ledger stories until resolved

1. **Settlement double-count deferred without v1 rule** — Capability map includes settle-up; Deferred table punts `[OPEN — v2 settlement]`. Add AD or explicit v1 exclusion: e.g., "v1 settle math includes only committed ledger entries; manual settlement payments are out of scope."

### P1 — Likely story divergence if not fixed before scaffold

2. **No AD for dedup identity and quarantine** — Canonical identity keys referenced "per PRD" but not in spine rules. Two parsers/commits can disagree on duplicate detection and quarantine promotion.

3. **AD-8 implementation fork** — JWT vs opaque session and proxy vs BFF are both allowed. Narrow at scaffold (single AD addendum or Deferred → decided) to prevent auth integration drift.

4. **List ACL / authorization model absent** — Membership exists in ER diagram; no rule for read/write on lists, sessions, statements, or ledger rows.

5. **Operational envelope largely silent** — No decision/deferral/open-question on environments, backups, migrations-on-deploy, health checks, or observability. Self-hosted operator stories will invent incompatible runbooks.

### P2 — Strengthen before epic breakdown

6. **Bulk review not governed** — AD-9 covers Individual only; add AD or extend AD-9 for bulk selection/commit semantics.

7. **Bank detect/split contract thin** — Fail-loud is in conventions; adopt as AD with detect output shape and ambiguous-bank behavior.

8. **Invite and password-reset token lifecycle** — Needed for auth/invite epics (expiry, single-use, invalidation).

9. **NFR-12 undefined** — AD-2 worker escape hatch is not testable without the NFR in spine or companion.

10. **Commit/rollback idempotency and partial rollback** — AD-4 should state whether re-commit, partial discard, and post-commit correction are allowed in v1.

---

## Recommendations (minimal fixes for pass)

1. Add **AD-16 — Dedup & quarantine**: canonical identity key source, duplicate-on-commit behavior, quarantine vs hard-reject.
2. Add **AD-17 — List authorization**: role-capability matrix (creator, member, non-member) for list/session/ledger operations.
3. Resolve **settlement double-count** as AD or explicit v1 out-of-scope (do not leave in Deferred without v1 guardrail).
4. Add **Ops & environments** section: decide or defer-with-invariant at least `{dev, prod}`, Alembic upgrade on deploy, backup scope (Postgres + PDF volume), `/health` endpoints.
5. At scaffold, **close AD-8 fork**: pick `{fastapi-users | custom}`, `{JWT | opaque}`, `{proxy | BFF}` — document as scaffold decision checklist, not parallel options.
6. Extend **AD-9 or new AD** for bulk review; define **NFR-12** or remove worker trigger until defined.

---

## Summary Scorecard

| Criterion | Result |
| --- | --- |
| Divergence points for epics/stories | **Partial pass** — core ingest/money strong; identity/auth/settle/ops gaps |
| AD enforceability | **Partial pass** — AD-8 fork; AD-12 soft |
| Deferred safety | **Fail on settlement double-count**; borderline on auth library |
| Tech verification | **Pass** — ranges noted, verification date present |
| Spec capability coverage | **Partial pass** (spine-only assessment) |
| Dimension completeness | **Fail on ops/environments** |

---

*End of rubric review.*
