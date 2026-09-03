"use client";

import { useChromeHeader } from "@/components/ChromeBack";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";

/** Opts list detail into AppShell Back + title (same chrome as statement review). */
export function ListDetailChrome({ title }: { title: string }) {
  useChromeHeader({
    backHref: "/home",
    title,
    trailing: <DocsHelpButton pageName="Lists" docsAnchor="/docs#lists" />,
  });
  return null;
}
