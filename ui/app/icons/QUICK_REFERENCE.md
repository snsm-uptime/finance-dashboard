# Icons Quick Reference

## Available Icons

| Icon | Use Case | Import | Notes |
|------|----------|--------|-------|
| **SaveIcon** | Persist/save actions | `import { SaveIcon } from "@/app/icons"` | Document with save indicator |
| **SendIcon** | Submit/send actions | `import { SendIcon } from "@/app/icons"` | Arrow/send shape |
| **CloseIcon** | Close/dismiss buttons | `import { CloseIcon } from "@/app/icons"` | X shape, widely used |
| **PlusIcon** | Add/create actions | `import { PlusIcon } from "@/app/icons"` | Plus sign |
| **DotsIcon** | Menu triggers | `import { DotsIcon } from "@/app/icons"` | Vertical three dots |
| **ShareIcon** | Invite/share actions | `import { ShareIcon } from "@/app/icons"` | Connected circles network |
| **PieChartIcon** | Analytics/split settings | `import { PieChartIcon } from "@/app/icons"` | Pie chart visualization |
| **EyeIcon** | Password visibility | `import { EyeIcon } from "@/app/icons"` | Requires `open` prop (bool) |
| **HashtagIcon** | Exact-amount split | `import { HashtagIcon } from "@/app/icons"` | Slanted hash |
| **PercentageIcon** | Percentage split | `import { PercentageIcon } from "@/app/icons"` | Two circles + slash |

## Common Patterns

### Basic Usage
```tsx
import { PlusIcon } from "@/app/icons";

function Component() {
  return <button><PlusIcon /></button>;
}
```

### With Styling
```tsx
// CSS Module
<PlusIcon className={styles.icon} />

// Inline styles
<PlusIcon style={{ width: "20px", height: "20px" }} />

// Tailwind
<PlusIcon className="w-5 h-5" />
```

### With Props
```tsx
// Color via currentColor
<SaveIcon style={{ color: "var(--accent)" }} />

// SVG attributes
<ShareIcon viewBox="0 0 24 24" />
```

### EyeIcon Special Case
```tsx
// EyeIcon requires 'open' boolean prop
const [showPassword, setShowPassword] = useState(false);

<EyeIcon open={showPassword} />
```

## Icon Grid Sizes

Most icons are designed for 24x24 viewport (viewBox="0 0 24 24"), except:
- **DotsIcon**: 16x16 viewBox

Let the viewBox handle scaling — just adjust container/parent size.

## Accessibility

All icons have `aria-hidden="true"` and use `currentColor`. Pair with:
- Button `aria-label` for icon-only buttons
- Parent element text for labeled actions
- Form labels for input-adjacent icons

Example:
```tsx
<button aria-label="Save changes">
  <SaveIcon />
</button>
```

## File Organization
```
app/icons/
├── SaveIcon.tsx
├── SendIcon.tsx
├── CloseIcon.tsx
├── PlusIcon.tsx
├── DotsIcon.tsx
├── ShareIcon.tsx
├── PieChartIcon.tsx
├── EyeIcon.tsx
├── index.ts          // ← Central export point
├── README.md         # Detailed reference
├── QUICK_REFERENCE.md # This file
└── MIGRATION.md      # Migration history
```

## Adding New Icons

1. Create `NameIcon.tsx` in `app/icons/`
2. Export from `index.ts`
3. Document in README.md

Template:
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
      {/* SVG content */}
    </svg>
  );
}
```
