"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DotsIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import {
  IconButtonPopup,
  IconButtonPopupItem,
} from "@/components/IconButtonPopup";
import { DiscardConfirmDialog } from "@/app/upload/DiscardConfirmDialog";
import { rollbackImportBatch } from "@/app/lists/listsClient";

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

type Props = {
  messages: ReceiptRowMenuMessages;
  onMoveStatement?: () => void;
  rollback?: ReceiptRowRollback;
};

/**
 * Overflow menu. Edit never persists. Delete persists only as confirmed batch rollback.
 */
export function ReceiptRowMenu({ messages, onMoveStatement, rollback }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <IconButtonPopup
        button={
          <IconButton
            type="button"
            variant="muted"
            label={messages.menuAria}
            icon={<DotsIcon />}
          />
        }
      >
        <IconButtonPopupItem>{messages.editLabel}</IconButtonPopupItem>
        <IconButtonPopupItem
          danger
          onClick={rollback ? () => setConfirmOpen(true) : undefined}
        >
          {messages.deleteLabel}
        </IconButtonPopupItem>
        {messages.moveStatementLabel && onMoveStatement ? (
          <IconButtonPopupItem onClick={onMoveStatement}>
            {messages.moveStatementLabel}
          </IconButtonPopupItem>
        ) : null}
      </IconButtonPopup>
      {rollback ? (
        <RollbackBatchConfirm
          rollback={rollback}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
        />
      ) : null}
    </>
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
