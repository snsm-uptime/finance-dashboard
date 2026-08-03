# UX ↔ Architecture Spine Reconciliation

**Date:** 2026-08-03  
**Scope:** `EXPERIENCE.md`, `DESIGN.md` vs `ARCHITECTURE-SPINE.md`  
**Question:** Which UX interaction/visual constraints did Architecture Decisions (ADs) adopt, drop, or contradict?

---

## Verdict

**Mostly aligned at policy level; thin on UX binding.**

The spine correctly cites EXPERIENCE and DESIGN as sources and locks three UX-facing ADs (AD-9 review gestures, AD-12 visual authority, AD-10 same-price server window). Everything else in the UX spines—IA, flow choreography, component behavior, token-level visual system—is **referenced but not architecturally enforced**. Implementation can drift unless builders treat EXPERIENCE/DESIGN as binding companions (per AD-12) rather than optional style guides.

**Risk:** AD-12 delegates all appearance to UX files without elevating critical interaction bans (no settlement recording, no keep-both, card-registration gate) to AD status. Those rules exist only in EXPERIENCE behavioral tables.

---

## What Landed in the Spine

| UX source | Spine adoption | Where |
|---|---|---|
| Phone swipe / desktop buttons for Individual review | **AD-9** — true swipes on phone; buttons primary on desktop; same three outcomes; list picker before high-intent accept; WCAG 2.2 AA equivalents | AD-9 |
| Warm Balance + Soft-Ledger visual ownership | **AD-12** — UX files own appearance; kits = unstyled primitives only | AD-12 |
| Same-price candidate computation | **AD-10** — server-side equal amount+currency; list-configurable window; default ±3 calendar days | AD-10 |
| EN + ES from v1 | Consistency row `i18n` | Consistency Conventions |
| Import Session staging (review before commit) | **AD-4** — aligns with EXPERIENCE upload→review→commit flows | AD-4 |
| Quarantine as durable state | **AD-3** — Postgres owns quarantine flags | AD-3 |
| PDF comparison tooling | Capability map — `ui` + react-pdf | Capability → Architecture Map |
| Exact swipe direction mapping | Explicitly **deferred** — outcomes locked, vectors open | Deferred |
| No settlement recording in v1 | Aligned via deferred v2 settlement item | Deferred |

---

## Interaction & Behavior — Dropped from ADs

These EXPERIENCE constraints are **not** elevated to ADs or capability-map rules. They rely entirely on EXPERIENCE.md remaining authoritative.

### Information architecture & navigation

| UX decision | EXPERIENCE source | Spine status |
|---|---|---|
| First paint → remembered last-opened list; fallback Lists homepage | IA table, State Patterns | **Dropped** — no AD, no convention |
| Global Upload entry + list-scoped Bulk pre-select only | IA, Component Patterns, J1 | **Dropped** — Individual default destination unchanged not in spine |
| Bulk vs Individual review mode split | IA, J1 | **Dropped** — only Individual gestures in AD-9 |
| Three-tab chrome: List / Upload / Account | Implied by journeys | **Dropped** — DESIGN tab bar not referenced |
| No distribution dashboard tab in v1 | Responsive & Platform | **Dropped** |
| Account menu: sign out + password reset only; no profile/settings | IA, Component Patterns | **Dropped** |
| Invitee signup lands on inviting list (not blank home) | J4 Act B | **Dropped** |
| Post-import landing on list user mostly fed | J1 step 8 | **Dropped** |

### Review & ingest flows

