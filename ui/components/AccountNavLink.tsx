"use client";

import Link from "next/link";

import { usePreferences } from "@/components/PreferencesProvider";
import { accountCopy } from "@/lib/i18n/account";

import styles from "./AccountNavLink.module.css";

/** Chrome link to Account — replaces bare SignOut on authenticated pages. */
export function AccountNavLink() {
  const { locale } = usePreferences();
  const t = accountCopy(locale);
  return (
    <Link className={styles.link} href="/account">
      {t.navAccount}
    </Link>
  );
}
