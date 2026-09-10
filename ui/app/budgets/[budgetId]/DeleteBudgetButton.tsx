"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { IconButton } from "@/components/IconButton";
import { TrashIcon } from "@/app/icons/TrashIcon";
import { DiscardConfirmDialog } from "@/app/upload/DiscardConfirmDialog";
import { deleteBudget, type BudgetsClientMessages } from "../budgetsClient";

export type DeleteBudgetButtonMessages = BudgetsClientMessages & {
  budgetsDeleteAria: string;
  budgetsDeleteConfirmTitle: string;
  budgetsDeleteConfirmBody: string;
  budgetsDeleteConfirmAction: string;
  budgetsDeleting: string;
  cancelLabel: string;
};

type Props = {
  budgetId: string;
  messages: DeleteBudgetButtonMessages;
};

/** Standalone delete-budget affordance in the detail chrome, between the edit
 * (pencil) and docs (?) actions — a modal popup confirmation (not the sliding
 * edit Sheet), since deleting is a separate destructive action, not a field edit.
 */
export function DeleteBudgetButton({ budgetId, messages }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirmDelete() {
    setDeleting(true);
    const result = await deleteBudget(budgetId, messages);
    setDeleting(false);
    if (result.ok) {
      setOpen(false);
      router.push("/budgets");
      return;
    }
    setError(result.error);
  }

  return (
    <>
      <IconButton
        icon={<TrashIcon className="size-5" />}
        label={messages.budgetsDeleteAria}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <DiscardConfirmDialog
        open={open}
        title={messages.budgetsDeleteConfirmTitle}
        body={error ? `${messages.budgetsDeleteConfirmBody} ${error}` : messages.budgetsDeleteConfirmBody}
        confirmLabel={deleting ? messages.budgetsDeleting : messages.budgetsDeleteConfirmAction}
        cancelLabel={messages.cancelLabel}
        pending={deleting}
        onConfirm={onConfirmDelete}
        onCancel={() => {
          if (deleting) return;
          setOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
