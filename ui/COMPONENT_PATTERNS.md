# Component Patterns

This document establishes patterns and standards for building reusable components in the Warm Balance UI. Follow these guidelines when creating new components to maintain consistency, discoverability, and ease of maintenance.

## Icon Management

### Overview
All custom SVG icons are centralized in `/app/icons/` to improve maintainability, reduce duplication, and make it easier to track icon usage across the application.

**Single source of truth:** Every icon has one definition. Update it in one place, and all uses reflect the change.

### Icon File Structure
```
app/icons/
├── SaveIcon.tsx          # Individual icon component
├── SendIcon.tsx
├── CloseIcon.tsx
├── PlusIcon.tsx
├── DotsIcon.tsx
├── ShareIcon.tsx
├── PieChartIcon.tsx
├── EyeIcon.tsx
├── index.ts              # Central export point
├── README.md             # Detailed icon reference
├── QUICK_REFERENCE.md    # Developer quick guide
└── MIGRATION.md          # Migration history
```

### Creating a New Icon

1. **Create the component file** in `/app/icons/NameIcon.tsx`:

```tsx
import type { SVGProps } from "react";

export function NameIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
    >
      {/* SVG paths and content */}
      <path d="..." />
    </svg>
  );
}
```

2. **Export from `index.ts`**:
```tsx
export { NameIcon } from "./NameIcon";
```

3. **Document in `README.md`**:
   - Add to the icons table
   - Include use case and design notes
   - Note viewBox dimensions if non-standard

### Using Icons

**Import from centralized location:**
```tsx
import { SaveIcon, SendIcon, CloseIcon } from "@/app/icons";
```

**Apply styles via className:**
```tsx
<SaveIcon className={styles.icon} />
```

**Or via inline styles:**
```tsx
<ShareIcon style={{ width: "24px", height: "24px" }} />
```

**Or via SVG props:**
```tsx
<PlusIcon aria-label="Add item" title="Add new item" />
```

### Icon Design Standards

All icons follow these conventions to ensure consistency:

- **Color inheritance:** Use `currentColor` for strokes/fills — icons inherit color from parent CSS
- **Accessibility:** Include `aria-hidden="true"` (assume icons are decorative or paired with aria-labels)
- **Responsiveness:** Use `viewBox` (e.g., `viewBox="0 0 24 24"`) for scaling without explicit dimensions
- **Stroke width:** Typically 2 or 2.2 for visual consistency
- **Flexibility:** Accept `className`, inline `style`, and any SVG element attributes via props spread

### Available Icons

See `/app/icons/README.md` for the complete icon reference and `/app/icons/QUICK_REFERENCE.md` for a developer quick start.

Current icons:
- **SaveIcon** — Document with save indicator; persist/save actions
- **SendIcon** — Arrow/send shape; submit/send actions (invitations, etc.)
- **CloseIcon** — X shape; close/dismiss buttons in modals and overlays
- **PlusIcon** — Plus sign; add/create actions
- **DotsIcon** — Vertical three dots; menu triggers (note: 16x16 viewBox)
- **ShareIcon** — Connected circles; invite/share actions
- **PieChartIcon** — Pie chart visualization; split settings and analytics
- **EyeIcon** — Open/closed eye; password visibility toggle (requires `open` boolean prop)

### Icon Usage Rules

✅ **Do:**
- Use centralized icons from `/app/icons`
- Reuse existing icons before creating new ones
- Apply styling via CSS modules or inline styles on parent containers
- Pair icon-only buttons with `aria-label` for accessibility
- Use SVG props for semantic attributes (`aria-label`, `title`, etc.)

❌ **Don't:**
- Define inline SVG icons in components
- Create duplicate icon definitions
- Hardcode viewBox dimensions in component markup
- Use icons without proper accessibility labels on icon-only controls

## Future Component Patterns

As you build more shared components, add sections here for:
- Button variants and states
- Form input patterns
- Modal/dialog structure
- Card and list item patterns
- Loading states and skeletons
- Error states and validation
- etc.

Document the pattern, show examples, and link to implementations.

## Component File Organization

### Naming Conventions
- **Components:** PascalCase (e.g., `SaveIcon.tsx`, `UserCard.tsx`)
- **CSS Modules:** camelCase with component name (e.g., `UserCard.module.css`)
- **Exported functions:** PascalCase matching file name

### Import Order
1. React and Next.js imports
2. Centralized shared imports (`@/app/icons`, etc.)
3. Local imports (relative paths)
4. Styles

```tsx
import { useState } from "react";
import Link from "next/link";

import { SaveIcon } from "@/app/icons";
import { UserCard } from "./UserCard";
import styles from "./MyComponent.module.css";
```

### Prop Typing
- Use explicit types over `any`
- Extract complex prop objects into `type` declarations
- For flexible components, use React's `SVGProps<SVGSVGElement>` or similar type spreads

```tsx
import type { SVGProps } from "react";

export function MyIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return <svg className={className} {...props} />;
}
```

## CSS and Styling

See `/ui/README.md` Styling section for the canonical approach:
- **Default:** Tailwind CSS utilities co-located in components
- **Custom only:** `*.module.scss` for complex selectors, animations, or custom styles
- **Tokens:** Use CSS variables from `globals.css` (Warm Balance light/dark + Soft-Ledger spacing/shape)

When styling components with icons:
- Style the container button/div; let icons inherit `currentColor`
- Use CSS variables for color themes (`--accent`, `--muted`, `--foreground`, etc.)
- Avoid hardcoding colors in icon components

## Testing Components

- Include unit tests for stateful components
- Test keyboard navigation and focus management for interactive components
- Verify accessibility: ARIA labels, semantic HTML, keyboard support
- Test dark mode by inspecting CSS variable inheritance

## Documentation

Every reusable component should have:
1. **JSDoc comment** describing purpose and props
2. **Usage example** in the component file or nearby README
3. **Reference in COMPONENT_PATTERNS.md** if it's a commonly reused pattern

Example:
```tsx
/**
 * Icon-only submit button. Enabled when form is dirty; muted disabled look when nothing changed.
 * @param variant - 'save' for persist actions, 'send' for invitations
 * @param label - Accessible name (also used as tooltip via title)
 */
export function FormIconSubmit({ variant = "save", label, ...rest }: FormIconSubmitProps) {
  // ...
}
```

## Related References

- **Icon quick reference:** `app/icons/QUICK_REFERENCE.md`
- **Styling guide:** `README.md` Styling section
- **Project architecture:** See `/architecture/ARCHITECTURE-SPINE.md` in planning artifacts
- **Tailwind config:** `tailwind.config.ts`
- **CSS variables:** `globals.css`