| UX decision | EXPERIENCE source | Spine status |
|---|---|---|
| Parse comparison layout: extracted above, PDF lower half | Component Patterns, J3 | **Dropped** — react-pdf mentioned; layout not bound |
| Parse failure is statement-scoped; siblings continue | State Patterns, J3 | **Dropped** |
| Accept-with-quarantine: good rows import; statement marked incomplete | State Patterns, J3 | **Partial** — quarantine in AD-3/AD-4; UX choreography not bound |
| Card registration **blocks** review until label + IBAN saved | Component Patterns, J6 | **Dropped** |
| Card registration fields: user label + IBAN only; routing after prompt | J6 | **Dropped** |
| Import commit summary: imported N / skipped M → conflicts → land | State Patterns, J1 | **Dropped** |
| Same-price UI: Manual **or** Parsed cards; **no keep-both** | J7, Interaction Primitives, Banned | **Dropped** — AD-10 covers server candidates only |
| Same-price: card picker, **not swipe** | J7 interaction note | **Dropped** |
| Same-price conflicts must resolve before confident settle-up | State Patterns | **Dropped** |
| High-intent accept: list picker **before** accept gesture | J1, Interaction Primitives | **Partial** — mentioned in AD-9 text but not as separate invariant |
| Review skip/dismiss; remaining statements continue | State Patterns | **Dropped** |
| Shallow modal/sheet stacks (blocking interrupts only) | Interaction Banned | **Dropped** |

### Shared-expenses & settle surface

| UX decision | EXPERIENCE source | Spine status |
|---|---|---|
| Settle-up strip is hero; receipts newest-first below | IA, J2 | **Dropped** — layout not in spine |
| Settle-up strip is **not** a settlement-recording control | Component Patterns, Voice | **Dropped** — critical product boundary not an AD |
| Incomplete-period quarantine disclosure on strip/period | Component Patterns, State Patterns | **Dropped** |
| Zero net / settled state without celebration chrome | State Patterns | **Dropped** |
| Simplify: never “paid”; must not look like settlement recording | Voice, Spine-only backlog | **Dropped** — deferred v2 settlement only tangentially related |
| Manual expense: payer defaults to signed-in user; list default split | J5 | **Dropped** — AD-6 covers split remainder math only |
| FX rows show enough original + converted CRC to audit | Receipt row pattern | **Partial** — AD-7 covers BCCR math; display rules not bound |
| Receipt tap → item detail/edit when those exist | Component Patterns | **Dropped** |

### Accessibility & i18n (behavioral)

| UX decision | EXPERIENCE source | Spine status |
|---|---|---|
| WCAG 2.2 AA full floor (contrast, focus, SR announcements) | Accessibility Floor | **Partial** — AD-9 mentions AA for review equivalents only |
| Screen reader: announce surface + list context on navigation | Accessibility Floor | **Dropped** |
| Quarantine disclosure announced, not color-only | Accessibility Floor | **Dropped** |
| Focus order: strip → receipts; comparison regions labeled | Accessibility Floor | **Dropped** |
| Reduce Motion: no required motion for review/conflict/quarantine | Accessibility Floor | **Dropped** |
| Invite + error templates in EN and ES | Internationalization | **Partial** — i18n row covers UI strings; email templates not explicit |
| Locale switcher without full settings surface | Open gaps | **Dropped** |
| Card user labels free text, not translated | Internationalization | **Dropped** |

### Voice & copy constraints

| UX decision | EXPERIENCE source | Spine status |
|---|---|---|
| Plain + direct; no bank jargon / product codes in labels | Voice, Inspiration | **Dropped** |
| No peer blame copy | Voice | **Dropped** |
| Never say “paid” for Simplify | Voice | **Dropped** |
| `{colors.owe}` / `{colors.owed}` in copy examples | Voice | **Visual** — DESIGN only via AD-12 delegation |

### Spine-only backlog (explicitly un-journeyed)

These remain open in UX and are **correctly absent** from spine ADs, but builders should not infer v1 scope:

- Simplify surface placement and microcopy
- Multi-cycle statement selector
- Reassign statement / rollback import batch (UX mentions; spine has rollback in capability map without UX flow)
- Bulk assign full session narrative
- Desktop upload session (buttons decided; flow not journeyed)
- Item-level split override + payer edit
- Standalone auth screens (signup/sign-in/reset outside invite)
- Keep-both reinstatement

---

## Visual & Layout — Dropped from ADs

AD-12 says DESIGN.md / EXPERIENCE.md own appearance but **does not enumerate** enforceable visual constraints. Everything below is UX-only unless implementation reads DESIGN directly.

### Design tokens & typography

