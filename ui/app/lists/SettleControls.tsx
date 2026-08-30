"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SimplifyPanel, type SimplifyTransfer } from "@/components/soft-ledger/SimplifyPanel";
import { DiscardConfirmDialog } from "@/app/upload/DiscardConfirmDialog";
import { formatCrcAmount } from "@/lib/currency";

export type SettleControlsMessages = {
  simplifyAction: string;
  simplifyTitle: string;
  simplifyEmpty: string;
  simplifyBlocked: string;
  settleAction: string;
  settleConfirmTitle: string;
  settleConfirmBody: string;
  settleConfirmAction: string;
  settleCancel: string;
  copyPlanLabel: string;
  copyPlanCopiedLabel: string;
  errorGeneric: string;
};

type Props = {
  listId: string;
  messages: SettleControlsMessages;
  /** AC #5 — no Simplify affordance while unresolved conflicts touch this list. */
  simplifyAvailable: boolean;
};

type RawTransfer = {
  from_member_id?: unknown;
  from_alias?: unknown;
  to_member_id?: unknown;
  to_alias?: unknown;
  amount_crc?: unknown;
};

function memberFallback(memberId: string): string {
  return `${memberId.slice(0, 8)}…`;
}

function asTransfers(data: unknown): SimplifyTransfer[] | null {
  if (!data || typeof data !== "object") return null;
  const rows = (data as { transfers?: unknown }).transfers;
  if (!Array.isArray(rows)) return null;
  const out: SimplifyTransfer[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return null;
    const r = row as RawTransfer;
    if (typeof r.from_member_id !== "string" || typeof r.to_member_id !== "string" || typeof r.amount_crc !== "string") {
      return null;
    }
    out.push({
      fromMemberId: r.from_member_id,
      fromLabel: typeof r.from_alias === "string" && r.from_alias ? r.from_alias : memberFallback(r.from_member_id),
      toMemberId: r.to_member_id,
      toLabel: typeof r.to_alias === "string" && r.to_alias ? r.to_alias : memberFallback(r.to_member_id),
      amountCrc: formatCrcAmount(r.amount_crc),
    });
  }
  return out;
}

type SimplifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "blocked" }
  | { status: "error" }
  | { status: "loaded"; transfers: SimplifyTransfer[] };

/**
 * Simplify + Settle client island (Story 5.8). Both are user-triggered, not
 * part of initial page load — `page.tsx` stays an async Server Component.
 */
export function SettleControls({ listId, messages, simplifyAvailable }: Props) {
  const router = useRouter();
  const [simplify, setSimplify] = useState<SimplifyState>({ status: "idle" });
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlePending, setSettlePending] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const toggleSimplify = useCallback(async () => {
    if (simplify.status === "loading") return;
    if (simplify.status === "loaded" || simplify.status === "blocked") {
      setSimplify({ status: "idle" });
      return;
    }
    setSimplify({ status: "loading" });
    let response: Response;
    try {
      response = await fetch(`/api/lists/${encodeURIComponent(listId)}/settle/simplify`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
    } catch {
      setSimplify({ status: "error" });
      return;
    }
    if (response.status === 409) {
      setSimplify({ status: "blocked" });
      return;
    }
    if (!response.ok) {
      setSimplify({ status: "error" });
      return;
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      setSimplify({ status: "error" });
      return;
    }
    const transfers = asTransfers(data);
    if (transfers === null) {
      setSimplify({ status: "error" });
      return;
    }
    setSimplify({ status: "loaded", transfers });
  }, [listId, simplify.status]);

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
    <div className="mx-strip-inset flex flex-wrap items-center gap-[var(--space-2)] px-[var(--space-4)]">
      {simplifyAvailable ? (
        <PrimaryButton onClick={() => void toggleSimplify()}>{messages.simplifyAction}</PrimaryButton>
      ) : null}
      <PrimaryButton onClick={() => setSettleOpen(true)}>{messages.settleAction}</PrimaryButton>

      {simplify.status === "loaded" ? (
        <SimplifyPanel
          transfers={simplify.transfers}
          messages={{
            title: messages.simplifyTitle,
            emptyLabel: messages.simplifyEmpty,
            copyLabel: messages.copyPlanLabel,
            copiedLabel: messages.copyPlanCopiedLabel,
          }}
        />
      ) : null}
      {simplify.status === "blocked" ? (
        <p role="status" className="m-0 w-full text-muted" style={{ fontFamily: "var(--type-meta-face)" }}>
          {messages.simplifyBlocked}
        </p>
      ) : null}
      {simplify.status === "error" ? (
        <p role="alert" className="m-0 w-full text-owe" style={{ fontFamily: "var(--type-meta-face)" }}>
          {messages.errorGeneric}
        </p>
      ) : null}

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
    </div>
  );
}
