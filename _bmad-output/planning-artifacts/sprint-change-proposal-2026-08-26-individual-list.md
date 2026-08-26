---
date: '2026-08-26'
user_name: Sebas
project_name: finance-helper
trigger: Solo lists still render settle-up; product wants member-count UI (individual-list) as a post-v1 epic
mode: incremental
scope_classification: moderate
status: approved
---

# Sprint Change Proposal — 2026-08-26 — individual-list

## 1. Issue Summary

**Problem:** A list with one member still uses the **shared settle** surface (split, sharing costs, You are owed / You owe / Balance on the list). That job is wrong for a personal list. The user needs **spend by origin** (how much went on each card/cash/blank this cycle), then **budgets** (list, caps, detail + related history)—not household settle-up.

**Discovered:** Product request during Correct Course (2026-08-26). Not a failed story. Trigger context is **Epic 3** list detail (3.3 / 3.4) plus **FR-5** personal list on signup. UX already hides the split menu when `member_count == 1`; that is not a personal dashboard.

**Evidence:**

- PRD: one list entity; v1 success is **one shared-expenses view**; personal dashboards are **Out for v1**.
- User lock: keep that Out; add **post-v1** individual-list; UI follows **member count**; shared-list budgets later; **loans out**; period = **statement cycle** (FR-39); budget attribution = **manual and rules, both later**.

**Does not replace** the same-day proposal on settle pairwise grid / simplify (`sprint-change-proposal-2026-08-26.md`). That work stays **shared-list / Epic 5.8**.

## 2. Impact Analysis

### Epic impact

- **Epics 1–5:** Complete as planned. v1 MVP unchanged.
- **Epic 3–5:** Add **deferral notes** only: solo individual-list UI is **Epic 6 (post-v1)**. Do not reopen 3.3/3.4. Story **4.12** may still land on the settle strip in v1.
- **New epic:** **Epic 6 — individual-list**, after Epic 5, **backlog**.
- **Order:** Do not reshuffle v1. Do not start Epic 6 until v1/Epic 5 policy says so.

### Story impact

| Story | Change |
|-------|--------|
| 3.3, 3.4 | Deferral note only |
| 4.12 | Deferral: landing on settle strip OK until Epic 6 |
| 5.7–5.9 | Deferral: incomplete / simplify / cycle selector remain **shared-mode**; cycle selector **reused** in 6.2 |
| 6.1–6.5 | **New** (see §4) |

### Artifact conflicts

- **PRD:** Keep Out-for-v1 personal dashboards. Amend *Lists* (same entity; **jobs** follow member count). Add **post-v1 individual-list** FRs. Do not move this into In for v1.
- **Architecture:** Additive read model + budget records. No stack change. AD-21 unchanged. No `list_kind` column required.
- **UX:** DESIGN “settle strip first” applies to **`member_count ≥ 2`**. Solo: origin cards; tabs; hide settle chrome. New journeys/addendum when epic is pulled. Warm Balance stays.
- **sprint-status.yaml:** Add `epic-6` + 6.1–6.5 as `backlog` **after approval** (checklist 6.4).
- **project-context.md / SPEC:** Refresh at implementation time.

### Technical impact

- UI/API branch on live membership count.
- Spend-by-origin aggregation over committed lines in the selected **statement cycle**.
- Budget tables; attribution engine **later in epic**.
- No Compose/CI/infra change. No payment ledger.

## 3. Recommended Approach

**Selected: Option 1 — Direct adjustment** (new epic + planning updates).

- **Rollback:** Not viable — shared settle must remain.
- **MVP review:** Confirm **MVP unchanged**; this is **post-v1**, not a v1 cut or inflate.

**Rationale:** Household v1 stays the spine. Individual-list is a second **mode** on the same list entity, specified now so v1 stories do not accidentally invent a personal dashboard.

**Effort:** Docs/backlog Low–Medium now; implementation High when Epic 6 is pulled. **Risk to v1:** Low.

**Timeline:** No change to Epic 5 sequence.

## 4. Detailed Change Proposals

Approved incrementally this session (PRD → architecture → UX → epics).

### PRD

**Lists:** One entity. **Chrome and jobs** follow member count: `1` → individual-list (post-v1); `≥ 2` → shared settle (v1). Same-entity still allows a future trends dashboard across lists.

**Out for v1:** Keep “Trends and analytics dashboards, and personal-spending dashboards beyond the single shared-expenses view.”

**Post-v1 (new subsection, not In for v1):**

- Solo: no split/settle/simplify; default hero **spend by origin** for the **statement-cycle** period.
- Solo budgets: tab, caps, near-cap, detail + related transactions.
- Attribution: **manual and rules — both later** in Epic 6.
- Second member → shared settle chrome; budgets not primary UI in this epic.
- Loans out. Shared-list budgets/dashboards later than Epic 6.

### Architecture

- Mode ≠ list kind; `member_count` selects read model (settle vs spend-by-origin).
- Origin totals = **period spend**, not issuer balance / minimum due.
- Line inclusion: spend-oriented (FR-45 spirit), not who-owes-whom.
- Budgets: list-scoped name + cap + currency; attribution later.
- Invite/membership insert is the mode flip.

### UX DESIGN + EXPERIENCE

- Settle-strip-first only for `≥ 2` members.
- Solo: origin cards; Budgets tab; hide Adjust split, simplify, copy plan, Settle, owed grid.
- Focus order: cycle → origin cards → tabs → receipts.
- v1 J1–J7 / `list-settle.html` unchanged for household.

### Epics

**Deferral** on 3.3, 3.4, 4.12, 5.7–5.9.

**Epic 6 — individual-list** (after 5):

| Story | Intent |
|-------|--------|
| 6.1 Mode switch | Branch on live member count; hide/restore shared chrome |
| 6.2 Spend by origin | Per-origin period spend; statement-cycle selector |
| 6.3 Budget list | Solo tab: name, cap, near-cap |
| 6.4 Budget detail | Cap + related history (empty until attribution) |
| 6.5 Attribution | Manual assign **and** rules (split 6.5a/6.5b if needed) |

**Out of Epic 6:** loans; shared-list budgets; recording payments; v1 settle rewrite.

## 5. Implementation Handoff

**Scope: Moderate** — backlog + planning artifacts; not a v1 replan; not “just implement.”

| Role | Responsibility |
|------|----------------|
| **PO / Dev (planning)** | Apply §4 to `prd.md`, architecture spine, UX spines, `epics.md`. Add Epic 6 to `sprint-status.yaml` as backlog. |
| **UX** | individual-list addendum / mock when epic is pulled. |
| **Developer** | Do **not** implement Epic 6 in the current v1 sprint. Honor deferral notes. Implement 6.x only after create-story when Epic 6 is in-progress. |
| **PM / Architect** | No escalation. Stack and AD-21 unchanged. |

**Success criteria**

- v1 still ships shared settle only.
- Planning docs describe individual-list as **post-v1 Epic 6**.
- sprint-status lists epic-6 + 6.1–6.5 `backlog`.
- No loans; no shared-list budget UI in Epic 6.

**Next after approval:** Planning artifacts applied 2026-08-26 (`prd.md`, `ARCHITECTURE-SPINE.md`, UX spines, `epics.md`, `sprint-status.yaml`). Implementation of Stories 6.1–6.5 waits until Epic 6 is pulled.
