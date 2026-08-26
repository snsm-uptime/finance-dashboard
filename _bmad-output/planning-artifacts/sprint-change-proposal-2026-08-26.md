---
date: '2026-08-26'
user_name: Sebas
project_name: finance-helper
trigger: Rethink list settle UX — viewer pairwise grid, simplify group plan, copy to share, “I already paid my side”
mode: incremental
scope_classification: moderate
status: approved
---

# Sprint Change Proposal — 2026-08-26

## 1. Issue Summary

Epic 5 Story 5.8 (“Settle-up simplify”) and FR-41 already promised **fewer suggested transfers** without recording bank payments. UX-DR4 and Stories 3.3–3.4 specified a **single who-line + hero amount**. That is not the settle surface we want.

**Product intent (locked this session):**

1. **Balance component (default):** three columns from the **signed-in member’s** perspective:
   - **You are owed** — other members who owe the viewer (CRC + name)
   - **You owe** — other members the viewer owes (CRC + name)
   - **Balance** — viewer’s signed net vs the rest of the list
2. **Simplify:** a **group transfer plan** that preserves everyone’s net and reduces the number of payments (e.g. viewer pays A only; B pays A a smaller amount instead of viewer paying both).
3. **Copy:** reuse existing `ui/components/CopyButton` to copy the group plan as **plain text** for sharing outside the app.
4. **Settle meaning:** when a user **settles**, it is assumed they **already paid** the people they owed. **Their payable side is clean.** Remaining “you are owed” (and the group plan’s inbound edges) is what later **remind-to-pay notifications** will target. v1 still does **not** record bank/card settlement lines; this is a **viewer-side “my payables are done”** product rule so notifications have a clean split later.

**Discovered:** stakeholder clarification during Correct Course (not a failed 5.8 implementation — 5.8 is still backlog). Stories 3.3 and 3.4 are **done**; their AC are updated for **traceability only**.

## 2. Impact Analysis

### Epic Impact

- **Epic 5** stays the last planned epic. **5.8 is the implementation story.** 5.1–5.7 (import/conflicts) unchanged. 5.9 period selector unchanged.
- **Epic 3** not reopened. Domain nets (`member_id → CRC`) remain; **pairwise viewer-vs-member edges** and **min-transfer group plan** are new domain in 5.8.
- **No new epic** for notifications. Document a **future** remind-to-pay capability that reads “viewer has settled payables / still owed.”
- Epic order unchanged: do not run 5.8 before 5.5/5.7 (Simplify stays blocked while same-price conflicts remain).

### Story Impact

| Story | Change |
|---|---|
| **5.8** (backlog) | **Rewrite AC:** 3-column grid, Simplify → group plan, CopyButton plain text, settle = payables already paid / viewer ledger clean for “You owe,” inbound balances remain for later notify |
| 5.1–5.7, 5.9 | No functional change |
| **3.3, 3.4** (done) | **Docs only:** strip anatomy and “who-owes-whom UI” defer to 5.8; 3.4 math unchanged |

### Artifact Conflicts

- **PRD FR-41:** expand beyond “how much each person needs to pay.”
- **UX-DR4 + DESIGN `balance-strip` + EXPERIENCE J2:** replace single hero amount; Simplify/copy are real controls; J2 may skip Simplify that night.
- **ARCHITECTURE AD-21:** keep “no payment *ledger* / no bank settlement writes in v1.” **Narrow:** allow a **computed + optional persisted viewer settle assertion** (“I have paid my counterparties”) so the payable column can clear and notifications can be designed later. Do **not** treat Copy or Simplify as “marked paid.”
- **Spec CAP-11:** align if it still says “settle-up CRC with Simplify (suggestion only)” without pairwise grid / payable-clean settle.

### Technical Impact

