This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Component Architecture

See **[COMPONENT_PATTERNS.md](./COMPONENT_PATTERNS.md)** for:
- **Icon management** — centralized SVG icons in `/app/icons/`, how to create and use them
- **Component patterns** — naming conventions, file organization, prop typing
- **Styling approach** — Tailwind + CSS modules conventions
- **Testing and documentation** — standards for reusable components

Quick links:
- **Icon reference:** `/app/icons/README.md`
- **Icon quick start:** `/app/icons/QUICK_REFERENCE.md`

## Styling

- **Default:** Tailwind CSS utilities co-located in components
- **Custom only:** `*.module.scss` for complex selectors, animations, or custom styles
- **Forbidden:** New `*.module.css` files; kit/starter palettes; re-picking Warm Balance hexes
- **Tokens:** Use CSS variables from `globals.css` (Warm Balance light/dark + Soft-Ledger spacing/shape); wired into Tailwind via `@theme` bridge (see `ARCHITECTURE-SPINE.md` AD-12 & AD-23 for details)
- **Spacing caveat:** Prefer the named `--spacing-*` utilities (`strip-inset`, `page-gutter`, `nav-x`, `row-y`) or the raw `--space-*` CSS variables over Tailwind's generic numeric spacing scale — `p-3`/`gap-3`/etc. resolve to Tailwind's own `0.25rem` step (12px), which is **not** the same value as the project's `--space-3` (10px) despite the matching number
- **Icon styling:** See **COMPONENT_PATTERNS.md** → Icon Management section for icon-specific styling patterns

## Developer Resources

### UI Development
- **Component Patterns:** [COMPONENT_PATTERNS.md](./COMPONENT_PATTERNS.md) — Component standards, icon management, styling guidelines
- **Icons:** [app/icons/README.md](./app/icons/README.md) — Complete icon reference and usage guide
- **Quick Icon Reference:** [app/icons/QUICK_REFERENCE.md](./app/icons/QUICK_REFERENCE.md) — Icon cheat sheet for developers

### Next.js
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial
- [Next.js GitHub](https://github.com/vercel/next.js) - source code and discussions

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
