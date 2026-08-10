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
  - [ ] **Pre-flight checklist:**
    - [ ] Check if `ui/tailwind.config.js` or `ui/tailwind.config.ts` exists — if so, delete it (v4 is CSS-first, no config file needed)
    - [ ] Check `ui/package.json` for any existing `tailwindcss` or `@tailwindcss/*` entries — uninstall if present from prior attempts
    - [ ] Check if any other PostCSS plugins are installed that might conflict; list them for reference
  - [ ] In `ui/`: `npm install tailwindcss @tailwindcss/postcss postcss` and `npm install -D sass` (pinned to Tailwind **4.x**, Sass **1.x** per spine)
  - [ ] **Verify versions** after install:
    ```bash
    npm list tailwindcss @tailwindcss/postcss sass
    # Expected: tailwindcss 4.x.x, @tailwindcss/postcss 4.x.x, sass 1.x.x
    ```
  - [ ] Add `ui/postcss.config.mjs` (create new file):
    ```js
    const config = {
      plugins: {
        "@tailwindcss/postcss": {},
      },
    };
    export default config;
    ```
  - [ ] Confirm `ui/next.config.ts` stays `output: "standalone"` — no Tailwind-specific Next options required (Next auto-detects PostCSS)
  - [ ] Dockerfile / Compose: deps come from lockfile only — no Dockerfile CSS special-casing unless build fails
  - [ ] TypeScript strict mode: CSS imports in Next.js v16+ are supported natively; if `import "./app.css"` in `layout.tsx` shows type errors, add to `ui/tsconfig.json`:
    ```json
    {
      "compilerOptions": {
        "moduleResolution": "bundler"
      }
    }
    ```
    (Usually already set in Next scaffolds; verify only if typecheck fails)

