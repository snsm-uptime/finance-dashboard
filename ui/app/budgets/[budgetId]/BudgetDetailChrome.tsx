"use client";

import type { ReactNode } from "react";

import { useChromeHeader } from "@/components/ChromeBack";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";

/** Opts budget detail into AppShell Back + title (same chrome as list detail). */
export function BudgetDetailChrome({
  title,
  progressBar,
  editAction,
}: {
  title: string;
  /** Rendered fixed above the chrome header, outside the scrollable page (Story 7.4). */
  progressBar?: ReactNode;
  /** Edit-budget affordance (Story 7.5), rendered alongside the docs help button. */
  editAction?: ReactNode;
}) {
  useChromeHeader({
    backHref: "/budgets",
    title,
    progressBar,
    trailing: (
      <>
        {editAction}
        <DocsHelpButton pageName="Budgets" docsAnchor="/docs#budgets" />
      </>
    ),
  });
  return null;
}
