"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { CreditCardIcon } from "@/app/icons";
import { DiscardConfirmDialog } from "@/app/upload/DiscardConfirmDialog";

export type SettleControlsMessages = {
  settleAction: string;
  settleConfirmTitle: string;
  settleConfirmBody: string;
  settleConfirmAction: string;
  settleCancel: string;
  errorGeneric: string;
};

type Props = {
  listId: string;
  messages: SettleControlsMessages;
};

/**
 * Settle CTA — full-width icon button anchored to the bottom of the balance
 * strip (Story 5.8). Simplify no longer lives here: it renders unconditionally
 * as its own grid column (see SimplifyColumn) once a list has 3+ members.
 */
export function SettleControls({ listId, messages }: Props) {
  const router = useRouter();
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlePending, setSettlePending] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  async function confirmSettle() {
    if (settlePending) return;
    setSettlePending(true);
    setSettleError(null);
    let response: Response;
    try {
      response = await fetch(`/api/lists/${encodeURIComponent(listId)}/settle`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
    } catch {
      setSettlePending(false);
      setSettleError(messages.errorGeneric);
      return;
    }
    setSettlePending(false);
    if (response.status !== 204 && !response.ok) {
      setSettleError(messages.errorGeneric);
      return;
    }
    setSettleOpen(false);
    router.refresh();
  }

  return (
    <>
      <PrimaryButton
        onClick={() => setSettleOpen(true)}
        iconLeft={<CreditCardIcon className="size-4 shrink-0" />}
      >
        {messages.settleAction}
      </PrimaryButton>

      <DiscardConfirmDialog
        open={settleOpen}
        title={messages.settleConfirmTitle}
        body={settleError ? `${messages.settleConfirmBody} ${settleError}` : messages.settleConfirmBody}
        confirmLabel={messages.settleConfirmAction}
        cancelLabel={messages.settleCancel}
        pending={settlePending}
        onConfirm={() => {
          void confirmSettle();
        }}
        onCancel={() => {
          if (settlePending) return;
          setSettleOpen(false);
          setSettleError(null);
        }}
      />
    </>
  );
}
