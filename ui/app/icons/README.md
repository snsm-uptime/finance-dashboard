# SVG Icons

Centralized location for all custom SVG icon components used throughout the UI.

## Icons

### SaveIcon

A document with a save indicator. Used for persist/save actions.

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### SendIcon

An arrow/send indicator. Used for submit/send actions (e.g., invitations).

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### CloseIcon

An X shape for closing/dismissing. Used on close buttons in modals and overlays.

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### PlusIcon

A plus sign. Used for add/create actions.

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### DotsIcon

Three vertical dots for menu triggers.

- ViewBox: `0 0 16 16` (smaller than others)
- Style: Fill-based
- Accepts: className, SVG element props

### ShareIcon

Three connected circles representing sharing/network. Used for invite/share actions.

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### PieChartIcon

A pie chart visualization. Used for split settings and analytics.

- ViewBox: `0 0 24 24`
- Style: Mixed (stroke + fill)
- Accepts: className, SVG element props

### EyeIcon

An eye for password visibility toggle. Shows open/closed eye based on `open` prop.

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Required prop: `open` (boolean)
- Accepts: className, SVG element props

### CopyIcon

Two overlapping rectangles representing copy-to-clipboard. Used for copy actions (e.g., copying a masked IBAN).

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### FileIcon

A document with two text lines. Used as the resting glyph for file/statement surfaces.

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### FileImportIcon

The same document with its left edge gapped and an inbound arrow through it. The static end state of the import morph.

- ViewBox: `0 0 24 24`
- Style: Stroke-based
- Accepts: className, SVG element props

### FileImportMorphIcon

Animates FileIcon into FileImportIcon. See [Animated Icons](#animated-icons) — the shapes are re-encoded here, not imported from the two static glyphs.

- ViewBox: `0 0 24 24`
- Style: Stroke-based, client component (`"use client"`)
- Optional prop: `active` (boolean) — drives the morph
- Accepts: className, SVG element props

> Not yet documented above: `HomeIcon`, `UploadIcon`, `SpinnerIcon`, `UserIcon`.

## Usage

All icons are exported from `@/app/icons`:

```tsx
import { SaveIcon, SendIcon, CloseIcon } from "@/app/icons";

function MyComponent() {
  return (
    <>
      <SaveIcon className={styles.icon} />
      <SendIcon />
      <CloseIcon style={{ width: "24px", height: "24px" }} />
    </>
  );
}
```

## Styling

Icons use `currentColor` for their strokes/fills, allowing them to inherit color from parent CSS. Apply styles via:

- **className**: CSS module classes or tailwind
- **style**: Inline styles (width, height, color, etc.)
- **Props**: Any SVG element attributes (viewBox, aria-*, etc.)

## Animated Icons

Most glyphs here are static. A few change with state, and they follow one set of conventions so they stay consistent with each other and with the chrome around them.

### The state contract

**The host owns the state; the glyph only renders it.** `IconButton` has no animation contract — it takes `icon` as an already-rendered element, so it cannot inject state into a glyph. Whichever component owns the interaction (`UploadButton`, `CopyButton`, the auth forms) owns the boolean and passes it down.

**`active` is the animation input.** Any glyph that animates on a transient interaction state takes `active?: boolean`, defaulting to `false` so the server render is the resting shape.

**Semantic props stay semantic.** `EyeIcon` takes `open` because that describes password visibility, not an animation. A glyph with a meaningful state of its own keeps that prop name and maps it to `active` internally — don't rename domain state to match the animation.

**Reduced motion is honoured by default.** Skip the travel, keep the destination: jump straight to the end state when `prefers-reduced-motion: reduce` matches. Never skip the state change itself, only the movement.

### Shared motion values

`motion.ts` holds what the glyph and its chrome must agree on:

- `MOTION_DURATION_MS` — also applied to the host button's CSS transition, so lift/fill/shadow and the glyph land together.
- `motionEase` — the JS-side curve for frame-by-frame glyphs. It approximates, but does not exactly equal, the CSS easing on the chrome.

Read these rather than hardcoding. The family already has one drift of this kind: `EyeIcon` hardcodes `strokeWidth="1.75"` while everything else reads `ICON_STROKE` from `stroke.ts`.

### CSS or JS?

Prefer CSS. Rotations (`PlusIcon` → X), fades, and line draw-ons (`stroke-dasharray` / `stroke-dashoffset`) are all expressible as CSS transitions — no client boundary, no animation frame loop. `IconButton` spreads `{...rest}` onto its `<button>`, so a host can pass `data-active={someState}` and a CSS module can drive the glyph from `[data-active="true"] .part { … }` with no component changes at all.

Reach for JS only when the path genuinely changes shape. `FileImportMorphIcon` is the one case in this codebase: the file body gaps open and a text line folds into an arrowhead, which no transform or dash offset can express. Note that the CSS `d` property is not an option — Safari parses it and does nothing (WebKit 234227, re-checked 2026-08).

### Writing a morph: the collapsed-point technique

Native and JS path interpolation both require the two `d` strings to have **the same commands in the same order** — only the numbers may differ. That sounds restrictive, but a line and a two-armed arrowhead can share one structure if you write the line as a polyline whose last point sits on top of its previous one.

`FileIcon`'s short text line is `M8 17h5`. Written as an `M,L,l` polyline with a collapsed third point, it draws exactly the same pixels:

```
M8 17 13 17l0 0     ← same line, now interpolatable
M9.5 9.5 12 12l-2.5 2.5   ← the arrowhead it becomes
```

Interpolating between them swings the line up and unfolds the second arm out of it. Both planned glyphs can use the same trick — the eye's slash (`M4 4l16 16` growing from a collapsed point) and the check in a copy→copied morph (`M20 6 9 17l-5-5`, already a three-point polyline).

Each shape is then a pure function of progress `t` in `[0, 1]`, e.g. `headAt(t)`. Keeping the templates pure — no time, no events, no React inside them — is what lets the driver around them change later without touching any shape.

## Design Standards

- All icons use `currentColor` for color inheritance
- Stroke width is typically 2 or 2.2 for consistency
- All icons have `aria-hidden="true"` for accessibility (assume they're decorative or paired with aria-labels)
- viewBox ensures icons scale responsively without explicit dimensions