| UX decision | DESIGN source | Spine status |
|---|---|---|
| Full Warm Balance palette (10 light + 10 dark roles incl. owe/owed) | Colors frontmatter + section | **Dropped** — AD-12 name-only |
| Petrona (amounts/brand) + Manrope (UI); **no Inter/Roboto as brand** | Typography | **Dropped** |
| Tabular nums on all money | Typography | **Dropped** |
| Medium-light weights 400–550; not Canonical 650–700 bold | Typography | **Dropped** |
| Strip who-line sentence case (not uppercase tracked caps) | Typography | **Dropped** |
| Spacing rhythm (~4px), strip-inset, page-gutter, row-y tokens | Spacing frontmatter | **Dropped** |
| Rounded: sm 8px, md 10px, lg 12px; **no pill CTAs** for primary | Shapes | **Dropped** |

### Layout & composition

| UX decision | DESIGN source | Spine status |
|---|---|---|
| Soft-Ledger hybrid: inset strip **island** + transparent receipt zone on canvas | Layout & Spacing | **Dropped** |
| List surface order: balances first, receipts newest-first | Layout & Spacing | **Dropped** |
| Top nav: transparent, brand left / list title right, no bottom rule | Components.top-nav | **Dropped** |
| Balance strip: two-column grid (who+amount \| primary CTA column) | Components.balance-strip | **Dropped** |
| Receipt rows: bottom hairline only, airier padding | Components.receipt-row | **Dropped** |
| Tab bar: 3 equal columns, surface + top hairline | Components.tab-bar | **Dropped** |
| Hint line under strip (muted, same inset) | Components.hint | **Dropped** |
| Depth via tonal layering; **no drop shadows** on primary chrome | Elevation & Depth | **Dropped** |
| Desktop: same IA, wider Soft-Ledger — not separate visual system | Layout & Spacing | **Dropped** |
| Incomplete disclosure below island strip, not over amount | Components incomplete | **Dropped** |
| Lists homepage: owe/owed balance scan, Warm Balance tokens | Lists homepage glimpse | **Dropped** |
| Follow system light/dark; both token sets ship | Appearance | **Dropped** — not in ADs |
| No shadcn/kit defaults as brand | DESIGN + AD-12 | **Partial** — AD-12 covers kits; shadcn called out in DESIGN only |

### Component visual bans

| UX decision | DESIGN source | Spine status |
|---|---|---|
| Never label CTA “paid” / “mark settled” | Button-primary | **Dropped** |
| Accent for actions/tabs only — not body fills | Colors rules | **Dropped** |
| Borders 1px Warm Balance — no Dense Ink 2px register | Colors rules | **Dropped** |
| No purple finance clichés, cool slate brand, celebration blotches | Avoid list | **Dropped** |
| Receipt amounts muted color in Soft-Ledger (polarity reserved for strip) | Receipt row | **Dropped** — tension with EXPERIENCE FX audit display (see Contradictions) |

---

## Contradictions & Tensions

### 1. Balance strip “primary CTA” vs non-settlement strip (DESIGN ↔ EXPERIENCE)

- **DESIGN** `balance-strip` anatomy includes a **primary CTA** grid column and `button-primary` on the strip.
- **EXPERIENCE** defines the settle-up strip as informational (“Not a settlement-recording control”) and J2 is balances-only with no action.
- **DESIGN** mitigates with “Never label … paid/mark settled” and “List strip may omit a primary CTA when the amount itself is the climax.”
- **Spine:** silent. No AD resolves when CTA is present vs omitted.

**Severity:** Medium — implementers may add a settlement-like button unless EXPERIENCE ban is treated as binding.

### 2. Same-price: UX narrows PRD; spine only specifies server window (EXPERIENCE ↔ AD-10)

- **EXPERIENCE J7** explicitly drops **keep-both** from UI (“conflicts with PRD triad; UX narrows here”).
- **AD-10** defines candidate computation and date window only — no UI outcome constraint (Manual vs Parsed vs keep-both).
- **Risk:** API could expose keep-both if PRD still allows it, while UX forbids it in UI.

**Severity:** Medium — needs explicit API/UI contract or AD extension.

### 3. AD-10 list-configurable ±3-day window — absent from EXPERIENCE J7

- **Spine** adds list-configurable match window with ±3-day default.
- **EXPERIENCE** describes conflict picker UX but **never mentions** the temporal window or configurability.
- **Not a direct contradiction** — UX is silent; architecture added server rule UX did not journey. Operators/users may expect conflicts only when dates “feel” close; ±3 days is an undisclosed product rule.

