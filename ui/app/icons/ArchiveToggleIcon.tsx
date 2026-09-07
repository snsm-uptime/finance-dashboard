import type { SVGProps } from "react";

import { BoxIcon } from "./BoxIcon";
import { OpenBoxIcon } from "./OpenBoxIcon";

type Props = SVGProps<SVGSVGElement> & {
  /** Archived view/action (true) vs active view/action (false). */
  active?: boolean;
};

/**
 * Shared archive/unarchive toggle glyph — swaps between `BoxIcon` (closed,
 * archive) and `OpenBoxIcon` (open, unarchive) on `active`. Used by every
 * archive-toggle control (lists, cards, budgets) so they stay visually
 * consistent.
 */
export function ArchiveToggleIcon({ active = false, ...props }: Props) {
  return active ? <OpenBoxIcon active {...props} /> : <BoxIcon {...props} />;
}
