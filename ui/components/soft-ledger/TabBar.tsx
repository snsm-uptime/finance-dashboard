import Link from "next/link";
import type { ComponentType, SVGProps } from "react";

import iconButtonStyles from "@/components/IconButton/IconButton.module.scss";

/** A tab's identity is caller-defined — new tabs are just new items, no prop added here. */
export type TabKey = string;

export type TabBarItem = {
  key: TabKey;
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type TabBarProps = {
  items: TabBarItem[];
  active?: TabKey;
  /** Localized landmark label (required — do not hardcode English). */
  ariaLabel: string;
};

/** Same compact ghost chrome as BalanceStrip's icon cluster (IconButton variant="ghost"). */
const tabClass = [
  "inline-flex flex-shrink-0 items-center justify-center size-11 m-0 p-1 border-0 rounded-[8px] bg-transparent text-muted no-underline cursor-pointer leading-none transition-all duration-150",
  iconButtonStyles.button,
  iconButtonStyles.ghost,
].join(" ");
const iconClass = "size-6";

/** Bottom nav — dynamic over `items` so a new tab (e.g. Budgets) is one array
 * entry, not a new prop pair + a new hardcoded <Link>. */
export function TabBar({ items, active, ariaLabel }: TabBarProps) {
  return (
    <nav
      className="flex justify-evenly items-center mt-auto shrink-0 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          className={tabClass}
          href={item.href}
          aria-label={item.label}
          aria-current={active === item.key ? "page" : undefined}
        >
          <item.Icon className={iconClass} />
        </Link>
      ))}
    </nav>
  );
}
