"use client";

import Link from "next/link";

import { usePreferences } from "@/components/PreferencesProvider";
import { accountCopy } from "@/lib/i18n/account";

/** Chrome link to Account — replaces bare SignOut on authenticated pages. */
export function AccountNavLink() {
  const { locale } = usePreferences();
  const t = accountCopy(locale);
  return (
    <Link
      className="text-accent font-semibold no-underline text-[0.9rem] hover:underline"
      href="/account"
    >
      {t.navAccount}
    </Link>
  );
}
