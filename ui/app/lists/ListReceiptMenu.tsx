"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormIconSubmit } from "@/components/FormIconSubmit/FormIconSubmit";
import { ItemChipSelector } from "@/components/ItemChipSelector";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import {
  ReceiptRowMenu,
  type ReceiptRowDeleteEntry,
  type ReceiptRowRollback,
} from "@/components/soft-ledger/ReceiptRowMenu";

import { EditExpenseForm, type EditExpenseFormMessages } from "./EditExpenseForm";
import { Sheet } from "./Sheet";
import {
  fetchLists,
  reassignEntry,
  reassignStatement,
  type ExpenseItem,
  type ListItem,
  type ListMember,
  type ListsClientMessages,
} from "./listsClient";

export type ListReceiptMenuMessages = ListsClientMessages &
  EditExpenseFormMessages & {
    menuAria: string;
    editLabel: string;
    deleteLabel: string;
    moveItemLabel: string;
    moveStatementLabel: string;
    moveItemConfirm: string;
    moveItemConfirmAction: string;
    moveConfirm: string;
    pickerTitle: string;
    confirmAction: string;
    cancelLabel: string;
    emptyDestLabel: string;
    deleteExpenseConfirmTitle: string;
    deleteExpenseConfirmBody: string;
    deleteExpenseConfirmAction: string;
    deleteExpenseConfirmCancel: string;
  };

type Props = {
  listId: string;
  currentUserId: string;
  members: ListMember[];
  expense: ExpenseItem;
  statementId: string | null;
  messages: ListReceiptMenuMessages;
  rollback?: ReceiptRowRollback;
};

export function ListReceiptMenu({
  listId,
  currentUserId,
  members,
  expense,
  statementId,
  messages,
  rollback,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moveItemOpen, setMoveItemOpen] = useState(false);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deleteEntry: ReceiptRowDeleteEntry | undefined =
    expense.provenance === "hand"
      ? {
          listId,
          entryId: expense.id,
          confirmTitle: messages.deleteExpenseConfirmTitle,
          confirmBody: messages.deleteExpenseConfirmBody,
          confirmAction: messages.deleteExpenseConfirmAction,
          cancelLabel: messages.deleteExpenseConfirmCancel,
          errorGeneric: messages.errorGeneric,
          errorForbidden: messages.errorForbidden,
          errorUnauthorized: messages.errorUnauthorized,
        }
      : undefined;

  async function openPicker() {
    setError(null);
    setSelectedId(null);
    const result = await fetchLists(messages);
    if (!result.ok) {
      setLists([]);
      setSelectedId(null);
      setError(result.error);
      setOpen(true);
      return;
    }
    setLists(result.lists.filter((item) => item.id !== listId));
    setOpen(true);
  }

  async function openMoveItemPicker() {
    const result = await fetchLists(messages);
    if (result.ok) {
      setLists(result.lists.filter((item) => item.id !== listId));
    }
    setMoveItemOpen(true);
  }

  async function confirmMove() {
    if (!statementId || !selectedId) return;
    setBusy(true);
    setError(null);
    const result = await reassignStatement(listId, statementId, selectedId, messages);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function handleMoveItem(selectedListNames: string[]) {
    const selectedListName = selectedListNames[0];
    if (!selectedListName) return;

    // Find the list ID from the name
    const selectedListId = lists.find((l) => l.name === selectedListName)?.id;
    if (!selectedListId) return;

    const result = await reassignEntry(listId, expense.id, selectedListId, messages);
    if (!result.ok) {
      throw new Error(result.error);
    }
    router.refresh();
  }

  return (
    <>
      <ReceiptRowMenu
        messages={{
          menuAria: messages.menuAria,
          editLabel: messages.editLabel,
          deleteLabel: messages.deleteLabel,
          moveItemLabel: messages.moveItemLabel,
          moveStatementLabel: statementId ? messages.moveStatementLabel : undefined,
        }}
        onMoveItem={openMoveItemPicker}
        onMoveStatement={statementId ? openPicker : undefined}
        onEdit={() => setEditOpen(true)}
        rollback={rollback}
        deleteEntry={deleteEntry}
      />
      <EditExpenseForm
        listId={listId}
        currentUserId={currentUserId}
        members={members}
        expense={expense}
        messages={messages}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={messages.cancelLabel}
        title={messages.pickerTitle}
        body={
          <div className="flex flex-col gap-[var(--space-3)]">
            <p className="m-0 text-muted" style={{ fontFamily: "var(--type-body-face)" }}>
              {messages.moveConfirm}
            </p>
            <ul className="m-0 list-none p-0">
              {lists.length === 0 ? (
                <li className="py-[var(--space-3)] text-muted">{messages.emptyDestLabel}</li>
              ) : (
                lists.map((item) => (
                <li key={item.id} className="border-b border-border">
                  <button
                    type="button"
                    className="w-full cursor-pointer border-none bg-transparent px-0 py-[var(--space-3)] text-left text-foreground"
                    aria-pressed={selectedId === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    {item.name}
                  </button>
                </li>
                ))
              )}
            </ul>
            {error ? (
              <p role="alert" className="m-0 text-owe">
                {error}
              </p>
            ) : null}
          </div>
        }
        footer={
          <div className="flex justify-end gap-[var(--space-2)]">
            <GhostButton onClick={() => setOpen(false)}>
              {messages.cancelLabel}
            </GhostButton>
            <PrimaryButton onClick={confirmMove} disabled={!selectedId || busy} loading={busy}>
              {messages.confirmAction}
            </PrimaryButton>
          </div>
        }
      />
      <ItemChipSelector
        open={moveItemOpen}
        onOpenChange={setMoveItemOpen}
        labels={lists.map((l) => l.name)}
        mode="single"
        defaultLabel=""
        onChange={handleMoveItem}
        cancelLabel={messages.cancelLabel}
        confirmLabel={messages.moveItemConfirmAction}
        sheetTitle={messages.pickerTitle}
      />
    </>
  );
}
