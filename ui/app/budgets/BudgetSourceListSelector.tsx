"use client";

import { ItemChipSelector } from "@/components/ItemChipSelector";

export type BudgetSourceListSelectorMessages = {
  triggerLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  sheetTitle: string;
};

type Props = {
  /** Available source lists (non-archived) */
  sourceLists: Array<{ id: string; name: string }>;
  /** Currently selected source list name */
  currentListName: string;
  /** Budget ID to update */
  budgetId: string;
  /** Callback to update budget's source list */
  onChangeSourceList: (
    budgetId: string,
    newSourceListName: string
  ) => Promise<void>;
  /** UI messages */
  messages: BudgetSourceListSelectorMessages;
};

/**
 * Budget-specific wrapper around ItemChipSelector for moving a budget
 * to a different source list. Single-select only.
 */
export function BudgetSourceListSelector({
  sourceLists,
  currentListName,
  budgetId,
  onChangeSourceList,
  messages,
}: Props) {
  const sourceListNames = sourceLists.map((list) => list.name);

  const handleChange = async (selected: string[]) => {
    const newListName = selected[0];
    if (newListName && newListName !== currentListName) {
      await onChangeSourceList(budgetId, newListName);
    }
  };

  return (
    <ItemChipSelector
      labels={sourceListNames}
      mode="single"
      defaultLabel={currentListName}
      onChange={handleChange}
      triggerLabel={messages.triggerLabel}
      confirmLabel={messages.confirmLabel}
      cancelLabel={messages.cancelLabel}
      sheetTitle={messages.sheetTitle}
    />
  );
}