- [ ] Task 2: Warm Balance theme bridge in `globals.css` (AC: #2)
  - [ ] At top of `ui/app/globals.css` — **preserve** all existing `:root` / `html.dark` / System media token hexes and aliases; place `@import “tailwindcss”` before custom CSS:
    ```css
    @import “tailwindcss”;

    /* Class strategy matches PreferencesProvider FOUC: html.dark / html.light */
    @custom-variant dark (&:where(.dark, .dark *));
    ```
    (If `globals.css` currently starts with `:root { --background: ...}`, keep that block intact and add `@import` before it. Tailwind’s CSS-first approach loads base styles first, then your token overrides layer on top.)
  
  - [ ] Add `@theme` block (after `@custom-variant dark` or at end of imports, before CSS rules):
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
    (Ref: [Tailwind v4 @theme docs](https://tailwindcss.com/docs/theme))
    - This generates utilities: `bg-background`, `text-foreground`, `rounded-sm`, `px-page-gutter`, etc.
    - Do **not** add hex literals or duplicate existing CSS var definitions — `@theme` only points at `var(--…)`
    - Do **not** add theme entries for colors/spacing already available in Soft-Ledger tests unless needed by UI

  - [ ] **Preflight integration — watch for these concrete issues:**
    - After running `npm run build`, visually check: Soft-Ledger list detail page (font size, button padding, input borders) + signup form (label color, field spacing)
    - If you see **layout shifts** (buttons suddenly larger), **color inversions** (white text unreadable), or **font size jumping**, preflight is conflicting
    - **If no issues appear:** preflight is safe; proceed
    - **If issues appear:** Tailwind’s base reset is overriding existing rules:
      1. Try: In `globals.css`, move your existing `body`, `*`, `input`, `button` rules **below** the `@theme` block (after `@import “tailwindcss”`)
      2. If that doesn’t work, use selective import:
         ```css
         @import “tailwindcss/base” layer(base);
         @import “tailwindcss/components” layer(components);
         @import “tailwindcss/utilities”;
         ```
         Then add custom base rules only where needed (comment: “Custom base for Soft-Ledger compat”). This is the escape hatch — use only if full preflight breaks chrome.

  - [ ] **Proof of bridge:** Add a one-line test in `ui/vitest.config.mts` or a new `ui/tests/tailwind-integration.test.ts`:
    ```typescript
    import { readFileSync } from “fs”;
    import { resolve } from “path”;
    import { describe, it, expect } from “vitest”;

    describe(“Tailwind + Warm Balance bridge”, () => {
      it(“@theme references existing CSS variables”, () => {
        const css = readFileSync(resolve(“app/globals.css”), “utf-8”);
        expect(css).toContain(“@theme”);
        expect(css).toContain(“var(--background)”);
        expect(css).toContain(“var(--accent)”);
      });
    });
    ```
    This confirms `@theme` and var mappings exist without rendering anything visible. Include this test in Task 4 gates.

  - [ ] Leave all `*.module.css` imports and content untouched (they coexist with Tailwind)

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
- **Sass/SCSS import order:** In `globals.css`, Tailwind `@import` must come before token/color definitions OR you must re-order to: token `:root` block → `@import "tailwindcss"` → `@theme`. Tailwind's cascade-layer approach handles this; if utilities don't apply, check import order first.
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

### Tailwind v4 key differences from v3

- **CSS-first:** No `tailwind.config.js` — all config lives in CSS via `@import "tailwindcss"` and `@theme`
- **Dark mode:** Use `@custom-variant dark` (Task 2) to tie `dark:` utilities to `html.dark` class; prefer plain utilities that reference `var(--background)` for automatic light/dark switching via CSS var overrides
- **PostCSS required:** Install `@tailwindcss/postcss` plugin; Next.js auto-detects `postcss.config.mjs`


### Testing

- **Quality gates in Task 4:** `typecheck`, `lint`, `test`, `build` — all must pass
- **Bridge validation test (from Task 2):** Add readFileSync test to verify `@theme` + `var(--…)` exist in `globals.css`; does not require rendering or computed styles
- **Manual smoke check:** Open browser devtools after `npm run build` on Soft-Ledger list detail page:
  - Inspect a button: should see Tailwind utility classes **and** Warm Balance token CSS vars applied
  - Example: `<button class="... bg-accent ..." style="--background: #F7F3EC">` (or computed value in Styles pane)
- **Do NOT use `getComputedStyle` for CSS vars in jsdom** (causes jsdom/CSS var sync issues; Story 3.1 lesson)
- **Soft-Ledger module tests:** CSS mocks remain unchanged; existing tests stay green
- **Coverage floor:** Applies only to `lib/**` + `app/api/**` — UI CSS bridge tests don't feed coverage meter

### Project Structure Notes

- Work only under `ui/`
- Branch epic segment `3.5` avoids confusion with Epic 3 product key `3-5-materialize-…`
- Story key: `3-5-1-install-tailwind-sass-warm-balance-theme` (= Epic **3.5** story 1)

### PostCSS Plugin Conflicts

If `ui/package.json` lists other PostCSS plugins (e.g., `autoprefixer`, `cssnano`), they can coexist with `@tailwindcss/postcss` BUT:
- **Autoprefixer:** Safe; works after Tailwind. Tailwind v4 already vendor-prefixes; autoprefixer is redundant but harmless.
- **cssnano or similar minifiers:** Safe in production, but can strip CSS layers during build. If build output looks wrong, move cssnano to a separate production build step or remove it (Next.js already minifies).
- **Other Tailwind plugins:** Do not mix plugins from `@tailwindcss/*` (e.g., `@tailwindcss/forms`) — Story 3.5 uses unstyled primitives only (AD-12).

Verify after build that utilities generate by checking browser devtools on any element (`class` attribute should include `bg-*`, `text-*` etc. if you use them).

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
- 2026-08-10: Validation improvements applied:
  - Added pre-flight checklist (remove stale configs, verify versions)
  - Replaced illustrative @theme example with concrete working Tailwind v4 syntax
  - Added explicit Tailwind v4 docs link and CSS-first explanation
  - Expanded preflight caution with concrete symptoms and escape hatch
  - Added TypeScript strict mode guidance for CSS imports
  - Added PostCSS plugin conflict prevention section
  - Consolidated duplicate install guidance
  - Added concrete vitest testing example for bridge validation
  - Clarified Sass/SCSS import order requirements
