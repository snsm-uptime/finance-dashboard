---
baseline_commit: e1c7ac5234fef5f9335e6108f11d1d85f6fa52f6
---

# Story 3.5.1: Install Tailwind v4 + Sass and Warm Balance theme bridge

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want Tailwind and Sass wired into the Next.js `ui` app with Warm Balance tokens,
so that components can use utilities without inheriting kit defaults.

## Acceptance Criteria

1. **Given** `ui/` dependencies  
   **When** Tailwind CSS v4 + PostCSS plugin + `sass` are installed and configured  
   **Then** `next build` / `typecheck` / existing tests still pass on non-migrated surfaces

2. **Given** Warm Balance + Soft-Ledger tokens already in `ui/app/globals.css`  
   **When** Tailwind `@theme` (and dark-variant wiring) is added  
   **Then** Warm Balance light/dark/System tokens remain authoritative — **no** template/kit palette, **no** re-picked hexes (AD-12, AD-23)  
   **And** Soft-Ledger spacing/shape/type tokens remain available to utilities and/or CSS variables  
   **And** existing CSS Modules + Soft-Ledger chrome still render correctly (this story does **not** migrate them)

3. **Given** project docs for `ui` styling  
   **When** the convention note is added  
   **Then** it states: Tailwind utilities first; `*.module.scss` only for custom styles; no new `*.module.css`

## Tasks / Subtasks

