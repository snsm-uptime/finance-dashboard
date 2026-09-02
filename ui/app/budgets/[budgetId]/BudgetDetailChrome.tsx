"use client";

import type { ReactNode } from "react";

import { useChromeHeader } from "@/components/ChromeBack";

/** Opts budget detail into AppShell Back + title (same chrome as list detail). */
export function BudgetDetailChrome({
  title,
  progressBar,
}: {
  title: string;
  /** Rendered fixed above the chrome header, outside the scrollable page (Story 7.4). */
  progressBar?: ReactNode;
}) {
  useChromeHeader({ backHref: "/budgets", title, progressBar });
  return null;
}
