"use client";

import { useChromeHeader } from "@/components/ChromeBack";

/** Opts list detail into AppShell Back + title (same chrome as statement review). */
export function ListDetailChrome({ title }: { title: string }) {
  useChromeHeader({ backHref: "/home", title });
  return null;
}
