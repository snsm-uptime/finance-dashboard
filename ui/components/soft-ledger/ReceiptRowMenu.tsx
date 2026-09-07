"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DotsIcon, FolderIcon, PencilIcon, TrashIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import {
  IconButtonPopup,
  IconButtonPopupItem,
} from "@/components/IconButtonPopup";
import { DiscardConfirmDialog } from "@/app/upload/DiscardConfirmDialog";
import { deleteExpense, rollbackImportBatch } from "@/app/lists/listsClient";

import styles from "./ReceiptRowMenu.module.scss";

export type ReceiptRowMenuMessages = {
  menuAria: string;
  editLabel: string;
  deleteLabel: string;
  moveStatementLabel?: string;
};

export type ReceiptRowRollback = {
  listId: string;
  batchId: string;
  confirmTitle: string;
  confirmBody: string;
  confirmAction: string;
  cancelLabel: string;
  errorGeneric: string;
  errorForbidden: string;
  errorUnauthorized: string;
};

/** Hard-delete confirm for a single hand-entered entry (403 `expense_not_deletable` for parsed rows). */
export type ReceiptRowDeleteEntry = {
  listId: string;
  entryId: string;
  confirmTitle: string;
  confirmBody: string;
  confirmAction: string;
  cancelLabel: string;
  errorGeneric: string;
  errorForbidden: string;
  errorUnauthorized: string;
};

type Props = {
  messages: ReceiptRowMenuMessages;
  onMoveStatement?: () => void;
  onEdit?: () => void;
  rollback?: ReceiptRowRollback;
  /** Hand-entered rows only — parsed rows keep `rollback` (whole-batch undo) instead. */
  deleteEntry?: ReceiptRowDeleteEntry;
};

/**
 * Overflow menu. Edit opens the full edit sheet (`onEdit`). Delete persists either as a
 * single-entry hard delete (`deleteEntry`, hand rows) or a confirmed batch rollback (`rollback`,
 * parsed rows) — callers pass at most one of the two.
 */
export function ReceiptRowMenu({ messages, onMoveStatement, onEdit, rollback, deleteEntry }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canDelete = Boolean(deleteEntry || rollback);

  return (
    <>
      <IconButtonPopup
        panelClassName={styles.menuPanel}
        button={
          <IconButton
            type="button"
            variant="muted"
            label={messages.menuAria}
            icon={<DotsIcon />}
          />
        }
      >
        <IconButtonPopupItem onClick={onEdit}>
          <span className="flex items-center gap-4">
            <PencilIcon className="h-4 w-4 shrink-0" />
            {messages.editLabel}
          </span>
        </IconButtonPopupItem>
        <IconButtonPopupItem
          danger
          onClick={canDelete ? () => setConfirmOpen(true) : undefined}
        >
          <span className="flex items-center gap-4">
            <TrashIcon className="h-4 w-4 shrink-0" />
            {messages.deleteLabel}
          </span>
        </IconButtonPopupItem>
        {messages.moveStatementLabel && onMoveStatement ? (
          <IconButtonPopupItem onClick={onMoveStatement}>
            <span className="flex items-center gap-4">
              <FolderIcon className="h-4 w-4 shrink-0" />
              {messages.moveStatementLabel}
            </span>
          </IconButtonPopupItem>
        ) : null}
      </IconButtonPopup>
      {deleteEntry ? (
        <DeleteEntryConfirm
          deleteEntry={deleteEntry}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
        />
      ) : rollback ? (
        <RollbackBatchConfirm
          rollback={rollback}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
        />
      ) : null}
    </>
  );
}

function DeleteEntryConfirm({
  deleteEntry,
  open,
  onOpenChange,
}: {
  deleteEntry: ReceiptRowDeleteEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await deleteExpense(deleteEntry.listId, deleteEntry.entryId, {
      errorGeneric: deleteEntry.errorGeneric,
      errorInvalidName: deleteEntry.errorGeneric,
      errorForbidden: deleteEntry.errorForbidden,
      errorUnauthorized: deleteEntry.errorUnauthorized,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <DiscardConfirmDialog
      open={open}
      title={deleteEntry.confirmTitle}
      body={error ? `${deleteEntry.confirmBody} ${error}` : deleteEntry.confirmBody}
      confirmLabel={deleteEntry.confirmAction}
      cancelLabel={deleteEntry.cancelLabel}
      pending={pending}
      onConfirm={() => {
        void confirmDelete();
      }}
      onCancel={() => {
        if (pending) return;
        onOpenChange(false);
        setError(null);
      }}
    />
  );
}

function RollbackBatchConfirm({
  rollback,
  open,
  onOpenChange,
}: {
  rollback: ReceiptRowRollback;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRollback() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await rollbackImportBatch(rollback.listId, rollback.batchId, {
      errorGeneric: rollback.errorGeneric,
      errorInvalidName: rollback.errorGeneric,
      errorForbidden: rollback.errorForbidden,
      errorUnauthorized: rollback.errorUnauthorized,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <DiscardConfirmDialog
      open={open}
      title={rollback.confirmTitle}
      body={error ? `${rollback.confirmBody} ${error}` : rollback.confirmBody}
      confirmLabel={rollback.confirmAction}
      cancelLabel={rollback.cancelLabel}
      pending={pending}
      onConfirm={() => {
        void confirmRollback();
      }}
      onCancel={() => {
        if (pending) return;
        onOpenChange(false);
        setError(null);
      }}
    />
  );
}
