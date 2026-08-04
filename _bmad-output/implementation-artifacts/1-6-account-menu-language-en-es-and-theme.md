---
baseline_commit: 9faaf85dddecc02425c4615b06fdfb4e45dca9df
---

# Story 1.6: Account menu — language EN/ES and theme

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a signed-in user,
I want to choose UI language (EN/ES) and appearance theme (Light / Dark / System) from a minimal Account menu,
so that the app matches my language and preferred look without a full settings product.

## Acceptance Criteria

1. **Given** I am signed in  
   **When** I open the Account menu  
   **Then** I can sign out, reach password reset, choose Language EN or ES, and choose Theme Light, Dark, or System — with no profile/settings surface (UX-DR10)

2. **Given** it is my first visit with no saved language preference  
   **When** the UI loads  
   **Then** language defaults from the browser / Accept-Language

3. **Given** I select EN or ES  
   **When** I return later on the same account  
   **Then** my language preference is remembered and `lang` matches the locale (UX-DR18)  
   **And** account chrome strings for this story ship in both EN and ES

4. **Given** it is my first visit with no saved theme preference  
   **When** the UI loads  
   **Then** theme defaults to System (OS/browser light/dark) and Warm Balance tokens apply for the resolved mode (UX-DR1)

5. **Given** I select Light, Dark, or System  
   **When** I return later on the same account  
   **Then** my theme preference is remembered and the UI uses the corresponding Warm Balance token set (System continues to follow OS changes)

## Tasks / Subtasks

