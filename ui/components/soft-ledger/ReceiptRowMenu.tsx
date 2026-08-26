"use client";

import { DotsIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import {
  IconButtonPopup,
  IconButtonPopupItem,
} from "@/components/IconButtonPopup";

export type ReceiptRowMenuMessages = {
  menuAria: string;
  editLabel: string;
  deleteLabel: string;
  moveStatementLabel?: string;
};

type Props = {
  messages: ReceiptRowMenuMessages;
  onMoveStatement?: () => void;
};

/**
 * Home-list-style overflow menu. Edit/Delete are present and do not persist.
 */
export function ReceiptRowMenu({ messages, onMoveStatement }: Props) {
  return (
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
      <IconButtonPopupItem danger>{messages.deleteLabel}</IconButtonPopupItem>
      {messages.moveStatementLabel && onMoveStatement ? (
        <IconButtonPopupItem onClick={onMoveStatement}>
          {messages.moveStatementLabel}
        </IconButtonPopupItem>
      ) : null}
    </IconButtonPopup>
  );
}
