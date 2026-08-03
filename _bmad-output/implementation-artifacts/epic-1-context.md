# Epic 1 Context: Accounts & personal workspace

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up the greenfield Compose stack and the minimal peer account surface so a new user can sign up, sign in, reset password, land authenticated with exactly one personal list, and set EN/ES language plus Light / Dark / System theme from the Account menu. Demo gate: authenticated user with a personal list — foundation every later epic assumes.

## Stories

- Story 1.1: Scaffold Compose app with health checks
- Story 1.2: Sign up with email/password and personal list
- Story 1.3: Sign in, sign out, and protect routes
- Story 1.4: Password reset via email
- Story 1.5: Config-gated email verification
- Story 1.6: Account menu — language EN/ES and theme

## Requirements & Constraints

- New users create accounts with email and password; duplicate emails rejected; passwords hashed (never plaintext or logged); success authenticates and creates exactly one owned personal list.
- Registered users sign in and sign out; invalid credentials get a generic failure (no email-existence leak); after sign-out, protected list/upload actions require auth again.
- Forgotten-password reset via email proves control of the address; completed reset invalidates the prior password. Invite and reset mail need operator-configured SMTP; misconfigured SMTP fails loudly (no silent success).
- Email verification is config-gated — only when required for invite delivery or secure recovery; if off, signup still succeeds and the user can use the app.
- Personal list is the same list entity with a single member (not a separate type); available as a review destination later, not hardwired as the only default.
- v1 account tooling stays minimal: no profile/settings product (no display name, notification prefs, FX overrides, or session-management UI beyond auth).
- App + PostgreSQL run in containers; DB (and future PDF) volumes live outside the repo; no real statement/PII paths committed. Schema evolves via migrations without discarding the operator volume.
- Users are peers; membership ACL only — no privileged product admin role.

## Technical Decisions

- **Compose topology:** services are exactly `db` (Postgres 16), `api` (FastAPI / Python 3.12+), `ui` (Next.js 16 standalone / React 19), plus host reverse proxy. No Redis/worker in v1. Overlays for local and homelab prod.
- **Hex layout:** `api/domain`, `api/application`, `api/adapters/{bank,persistence,fx,email}`, `api/api`, `ui/`. UI calls HTTP only; domain has no FastAPI/SQLAlchemy/PDF imports.
- **Structural seed:** `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, `.github/workflows/ci.yml`, synthetic PDF fixtures under `api/tests/fixtures/pdf/`.
- **Auth (AD-8):** email+password; session via httpOnly Secure cookie (JWT or opaque); same-origin via reverse proxy and/or Next BFF; Bearer-in-localStorage forbidden; argon2 or fastapi-users.
- **Ops:** Alembic on api startup (or one-shot) against the external PG volume; `/health` on api and ui; secrets via Compose env outside repo; structured logs + healthchecks.
- **Conventions:** branch `<type>/<epic>/<us-id>`; single-app SemVer for the Compose system; CI merge gate = lint + api pytest (goldens later) + ui typecheck/lint + critical ui tests. Stable UUIDs for users/lists. Generic auth failures in API errors.
- **i18n / appearance (spine):** EN+ES keys in `ui`; language remembered on account (first visit from browser/`Accept-Language`); theme Light/Dark/System remembered on account (default System → Warm Balance token set for resolved mode).
- **Explicit rejects for this epic:** Streamlit/Gradio/etc. as primary UI; Node-primary API; Bearer in localStorage.

## UX & Interaction Patterns

- **Account menu** (minimal chrome): sign out, password reset, Language EN/ES, Theme Light / Dark / System — no profile, avatars-as-settings, or preferences surface.
- Language defaults from browser on first visit; thereafter remembered on the account; `lang` matches locale. Account chrome strings ship in both EN and ES from this epic.
- Theme defaults to System (OS/browser); Light/Dark pin Warm Balance light/dark tokens; preference remembered on account; System continues to follow OS changes.
- Tab bar pattern includes Account (with List / Upload); DESIGN.md + EXPERIENCE.md bind visual/behavior — kits may supply unstyled primitives only.
- Standalone auth surfaces (signup / sign-in / password reset) exist outside invite flows; invitee landing on inviting list is Epic 2.

## Cross-Story Dependencies

- **Within Epic 1:** 1.1 scaffold first (Compose, hex layout, Alembic, health, CI skeleton, volumes). Auth stories (1.2–1.5) build on that stack and AD-8 cookies. 1.2 creates the personal list at signup. 1.3 protects routes and completes sign-in/out. 1.4 needs SMTP adapter + email adapter path. 1.5 gates verification behind config without breaking FR-1 when off. 1.6 needs authenticated chrome and persists language/theme on the account.
- **Demo gate:** authenticated user with personal list (after 1.2+1.3 at minimum; 1.6 completes account chrome).
- **Later epics expect:** working Compose + auth cookies; personal list ownership/membership model; SMTP for invites (Epic 2); Account language for invite email locale; theme preference driving Warm Balance tokens (Epic 3 Soft-Ledger); protected routes for lists/uploads (Epics 2–4).