- [x] Task 0: Confirm Stories 1.1–1.3 are implemented (prerequisites)
  - [x] 1.1: Compose + hex + `ui/` App Router + health + lockfiles
  - [x] 1.2: User (UUID) + session cookie issuer + personal list
  - [x] 1.3: Sign-in/out, protected routes, authenticated chrome shell, bare sign-out affordance
  - [x] Read 1.2/1.3 completion notes for AD-8 forks (cookie name, BFF vs proxy, opaque vs JWT) — **reuse; never re-decide**
  - [x] If 1.1–1.3 incomplete: stop — finish those first (do not invent a parallel prefs/auth stack)
  - [x] **1.4 Soft couple:** password-reset **route/entry** must be reachable from Account (AC #1). Link to 1.4 public flow — prefer `/forgot-password` (request); `/reset-password` is the email confirm page. If 1.4 not merged yet, stub the same paths — do not implement SMTP here
  - [x] **1.5 Not required** for this story (and must not add verification settings into Account)

- [x] Task 1: Persist language + theme on the account (AC: #3, #5) — server source of truth
  - [x] Alembic migration: add nullable (or unset-sentinel) `language` and `theme` columns on `users` (or equivalent account prefs table) — **never** wipe PG volume
  - [x] Allowed values: `language ∈ {en, es}`; `theme ∈ {light, dark, system}` — reject unknowns with structured API error
  - [x] Domain/application owns preference rules (no FastAPI/SQLAlchemy in `domain/`); ORM only under `adapters/persistence` (AD-1)
  - [x] Extend authenticated `GET /api/auth/me` (or equivalent) to return `language` + `theme` (snake_case wire; null/omit = unset)
  - [x] Add authenticated `PATCH /api/auth/me` (or `PATCH /api/account/preferences`) accepting `{ language?, theme? }` — persist and return updated user DTO
  - [x] Unauthenticated → 401; never store prefs in Bearer/`localStorage` as SoT (AD-8)
  - [x] **Forbidden:** device-only prefs that never hit the user row (breaks Epic 2 invite-email locale UX-DR16)

- [x] Task 2: First-visit defaults (AC: #2, #4)
  - [x] Language unset → resolve from `Accept-Language` / browser language; prefer `es` if Spanish is primary/high-q, else `en` (only EN+ES supported)
  - [x] Theme unset → treat as `system` (do not write until user chooses, or write `system` on first authenticated load — either OK if “return later” still yields System)
  - [x] Defaults apply when prefs are null; once saved on account, account wins over browser/OS for language / for Light|Dark pin
  - [x] Signed-out auth pages (sign-in/sign-up) may use browser language for chrome if i18n is wired — do not invent a Settings product

- [x] Task 3: Warm Balance token CSS + theme resolution (AC: #4, #5) — minimal set for chrome
  - [x] Ship **both** light and dark Warm Balance role tokens as CSS variables (UX-DR1): background, surface, text, muted, border, accent, on-accent, owe, owed
  - [x] Hex from DESIGN.md (light `#F7F3EC`… / dark `#17140F`…); prefer `--wb-*` naming from promoted mocks
  - [x] Resolve `system` via `prefers-color-scheme`; when preference is `system`, **continue listening** for OS changes
  - [x] Apply resolved mode to `<html>` (`class` or `data-theme`) **without flash** on load (`suppressHydrationWarning` if using client theme provider)
  - [x] Optional helper: `next-themes` (or equivalent) for flash-free System — **must sync from/to account API**, not treat library localStorage as SoT
  - [x] Typography for Account chrome: **Manrope** (UX-DR2); no Inter/Roboto as brand; kits = unstyled primitives only (AD-12)
  - [x] **Defer to Story 3.1:** full Soft-Ledger primitives, Tab bar anatomy polish, strip/receipt components — 1.6 owns preference plumbing + token swap, not the full design system

- [x] Task 4: i18n EN+ES for Account chrome (AC: #3) — keys in `ui`
  - [x] Architecture leaves library **open** — recommended: **next-intl** (App Router / Next 16; works with `proxy.ts`). Lightweight custom dictionaries OK if smaller
  - [x] Prefer **no SEO locale URL prefixes** for this authenticated app (`localePrefix: 'never'` or cookie/account-driven locale) unless 1.1 already locked `[locale]` routing — account language is SoT, not the URL
  - [x] Set `lang` on `<html>` to `en` or `es` when locale changes (UX-DR18)
  - [x] Message catalogs: Account menu labels (Language, Theme, Light, Dark, System, Sign out, Password reset, EN, ES) in **both** locales
  - [x] Voice: plain + direct; no bank jargon (UX-DR17) — same rules in ES
  - [x] Do not translate card labels / free-text user data (N/A here but keep convention)

- [x] Task 5: Minimal Account menu UI (AC: #1) — UX-DR10 only
  - [x] Authenticated Account surface listing **exactly**: Sign out · Password reset (link) · Language EN/ES · Theme Light/Dark/System
  - [x] Placement: Account entry in chrome — Tab bar List/Upload/Account if 3.1/scaffold tab exists; otherwise a dedicated authenticated Account route/panel is OK until Soft-Ledger Tab bar lands
  - [x] Wire **Sign out** to 1.3 sign-out API; remove/relocate bare 1.3 sign-out so Account is the primary chrome (avoid permanent dual sign-out)
  - [x] Password reset: navigate to `/forgot-password` (1.4 owns SMTP + confirm at `/reset-password`)
  - [x] Language/Theme controls call PATCH prefs then update UI immediately; re-login / other device must load saved prefs from `me`
  - [x] **Forbidden UI:** profile page, avatars-as-settings, display name, notification prefs, FX overrides, session-management UI, purple kit theme, pill primary CTAs (`rounded.full`)

- [x] Task 6: Tests (AC: #1–#5)
  - [x] API pytest (Postgres 16): PATCH language/theme persists; GET `me` returns them; invalid values rejected; 401 without session
  - [x] API/default: unset language → Accept-Language resolution path covered (unit or integration)
  - [x] UI critical (test-after OK; respect 1.1 coverage floor ≥60%): Account menu shows four affordances; selecting EN/ES updates `lang` + chrome strings; theme Light/Dark/System swaps token set; System follows `prefers-color-scheme` change
  - [x] Fixtures: generic emails only (`user@example.com`); no PII
  - [x] Do **not** require full Playwright every PR (AD-15)

## Dev Notes

### Epic context

Epic 1 = Accounts & personal workspace (FR-1…FR-5). Language/theme have **no dedicated PRD FR IDs** — still required via Scope In + UX-DR1 / UX-DR10 / UX-DR18 (`project-context`: “Language/theme still required even without FR ids”).

| Sibling | Relationship to 1.6 |
|---------|---------------------|
| 1.1 Scaffold | Prerequisite Compose / `ui` / lockfiles |
| 1.2 Signup + User | Hard — account row to hang prefs on |
| **1.3 Sign-in/out + protect** | **Hard** — signed-in Account chrome; sign-out API |
| 1.4 Password reset | Soft-hard — menu must **reach** reset; SMTP = 1.4 |
| 1.5 Email verification | Orthogonal — skip |
| **3.1 Warm Balance Soft-Ledger** | Full tokens/primitives/Tab bar; theme from **1.6** drives which set is active — ship **minimal CSS vars** here |

**Later consumers:** Epic 2 invite emails use inviter’s Account language (UX-DR16). Wrong persistence model (localStorage-only) breaks that.

### Hard prerequisites / ordering

- Minimum: **1.1 + 1.2 + 1.3 done** before implementing 1.6.
- Branch: `feat/1/1-6-account-menu-language-en-es-and-theme` (AD-13) — one story per branch.
- Do not wait for 1.5. Prefer 1.4 route exists before marking AC #1 fully done; stub link acceptable if documented in completion notes.

### Scope boundaries (anti-scope)

| In 1.6 | Out of 1.6 |
|--------|------------|
| Account menu chrome (4 affordances) | Profile / Settings product |
| Persist language + theme on user | SMTP password-reset implementation (1.4) |
| Browser language + System theme defaults | Email verification gate (1.5) |
| Minimal Warm Balance CSS variables + swap | Full Soft-Ledger / strip / Tab bar polish (3.1) |
| EN+ES Account chrome strings + `lang` | Invite email templates (Epic 2) |
| Consolidate sign-out into Account | OAuth, display name, notification prefs |
| | Membership ACL (Epic 2), FX, money math |

### Architecture compliance

[Source: `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md`]

- **Consistency — i18n:** EN+ES from v1; keys in `ui`; preference remembered **on account**; first visit from browser
- **Consistency — Appearance:** Light / Dark / System; remembered **on account**; default System; Warm Balance token sets from DESIGN.md
- **AD-1:** Prefs via HTTP API; `ui` → HTTP only; domain free of FastAPI/SQLAlchemy
- **AD-3 / AD-22:** Durable Postgres via Alembic; never recreate volume for schema
- **AD-8:** Same httpOnly Secure session as 1.2/1.3; no Bearer in `localStorage`
- **AD-12:** DESIGN.md + EXPERIENCE.md win; kits unstyled only; no purple finance clichés
- **AD-15:** UI test-after; CI lint + api pytest + ui typecheck/lint + critical ui tests

**Note:** Account menu / locale switcher were **dropped from numbered ADs** (`review-reconcile-ux.md`) but remain binding via Consistency Conventions + AD-12 → EXPERIENCE/DESIGN. Do not treat “dropped from ADs” as out of scope.

### Library / framework requirements

| Piece | Pin / guidance | Notes |
|-------|----------------|-------|
| Next.js / React | 16.2.x / 19.2.x | From 1.1 lockfile; `proxy.ts` (not deprecated `middleware.ts`) |
| i18n | **Unpinned** — prefer `next-intl` v4.x | Keys in `ui`; account language SoT; Accept-Language first visit |
| Theme helper | Optional `next-themes` | Flash-free System; **sync with account API** — localStorage ≠ SoT |
| Warm Balance tokens | CSS variables | DESIGN.md hex; `--wb-*` preferred |
| FastAPI / Pydantic / SQLAlchemy / Alembic | From 1.1 lockfile | Prefs columns + PATCH |
| Fonts | Petrona (brand) / Manrope (chrome) | Account menu uses Manrope |

After 1.1 lockfiles exist: patches only via `chore/` PRs — do not bump majors inside this feature story.

### Recommended API / UI shapes (rename only if 1.2/1.3 already fixed names)

```text
GET  /api/auth/me              → { id, email, language, theme, … }  # null language/theme = unset
PATCH /api/auth/me             → { language?: "en"|"es", theme?: "light"|"dark"|"system" }

ui/messages/en.json            # Account chrome (+ shared keys as needed)
ui/messages/es.json
ui/app/(app)/account/…         # Account menu surface (or tab panel)
ui/styles/warm-balance.css     # :root + .dark (or [data-theme=dark]) token sets
ui/components/theme-provider.tsx  # optional next-themes wrapper synced to account
```

Wire snake_case on API DTOs; map at UI edge.

### File structure requirements

Expect **UPDATE** of auth/user from 1.2–1.3; **NEW** prefs columns, PATCH, Account UI, i18n catalogs, token CSS.

```text
api/
  domain/…                     # preference validation rules
  application/…                # UpdatePreferences / resolve defaults
  adapters/persistence/…       # User columns + Alembic revision
  api/auth.py (or routers/)    # GET/PATCH me
ui/
  messages/en.json, es.json    # NEW
  app/(app)/account/…          # NEW Account menu
  styles/…                     # Warm Balance CSS variables
  components/…                 # theme + locale providers
  proxy.ts                     # UPDATE if locale negotiation hooks in (keep /health public)
```

### Existing code being modified

| Path | Expected state entering 1.6 | This story | Preserve |
|------|----------------------------|------------|----------|
| User model + Alembic | From **1.2** | Add `language`, `theme` | UUID, email uniqueness, hash, session |
| `GET /api/auth/me` + cookie auth | From **1.3** | Return prefs; add PATCH | Same cookie issuer / 401 behavior |
| Authenticated layout / bare Sign out | From **1.3** | Account menu; move sign-out into menu | Protected route gates; public auth routes |
| `ui` global CSS / layout | From **1.1** | Tokens + `lang` + theme class | `/health`; `output: 'standalone'` |
| Password reset routes | From **1.4** (`/forgot-password`, `/reset-password`) or stubs | Account links to `/forgot-password` | Do not implement SMTP in 1.6 |

**Greenfield note (as of story creation):** `ui/` does not exist on `main` yet; `api/` is hex skeleton (health only). 1.1–1.3 must land first. Do not scaffold a parallel prefs stack.

### UX requirements

[Source: EXPERIENCE.md Account menu + Internationalization; DESIGN.md Appearance + tokens; UX-DR1/10/18]

- Account menu = **minimal global chrome**, not Settings
- Contents exhaustive for v1: Sign out · Password reset · Language EN/ES · Theme Light/Dark/System
- First visit language: browser / `Accept-Language`; thereafter account
- First visit theme: **System**; Light/Dark pin token set; System keeps following OS
- Desktop: same IA, wider layout — not a separate dashboard chrome (UX-DR20)
- Depth via canvas vs surface only — no drop-shadow hierarchy (UX-DR21)
- No pill primary CTAs; accent for actions / active tab only

### Testing requirements

- Domain preference validation: red→green where pure rules exist; UI test-after
- Must prove: account persistence across “return later”; defaults; `lang` attribute; System OS follow; bilingual Account chrome
- Integration against **Postgres 16** — not SQLite
- CI: extend api pytest + critical ui tests; coverage floor from 1.1

### Project context reference

Follow `_bmad-output/project-context.md`. Highest-risk misses for this story:

- **localStorage-only** language/theme (breaks “remembered on account” + invite email locale)
- Building a **Settings / profile** page
- Skipping Warm Balance dark tokens (light-only)
- EN-only chrome strings / forgetting `lang`
- Re-deciding AD-8 or inventing a second session
- Implementing full Soft-Ledger / Tab bar as if this were 3.1
- Kit purple theme / Inter-Roboto / pill CTAs
- Waiting on 1.5 or blocking on full 1.4 SMTP for prefs work
- Using Next 15 `middleware.ts` name instead of Next 16 `proxy.ts`

Source-of-truth order: ARCHITECTURE-SPINE + project-context → SPEC/DESIGN/EXPERIENCE → PRD/epics → README/research.

### Previous story intelligence

**Stories 1.1–1.3** exist as ready-for-dev guides; **no completion notes / app auth code on `main` yet** (1.1 in-progress in sprint-status). Intelligence below is from planned Dev Notes — refresh from completion notes when those stories merge.

**Story 1.1** (`1-1-scaffold-compose-app-with-health-checks.md`):

- Compose `db`/`api`/`ui`, hex, Alembic, `/health`, CI, coverage floor **60%**
- Explicit anti-scope: Account menu / i18n product chrome → **1.6**; full Warm Balance → **3.1**
- Neutral shell OK; strip kit purple

**Story 1.2** (`1-2-sign-up-with-email-password-and-personal-list.md`):

- Closes AD-8 forks in completion notes — **1.6 reuses** cookie/BFF choices
- User + List + membership (+ Session if opaque); Alembic only
- “Account menu prefs = Story 1.6”; prefer i18n key stubs early

**Story 1.3** (`1-3-sign-in-sign-out-and-protect-routes.md`) — **highest prior story file (&lt; 1.6)**:

- Sign-in/out + `proxy.ts` + protect list/upload; bare Sign out until 1.6
- “1.6 wires sign-out + language/theme chrome (UX-DR10)”
- Prefer i18n stubs; EN strings fine until 1.6 wires ES
- Public later: reset routes (1.4)

**Story 1.4** (`1-4-password-reset-via-email.md`, ready-for-dev):

- Public `/forgot-password` + `/reset-password`; API `POST …/password-reset/request|confirm`
- Explicit: Account menu “password reset” entry is **1.6** chrome; 1.4 delivers the destination flow
- SMTP adapter path Epic 2 will reuse — do not re-implement mail here

**Story 1.5** (`1-5-config-gated-email-verification.md`, ready-for-dev):

- Orthogonal to prefs; anti-scope: no Account-menu verification settings / profile product
- Prefer i18n stubs until 1.6 wires ES

### Git intelligence

Recent commits are planning/BMAD artifacts only (`Add Story 1.1…`, sprint-status, project-context). **No Account/i18n/theme product code on `main`.** After 1.1–1.3 merge, follow their lockfiles, ruff, ESLint+tsc, and branch naming.

### Latest tech information

- **next-intl (v4):** App Router standard; configure via `i18n/request.ts` + plugin; Next 16 uses **`proxy.ts`** (middleware replacement) for locale negotiation if using routing. For account-driven locale without SEO prefixes, use cookie/request config **and** persist preference on user — do not rely on `NEXT_LOCALE` cookie alone as SoT.
- **next-themes:** `defaultTheme="system"`, `enableSystem`, `attribute="class"` (or `data-theme`); `suppressHydrationWarning` on `<html>`; use `resolvedTheme` for which token set is active vs stored `theme` (`light`|`dark`|`system`). Library localStorage is a cache — **hydrate from `GET /me` and write-through on PATCH**.
- **Warm Balance:** ship both token sets; System must re-resolve on `prefers-color-scheme` changes when preference is `system`.
- **Accept-Language:** parse q-values; map primary tag to `en`|`es`; fallback `en`.

### References

- `_bmad-output/planning-artifacts/epics.md` — Story 1.6, UX-DR1, UX-DR10, UX-DR18
- `_bmad-output/planning-artifacts/architecture/architecture-finance-helper-2026-08-03/ARCHITECTURE-SPINE.md` — i18n + Appearance conventions, AD-1/8/12/15/22
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/EXPERIENCE.md` — Account menu, Internationalization, Appearance
- `_bmad-output/planning-artifacts/ux-designs/ux-finance-helper-2026-08-03/DESIGN.md` — Warm Balance tokens, typography, Appearance
- `_bmad-output/planning-artifacts/prds/prd-finance-helper-2026-08-02/prd.md` — Scope In account tooling (language/theme; no Settings)
- `_bmad-output/implementation-artifacts/epic-1-context.md`
- `_bmad-output/implementation-artifacts/1-1-scaffold-compose-app-with-health-checks.md`
- `_bmad-output/implementation-artifacts/1-2-sign-up-with-email-password-and-personal-list.md`
- `_bmad-output/implementation-artifacts/1-3-sign-in-sign-out-and-protect-routes.md`
- `_bmad-output/implementation-artifacts/1-4-password-reset-via-email.md`
- `_bmad-output/implementation-artifacts/1-5-config-gated-email-verification.md`
- `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

Cursor Grok 4.5

### Debug Log References

- Host `docker compose run … uv run pytest` failed: permission denied writing `/app/.venv` (image runs as `appuser`; prod image has `--no-dev` so no pytest). Used host `.venv` + temporary `alpine/socat` publish of Compose `db:5432` → `127.0.0.1:5432`.

### Completion Notes List

- Reused AD-8: opaque `fh_session`, api single issuer, Next BFF `/api/auth/*` — no new session stack.
- Alembic `0005_user_preferences`: nullable `users.language` / `users.theme`.
- Domain `parse_accept_language` + GET/PATCH `/auth/me` return effective language/theme; stored nulls remain until user chooses.
- UI: `/account` Account menu (EN/ES, Light/Dark/System, password reset → `/forgot-password`, sign out); lists/upload use `AccountNavLink` instead of bare SignOut.
- Custom i18n (existing pattern) + Warm Balance `--wb-*` CSS with `html.dark` / system listener; localStorage used only as FOUC cache, SoT is account API.
- Tests: domain unit + Postgres integration prefs; UI locale/account/BFF/AccountMenu; sign-in + email-verification regressions green.

### File List

- api/domain/preferences.py
- api/domain/errors.py
- api/application/preferences.py
- api/adapters/persistence/models.py
- api/adapters/persistence/repositories.py
- api/adapters/persistence/migrations/versions/0005_user_preferences.py
- api/api/schemas/auth.py
- api/api/routes/auth.py
- api/tests/test_preferences_domain.py
- api/tests/test_preferences_integration.py
- ui/lib/i18n/locale.ts
- ui/lib/i18n/locale.test.ts
- ui/lib/i18n/account.ts
- ui/lib/i18n/account.test.ts
- ui/lib/i18n/signin.ts
- ui/app/globals.css
- ui/app/layout.tsx
- ui/app/account/page.tsx
- ui/app/lists/page.tsx
- ui/app/upload/page.tsx
- ui/app/api/auth/me/route.ts
- ui/app/api/auth/me/route.test.ts
- ui/components/PreferencesProvider.tsx
- ui/components/AccountMenu.tsx
- ui/components/AccountMenu.module.css
- ui/components/AccountMenu.test.tsx
- ui/components/AccountNavLink.tsx
- ui/components/AccountNavLink.module.css
- _bmad-output/implementation-artifacts/1-6-account-menu-language-en-es-and-theme.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-08-04: Implemented Account menu language/theme prefs (API + UI) for Story 1.6; status → review.

## Story completion status

Status: review  
Completion note: All tasks/ACs implemented and tested — ready for code-review.
