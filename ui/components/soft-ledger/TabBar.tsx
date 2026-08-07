import Link from "next/link";

import styles from "./TabBar.module.css";

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
    <nav className={styles.bar} aria-label={ariaLabel}>
      <Link
        className={active === "list" ? styles.tabActive : styles.tab}
        href={listHref}
        aria-current={active === "list" ? "page" : undefined}
      >
        {listLabel}
      </Link>
      <Link
        className={active === "upload" ? styles.tabActive : styles.tab}
        href={uploadHref}
        aria-current={active === "upload" ? "page" : undefined}
      >
        {uploadLabel}
      </Link>
      <Link
        className={active === "account" ? styles.tabActive : styles.tab}
        href={accountHref}
        aria-current={active === "account" ? "page" : undefined}
      >
        {accountLabel}
      </Link>
    </nav>
  );
}