- [ ] Task 0: Prerequisites & scope gate (AC: #1–#3)
  - [ ] Branch: `feat/3.5/3-5-1-install-tailwind-sass-warm-balance-theme` from `main` at `baseline_commit` (AD-13); one story per branch
  - [ ] **Mandatory reads:** `_bmad-output/project-context.md` (UI styling / AD-23); AD-12 + AD-23 in `ARCHITECTURE-SPINE.md`; this epic’s sprint change proposal `sprint-change-proposal-2026-08-10.md`; Story 3.1 token table (do not re-pick)
  - [ ] **IN SCOPE:** install deps, PostCSS, `@import "tailwindcss"`, `@theme` bridge to existing CSS vars, `@custom-variant dark` for `html.dark`, Sass package ready for later `*.module.scss`, short styling convention note, green gates
  - [ ] **OUT OF SCOPE:** migrating Soft-Ledger / lists / auth CSS Modules (Stories **3.5.2–3.5.3**); deleting `*.module.css`; inventing a second token package; adding shadcn/ui or kit themes; product FX/incomplete work (Epic 3 stories 3.5–3.6)
  - [ ] **Sequencing note:** Correct Course preferred finishing Epic 3 product 3.5–3.6 first. Sebas chose to start **3.5.1** now — do **not** block on those stories, but do **not** start Epic 4 or Soft-Ledger migration in this PR

- [ ] Task 1: Install Tailwind v4 + PostCSS + Sass (AC: #1)
  - [ ] In `ui/`: `npm install tailwindcss @tailwindcss/postcss postcss` and `npm install -D sass` (or equivalent pinned majors: Tailwind **4.x**, Sass **1.x** per spine)
  - [ ] Add `ui/postcss.config.mjs`:
    ```js
    const config = {
      plugins: {
        "@tailwindcss/postcss": {},
      },
    };
    export default config;
    ```
  - [ ] Do **not** add `tailwind.config.js` / `tailwind.config.ts` (v4 is CSS-first)
  - [ ] Confirm `ui/next.config.ts` stays `output: "standalone"` — no Tailwind-specific Next options required
  - [ ] Dockerfile / Compose: deps come from lockfile only — no Dockerfile CSS special-casing unless build fails

- [ ] Task 2: Warm Balance theme bridge in `globals.css` (AC: #2)
  - [ ] At top of `ui/app/globals.css` (before existing token blocks if import order allows; otherwise keep tokens first and place `@import "tailwindcss"` as required by Tailwind — **preserve** all existing `:root` / `html.dark` / System media token hexes and aliases):
    ```css
    @import "tailwindcss";

    /* Class strategy matches PreferencesProvider FOUC: html.dark / html.light */
    @custom-variant dark (&:where(.dark, .dark *));
    ```
  - [ ] Add `@theme` that **references** existing CSS variables — do **not** duplicate hex literals in `@theme`:
    - Colors → utilities like `bg-background`, `text-foreground`, `bg-surface`, `text-muted`, `border-border`, `bg-accent`, `text-on-accent`, `text-owe`, `text-owed` (and/or `*-wb-*` if you also expose canonical `--wb-*`)
    - Map via `var(--background)`, `var(--wb-bg)`, etc. so Light / Dark / System switching stays owned by existing CSS var overrides
    - Spacing: expose Soft-Ledger spacing as theme spacing where useful (`--space-1`…`--space-6`, `--strip-inset`, `--page-gutter`, `--nav-x`, `--row-y`)
    - Radius: `--rounded-sm|md|lg` (document: **never** use `rounded-full` for primary CTAs)
    - Fonts: wire `--font-ui` / `--font-brand` into theme font families if practical; keep `layout.tsx` next/font loading as-is
  - [ ] **Preflight caution:** Tailwind’s base reset may conflict with existing `body` / `*` rules. After enabling, visually spot-check Soft-Ledger list detail + signup. Prefer adjusting globals lightly over rewriting modules. If preflight breaks chrome badly, use `@import "tailwindcss" layer(…)` / selective imports only with a comment explaining why — default path is full import
  - [ ] Prove bridge with a **temporary** smoke utility on an already-styled surface **or** a tiny unused comment/example in docs — prefer a one-line assert in a new tiny test that `@theme` / globals source contains `var(--wb-` / `var(--background)` mappings (readFileSync pattern from Soft-Ledger tests). Do **not** leave a visible “Hello Tailwind” page in production chrome
  - [ ] Leave all `*.module.css` imports untouched

- [ ] Task 3: Convention note (AC: #3)
  - [ ] Add a short **Styling** section near the top of `ui/README.md` (replace stale Geist boilerplate mention if touching Getting Started):
    - Default: Tailwind utilities co-located on components
    - Custom only: `*.module.scss`
    - Forbidden: new `*.module.css`; kit/starter palettes; re-picking Warm Balance hexes
    - Tokens: CSS vars in `globals.css` + `@theme` bridge (AD-12 / AD-23)
  - [ ] Do **not** rewrite full `project-context.md` here — Story **3.5.4** owns final convention lock (rules already lightly present)

- [ ] Task 4: Quality gates (AC: #1)
  - [ ] From `ui/`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — all green
  - [ ] Soft-Ledger / lists tests that `readFileSync` module CSS must still pass (no migration)
  - [ ] Manual: Light / Dark / System still switch Warm Balance colors via Account preference (FOUC script unchanged)

## Dev Notes

### Guardrails (must follow)

- **AD-12:** DESIGN/EXPERIENCE own look; kits unstyled only. Tailwind is delivery plumbing.
- **AD-23:** Utilities first; `*.module.scss` for custom; **no new `*.module.css`**; no kit palettes; no hex re-picks.
- **Single token source:** keep Story 3.1 CSS variables; `@theme` points at `var(--…)` — never invent a parallel hex table in Tailwind config.
- **Do not migrate Soft-Ledger in this story** — that is 3.5.2.

### Warm Balance hexes (do not change)

| Role | Light | Dark |
|------|-------|------|
| background | `#F7F3EC` | `#17140F` |
| surface | `#FFFCF7` | `#221E17` |
| text | `#2A241C` | `#F0E9DC` |
| muted | `#6E6456` | `#A89B88` |
| border | `#E2D8C8` | `#3A342A` |
| accent | `#3F6B45` | `#8FBB8E` |
| on-accent | `#FFFCF7` | `#17140F` |
| owe | `#A04936` | `#D48B78` |
| owed | `#2F6E48` | `#7EC794` |

Aliases already in globals: `--background`, `--surface`, `--foreground`, `--muted`, `--border`, `--accent`, `--on-accent`, `--owe`, `--owed` (+ `--wb-*` canonical). Theme mode: `html.dark` / `html.light` + System media when neither class — owned by `ui/components/PreferencesProvider.tsx` (`themeBootScript` in `layout.tsx`); **reuse**, do not fork.

### Current codebase (UPDATE files)

| Path | Role | This story |
|------|------|------------|
| `ui/package.json` / lockfile | No Tailwind/Sass today | ADD deps |
| `ui/postcss.config.mjs` | Missing | NEW |
| `ui/app/globals.css` | Token + base styles | UPDATE — import Tailwind + `@theme` + dark variant |
| `ui/app/layout.tsx` | Imports globals; Manrope/Petrona | PRESERVE fonts/theme |
| `ui/next.config.ts` | `standalone` only | PRESERVE |
| `ui/components/soft-ledger/*.module.css` | Primitives | DO NOT MIGRATE |
| `ui/app/lists/*.module.css` etc. | Feature CSS | DO NOT MIGRATE |
| `ui/vitest.config.mts` | node env; CSS mocked in Soft-Ledger tests | Likely unchanged |
| `ui/Dockerfile*` | `npm ci` + build | Lockfile only |

### Tailwind v4 install (current docs)

```bash
cd ui
npm install tailwindcss @tailwindcss/postcss postcss
npm install -D sass
```

- Official Next guide: PostCSS plugin `@tailwindcss/postcss` + `@import "tailwindcss"` in CSS — **no** `tailwind.config.js`
- Dark class: `@custom-variant dark (&:where(.dark, .dark *));` so `dark:` utilities respect `html.dark` (project already uses class strategy). Color utilities that use `var(--background)` etc. will also track CSS-var dark without `dark:` prefixes — prefer that for Warm Balance

### Suggested `@theme` shape (illustrative — adjust names for Tailwind v4 token conventions)

```css
@theme {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-on-accent: var(--on-accent);
  --color-owe: var(--owe);
  --color-owed: var(--owed);

  --radius-sm: var(--rounded-sm);
  --radius-md: var(--rounded-md);
  --radius-lg: var(--rounded-lg);

  --spacing-strip-inset: var(--strip-inset);
  --spacing-page-gutter: var(--page-gutter);
  --spacing-nav-x: var(--nav-x);
  --spacing-row-y: var(--row-y);
}
```

Verify generated utility names against Tailwind v4 docs if any mapping does not emit expected classes; fix names, do not invent new colors.

### Testing

- Gates: `typecheck`, `lint`, `test`, `build` in `ui/`
- Prefer `readFileSync` on `globals.css` asserting `@import "tailwindcss"`, `@theme`, and `var(--wb-` / `var(--background)` — **not** `getComputedStyle` for CSS vars in jsdom (Story 3.1 lesson)
- Soft-Ledger tests mock CSS modules — leave mocks intact
- Coverage floor still applies only to `lib/**` + `app/api/**` — Soft-Ledger UI tests are not the coverage vehicle

### Project Structure Notes

- Work only under `ui/`
- Branch epic segment `3.5` avoids confusion with Epic 3 product key `3-5-materialize-…`
- Story key: `3-5-1-install-tailwind-sass-warm-balance-theme` (= Epic **3.5** story 1)

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 3.5 / Story 3.5.1]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-10.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` — AD-12, AD-23, Stack]
- [Source: `_bmad-output/project-context.md` — UI styling rules]
- [Source: `_bmad-output/implementation-artifacts/3-1-warm-balance-tokens-soft-ledger-primitives.md`]
- [Source: `ui/app/globals.css`, `ui/app/layout.tsx`, `ui/package.json`]
- [Source: https://tailwindcss.com/docs/guides/nextjs — Tailwind v4 + Next PostCSS]
- [Source: https://tailwindcss.com/docs/dark-mode — `@custom-variant dark`]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-10: Story context created (create-story) — ready-for-dev
