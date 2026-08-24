"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { BackIcon } from "@/app/icons";
import {
  ChromeBackProvider,
  chromeHeaderIsActive,
  useChromeHeaderState,
} from "@/components/ChromeBack";
import { IconButton } from "@/components/IconButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { TabBar } from "@/components/soft-ledger/TabBar";
import { accountCopy } from "@/lib/i18n/account";
import { showsAppChrome, tabKeyFromPath } from "@/lib/appChrome";
import { listsMessages } from "@/lib/i18n/lists";

/** Persistent application chrome around authenticated pages. Auth/setup routes skip it. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ChromeBackProvider>
      <AppShellFrame>{children}</AppShellFrame>
    </ChromeBackProvider>
  );
}

function AppShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { locale } = usePreferences();
  const t = listsMessages[locale];
  const account = accountCopy(locale);
  const header = useChromeHeaderState();
  const showHeader = chromeHeaderIsActive(header);

  if (!showsAppChrome(pathname)) {
    return <div className="fixed inset-0 overflow-y-auto">{children}</div>;
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <div className="relative flex flex-col flex-1 min-h-0">
        {showHeader ? (
          <header
            data-app-chrome="header"
            className="flex shrink-0 items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-1 pl-[max(0.5rem,env(safe-area-inset-left))]"
          >
            <div className="flex w-10 shrink-0 items-center justify-start">
              {header.onBack || header.backHref ? (
                <IconButton
                  variant="ghost"
                  label={t.chromeBack}
                  icon={<BackIcon className="size-6" />}
                  onClick={() => {
                    if (header.onBack) {
                      header.onBack();
                      return;
                    }
                    if (header.backHref) router.push(header.backHref);
                  }}
                />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              {header.title ? (
                <h1 className="m-0 truncate text-[1.5rem] font-[550] text-foreground">
                  {header.title}
                </h1>
              ) : null}
              {header.details ? (
                <span className="shrink-0 text-[0.85rem] text-muted">{header.details}</span>
              ) : null}
            </div>
            {header.trailing ? (
              <div className="flex shrink-0 items-center gap-1">{header.trailing}</div>
            ) : null}
          </header>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</div>
      </div>
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
