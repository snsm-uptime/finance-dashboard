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

## Design Standards

- All icons use `currentColor` for color inheritance
- Stroke width is typically 2 or 2.2 for consistency
- All icons have `aria-hidden="true"` for accessibility (assume they're decorative or paired with aria-labels)
- viewBox ensures icons scale responsively without explicit dimensions
