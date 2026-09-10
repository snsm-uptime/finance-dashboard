"use client";

import type { ReactNode } from "react";

import { useChromeHeader } from "@/components/ChromeBack";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";
import { ArchiveBudgetButton } from "./ArchiveBudgetButton";
import { DeleteBudgetButton, type DeleteBudgetButtonMessages } from "./DeleteBudgetButton";

/** Opts budget detail into AppShell Back + title (same chrome as list detail). */
export function BudgetDetailChrome({
  title,
  progressBar,
  budgetId,
  isArchived,
  archiveLabel,
  unarchiveLabel,
  messages,
  editAction,
}: {
  title: string;
  /** Rendered fixed above the chrome header, outside the scrollable page (Story 7.4). */
  progressBar?: ReactNode;
  budgetId: string;
  isArchived: boolean;
  archiveLabel: string;
  unarchiveLabel: string;
  messages: DeleteBudgetButtonMessages;
  /** Edit-budget affordance (Story 7.5), rendered alongside the docs help button. */
  editAction?: ReactNode;
}) {
  useChromeHeader({
    backHref: "/budgets",
    title,
    progressBar,
    trailing: (
      <>
        <ArchiveBudgetButton
          budgetId={budgetId}
          isArchived={isArchived}
          archiveLabel={archiveLabel}
          unarchiveLabel={unarchiveLabel}
          messages={messages}
        />
        {editAction}
        <DeleteBudgetButton budgetId={budgetId} isArchived={isArchived} messages={messages} />
        <DocsHelpButton pageName="Budgets" docsAnchor="/docs#budgets" />
      </>
    ),
  });
  return null;
}
