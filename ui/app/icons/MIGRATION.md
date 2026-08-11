# Icon Centralization Migration

## Summary
All custom SVG icons have been centralized in `/app/icons/` to improve maintainability and reduce duplication.

## Icons Created
1. **SaveIcon** - Document save icon
2. **SendIcon** - Send/arrow icon
3. **CloseIcon** - X/close icon
4. **PlusIcon** - Plus/add icon
5. **DotsIcon** - Vertical dots/menu icon
6. **ShareIcon** - Share/network icon
7. **PieChartIcon** - Pie chart visualization icon
8. **EyeIcon** - Eye icon for password visibility toggle

## Files Updated

### Components that imported centralized icons:
- ✅ `app/lists/FormIconSubmit.tsx` - Uses SaveIcon, SendIcon
- ✅ `app/lists/ListsPanel.tsx` - Uses DotsIcon, CloseIcon, PlusIcon
- ✅ `app/lists/ListDetailMobileActions.tsx` - Uses PlusIcon, PieChartIcon, ShareIcon, CloseIcon
- ✅ `app/lists/TemporalNavigation.tsx` - Uses ShareIcon, PieChartIcon, CloseIcon
- ✅ `app/lists/ShareTitleButton.tsx` - Uses ShareIcon
- ✅ `app/signup/SignupForm.tsx` - Uses EyeIcon
- ✅ `app/sign-in/SignInForm.tsx` - Uses EyeIcon
- ✅ `app/reset-password/ResetPasswordForm.tsx` - Uses EyeIcon

## Removed Duplicate Definitions
- Removed 17 inline SVG icon definitions across 8 component files
- Eliminated duplicate icon definitions (e.g., CloseIcon, ShareIcon, PieChartIcon appeared in multiple files)

## Benefits
1. **Single source of truth** - All icons defined in one location
2. **Easier maintenance** - Update icon design in one place affects all uses
3. **Consistent styling** - All icons use currentColor for color inheritance
4. **Reusability** - Icons can be easily discovered and reused
5. **Reduced duplication** - Eliminated ~500 lines of duplicated SVG code

## Icon Design Standards
All centralized icons follow these conventions:
- Use `currentColor` for color inheritance
- Include `aria-hidden="true"` (assume decorative or paired with aria-labels)
- Support flexible sizing through className and SVG props
- Consistent stroke widths (2 or 2.2)
- ViewBox for responsive scaling

## Import Pattern
```tsx
// Import from centralized location
import { SaveIcon, SendIcon, CloseIcon, /* ... */ } from "@/app/icons";

// Use with className
<SaveIcon className={styles.icon} />

// Or with inline styles
<ShareIcon style={{ width: "24px", height: "24px" }} />

// Or with SVG props
<PlusIcon aria-label="Add item" />
```

## Future Improvements
- Consider creating icon variants (sizes, weights) if needed
- Document icon grid/sizing consistency guidelines
- Consider automated icon asset pipeline if adding more icons