**Severity:** Low — document in UX or accept as backend-only policy.

### 4. Split remainder to list creator (AD-6) — absent from UX

- **Spine AD-6:** leftover minor unit after percentage splits goes to **list creator**.
- **EXPERIENCE J5** uses even split defaults; no mention of remainder allocation or creator privilege.
- **Not contradictory** unless UX later specifies different remainder policy.

**Severity:** Low — domain rule UX didn't specify.

### 5. Receipt amount color muted vs FX audit readability (DESIGN ↔ EXPERIENCE)

- **DESIGN:** receipt row amounts use `{colors.muted}`.
- **EXPERIENCE:** FX rows must show enough original + converted CRC **to audit**.
- Compatible if both amounts are legible at AA contrast, but muted styling may under-emphasize audit-critical figures relative to strip hero amounts.

**Severity:** Low — design assumption, not hard conflict.

### 6. WCAG scope split (EXPERIENCE ↔ AD-9)

- **EXPERIENCE:** WCAG 2.2 AA across **all** phone/desktop surfaces.
- **AD-9:** WCAG 2.2 AA explicitly for **review accessible equivalents** only.
- **DESIGN** repeats full-product AA floor.
- **Spine under-specifies** accessibility relative to UX/DESIGN.

**Severity:** Medium — merge gate (AD-15) has no a11y CI requirement.

### 7. “Spines win on conflict” hierarchy

- **EXPERIENCE** and **DESIGN** both state UX spines beat mocks/wireframes.
- **ARCHITECTURE-SPINE** lists UX files as sources but does not state rank vs architecture ADs.
- When AD-10 adds rules UX never stated, **architecture wins by default** — acceptable for build substrate, but UX authors may assume symmetric authority.

**Severity:** Low — process clarity gap.

### 8. User FX override

- **Spine AD-7:** no user/operator FX override in v1.
- **UX:** silent on override — aligned by omission.

---

## AD Coverage Summary

| AD | UX coverage |
|---|---|
| AD-1 ui→HTTP only | Neutral — no UX conflict |
| AD-2 in-process parse, no worker | Neutral |
| AD-3 Postgres + PDF volume | Partial — quarantine UX choreography missing |
| AD-4 Import Session | Partial — flow steps not bound |
| AD-5 Money Decimal | Partial — FX display not bound |
| AD-6 Split remainder | UX silent |
| AD-7 BCCR FX | Partial — audit display in EXPERIENCE not bound |
| AD-8 httpOnly cookies | Partial — standalone auth screens in UX backlog |
| **AD-9 Review gestures** | **Strong** — core J1 interaction adopted |
| **AD-10 Same-price window** | **Server only** — UI picker rules dropped |
| AD-11 CI fixtures | Neutral |
| **AD-12 Visual authority** | **Delegation only** — no token/layout ADs |
| AD-13–15 Process | Neutral |

---

## Recommendations

1. **Extend AD-9 or add AD-16 (Review UX contract)** — encode: no keep-both; conflict card picker not swipe; card registration blocks review; parse comparison regions; commit summary ordering.
2. **Strengthen AD-12 or add visual AD companion** — minimum enforceable subset: font faces, owe/owed semantics, Soft-Ledger island layout order, no settlement CTAs, system light/dark.
3. **Clarify balance-strip CTA policy** — align DESIGN grid column with EXPERIENCE “no settlement control”; default omit CTA on list surface unless a non-settlement action exists (e.g. Simplify when mocked).
4. **Surface AD-10 window in EXPERIENCE** — add one line to J7 or Component Patterns so conflict UX matches server behavior.
5. **Elevate WCAG 2.2 AA** from DESIGN/EXPERIENCE-only to consistency convention or AD-15 CI note — at least for contrast tokens and focus order on settle + review surfaces.
6. **Capability map gaps** — add rows for: first-paint routing, card registration gate, same-price conflict UI, manual expense, invite landing, account chrome scope.

---

## Files Reviewed

| File | Role |
|---|---|
| `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` | Behavioral / IA spine |
| `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` | Visual / token spine |
| `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` | Architecture ADs and capability map |
