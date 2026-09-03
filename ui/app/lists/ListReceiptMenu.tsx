"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { ReceiptRowMenu, type ReceiptRowRollback } from "@/components/soft-ledger/ReceiptRowMenu";

import { Sheet } from "./Sheet";
import {
  fetchLists,
  reassignStatement,
  type ListItem,
  type ListsClientMessages,
} from "./listsClient";

export type ListReceiptMenuMessages = ListsClientMessages & {
  menuAria: string;
  editLabel: string;
  deleteLabel: string;
  moveStatementLabel: string;
  moveConfirm: string;
  pickerTitle: string;
  confirmAction: string;
  cancelLabel: string;
  emptyDestLabel: string;
};

type Props = {
  listId: string;
  statementId: string | null;
  messages: ListReceiptMenuMessages;
  rollback?: ReceiptRowRollback;
};

export function ListReceiptMenu({ listId, statementId, messages, rollback }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <ReceiptRowMenu
        messages={{
          menuAria: messages.menuAria,
          editLabel: messages.editLabel,
          deleteLabel: messages.deleteLabel,
          moveStatementLabel: statementId ? messages.moveStatementLabel : undefined,
        }}
        onMoveStatement={statementId ? openPicker : undefined}
        rollback={rollback}
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
    </>
  );
}
