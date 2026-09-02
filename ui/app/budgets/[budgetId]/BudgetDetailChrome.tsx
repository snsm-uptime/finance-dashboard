"use client";

import { useChromeHeader } from "@/components/ChromeBack";

/** Opts budget detail into AppShell Back + title (same chrome as list detail). */
export function BudgetDetailChrome({ title }: { title: string }) {
  useChromeHeader({ backHref: "/budgets", title });
  return null;
}
