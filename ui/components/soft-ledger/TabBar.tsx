import Link from "next/link";

import { HomeIcon, UploadIcon, UserIcon } from "@/app/icons";
import iconButtonStyles from "@/components/IconButton/IconButton.module.scss";

export type TabKey = "home" | "upload" | "account";

type TabBarProps = {
  homeHref: string;
  uploadHref: string;
  accountHref: string;
  homeLabel: string;
  uploadLabel: string;
  accountLabel: string;
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

export function TabBar({
  homeHref,
  uploadHref,
  accountHref,
  homeLabel,
  uploadLabel,
  accountLabel,
  active,
  ariaLabel,
}: TabBarProps) {
  return (
    <nav
      className="flex justify-evenly items-center mt-auto shrink-0 bg-surface border-t border-border"
      aria-label={ariaLabel}
    >
      <Link
        className={tabClass}
        href={homeHref}
        aria-label={homeLabel}
        aria-current={active === "home" ? "page" : undefined}
      >
        <HomeIcon className={iconClass} />
      </Link>
      <Link
        className={tabClass}
        href={uploadHref}
        aria-label={uploadLabel}
        aria-current={active === "upload" ? "page" : undefined}
      >
        <UploadIcon className={iconClass} />
      </Link>
      <Link
        className={tabClass}
        href={accountHref}
        aria-label={accountLabel}
        aria-current={active === "account" ? "page" : undefined}
      >
        <UserIcon className={iconClass} />
      </Link>
    </nav>
  );
}