- **Domain:** pairwise aggregation (viewer vs each member) plus a **simplify** function (min-transfer / fewer edges, nets preserved). Existing `compute_settle_balance_for_list_members` is **necessary but not sufficient**.
- **API:** read models for pairwise columns + group plan; **if** “I settled my payables” is persisted in v1, a small write (not a full payment journal). Prefer persisting enough that a later notify job can query “who still owes this member.” If persistence is deferred, 5.8 still implements UI + copy; write path is an explicit 5.8 spike/decision in Dev Notes.
- **UI:** extend or replace `BalanceStrip`; wire **Simplify**; **CopyButton** already exists — do not add a second copy component.
- **No** Compose/stack change. **No** rollback of Epic 3/4.

## 3. Recommended Approach

**Direct Adjustment** (Option 1). Not rollback. Not MVP shrink.

- FR-41 was always this epic’s job; we are **specifying** it.
- **Effort:** Medium (new settle presentation + pairwise/simplify math; CopyButton reuse).
- **Risk:** Low–medium. Medium only if we persist “payables settled” without a careful model (double-count vs v2 payments). Mitigation: AD-21 stays “no bank settlement lines”; settle assertion is **viewer payable-clear**, not “the other person received money in-app.”
- **Timeline:** 5.8 grows; no epic reshuffle.
- **Notifications:** out of 5.8 **send** path; 5.8 must **leave a clean split** (viewer payables done vs still owed to viewer).

## 4. Detailed Change Proposals

### Stories

**Story 5.8** — approved rewrite (title, story, AC): pairwise 3-column layout (You are owed | You owe | Balance); Simplify → group plan preserving nets; CopyButton copies plain-text plan; incomplete conflicts block Simplify; no “paid” copy; **plus:** choosing **Settle** means the viewer **already paid** “You owe” counterparties; after settle, **their payable list is clean**; remaining **You are owed** (and plan edges toward them) is the reminder surface for a **later** notification feature.

**Stories 3.3 / 3.4** — approved **documentation only** (already `done`).

### PRD

**FR-41** — approved: viewer-centric columns; group plan; plain-text copy; no payment journal on simplify/copy. **Add:** settle assumes the actor has paid their payables; ledger is clean **for them**; remaining inbound balances support future pay-up reminders.

### Architecture

**AD-21 addendum** — approved: pairwise + simplify **computed** in domain; copy is clipboard-only. **Add:** v1 may persist a **viewer payable-settled** assertion for later notifications; must **not** write inter-member transfer lines as if money moved in the app.

### UI/UX

**UX-DR4 / DESIGN balance-strip / EXPERIENCE J2** — approved 3-column island; Simplify + CopyButton; J2 may omit Simplify for a balances-only night. **Add:** post-settle, “You owe” is empty/clean for that viewer; “You are owed” remains the remindable set.

## 5. Implementation Handoff

**Scope: Moderate** — backlog + planning artifacts, then Developer implements **5.8** (not a PM/Architect replan of the whole product).

| Role | Responsibility |
|---|---|
| **PO / this workflow** | Apply approved edits to `epics.md`, PRD FR-41, UX-DR4, DESIGN, EXPERIENCE, ARCHITECTURE-SPINE, sprint-status 5.8 title if needed |
| **Developer** | Implement 5.8: pairwise grid, simplify plan, CopyButton, settle = payable-clean for current user; no bank settlement ledger; no second CopyButton |
| **Later (not 5.8)** | Notify members who still owe a user who has settled their own payables |

**Success criteria**

- List detail strip matches the 3-column layout (CRC, owe/owed color).
- Simplify shows a shorter **group** plan; nets unchanged if dismissed.
- Copy puts a readable plain-text plan on the clipboard via existing CopyButton.
- After Settle, viewer **You owe** is clean; **You are owed** remains; app does not claim others have paid.
- Same-price incomplete period: no confident Simplify (existing 5.5/5.7).
- 3.3/3.4 remain done; no Epic 3 rewrite.

**Open decision for 5.8 Dev Notes (do not block backlog edit):** persist payable-settled in v1 vs UI-only until a notifications story. Recommendation: **persist a minimal assertion** if we want notifications without a rewrite; otherwise document the invariant only.
