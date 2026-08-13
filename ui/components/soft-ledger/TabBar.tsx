import Link from "next/link";

export type TabKey = "list" | "upload" | "account";

type TabBarProps = {
  listHref: string;
  uploadHref: string;
  accountHref: string;
  listLabel: string;
  uploadLabel: string;
  accountLabel: string;
  active: TabKey;
  /** Localized landmark label (required — do not hardcode English). */
  ariaLabel: string;
};

const baseTabClass =
  "block text-center py-[var(--space-3)] px-[var(--space-1)] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const tabClass = `${baseTabClass} text-muted`;
const tabActiveClass = `${baseTabClass} text-accent`;

export function TabBar({
  listHref,
  uploadHref,
  accountHref,
  listLabel,
  uploadLabel,
  accountLabel,
  active,
  ariaLabel,
}: TabBarProps) {
  return (
    <nav
      className="grid grid-cols-3 mt-auto bg-surface border-t border-border"
      style={{
        fontFamily: "var(--type-tab-face)",
        fontSize: "var(--type-tab-size)",
        fontWeight: "var(--type-tab-weight)",
      }}
      aria-label={ariaLabel}
    >
      <Link
        className={active === "list" ? tabActiveClass : tabClass}
        href={listHref}
        aria-current={active === "list" ? "page" : undefined}
      >
        {listLabel}
      </Link>
      <Link
        className={active === "upload" ? tabActiveClass : tabClass}
        href={uploadHref}
        aria-current={active === "upload" ? "page" : undefined}
      >
        {uploadLabel}
      </Link>
      <Link
        className={active === "account" ? tabActiveClass : tabClass}
        href={accountHref}
        aria-current={active === "account" ? "page" : undefined}
      >
        {accountLabel}
      </Link>
    </nav>
  );
}
