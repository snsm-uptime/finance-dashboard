"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { usePreferences } from "@/components/PreferencesProvider";
import { TabBar } from "@/components/soft-ledger/TabBar";
import { accountCopy } from "@/lib/i18n/account";
import { showsAppChrome, tabKeyFromPath } from "@/lib/appChrome";
import { listsMessages } from "@/lib/i18n/lists";

/** Persistent application chrome around authenticated pages. Auth/setup routes skip it. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { locale } = usePreferences();
  const t = listsMessages[locale];
  const account = accountCopy(locale);

  if (!showsAppChrome(pathname)) {
    return children;
  }

  return (
    <div className="flex flex-col h-dvh max-h-dvh overflow-hidden">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">{children}</div>
      <TabBar
        homeHref="/home"
        uploadHref="/upload"
        accountHref="/account"
        homeLabel={t.tabList}
        uploadLabel={t.uploadLink}
        accountLabel={account.navAccount}
        ariaLabel={t.tabNavAria}
        active={tabKeyFromPath(pathname)}
      />
    </div>
  );
}
