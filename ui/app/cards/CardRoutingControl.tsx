"use client";

import { useId, useState } from "react";

import { useFormSubmission } from "@/hooks";
import { SoftLedgerRadio } from "@/components/soft-ledger/Radio";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import type { ListItem } from "../lists/listsClient";
import { setCardRouting, type CardItem, type CardsClientMessages } from "./cardsClient";

export type CardRoutingMessages = CardsClientMessages & {
  routingModeFixed: string;
  routingModeReview: string;
  routingListLabel: string;
  routingSave: string;
  routingSaving: string;
};

type Props = {
  card: CardItem;
  lists: ListItem[];
  messages: CardRoutingMessages;
  onUpdated: (card: CardItem) => void;
};

export function CardRoutingControl({ card, lists, messages, onUpdated }: Props) {
  const baseId = useId();
  const modeName = `${baseId}-routing-mode`;
  const [mode, setMode] = useState<"fixed" | "review">(card.routing_mode);
  const [fixedListId, setFixedListId] = useState(card.fixed_list_id ?? "");

  const { pending, error, submit, clearError } = useFormSubmission(
    async (input: { mode: "fixed" | "review"; fixedListId: string }) => {
      const result = await setCardRouting(
        card.id,
        {
          routing_mode: input.mode,
          fixed_list_id: input.mode === "fixed" ? input.fixedListId : null,
        },
        messages,
      );
      if (result.ok) onUpdated(result.card);
      return result;
    },
  );

  const canSubmit = !pending && (mode === "review" || fixedListId.length > 0);

  return (
    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border">
      <div className="flex items-center gap-4">
        <SoftLedgerRadio
          name={modeName}
          checked={mode === "review"}
          disabled={pending}
          onChange={() => {
            setMode("review");
            clearError();
          }}
        >
          {messages.routingModeReview}
        </SoftLedgerRadio>
        <SoftLedgerRadio
          name={modeName}
          checked={mode === "fixed"}
          disabled={pending}
          onChange={() => {
            setMode("fixed");
            clearError();
          }}
        >
          {messages.routingModeFixed}
        </SoftLedgerRadio>
      </div>
      {mode === "fixed" ? (
        <SoftLedgerSelect
          aria-label={messages.routingListLabel}
          value={fixedListId}
          disabled={pending}
          options={lists.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(value) => {
            setFixedListId(value);
            clearError();
          }}
        />
      ) : null}
      <button
        type="button"
        className="font-inherit text-[0.8rem] font-semibold py-[0.4rem] px-[0.75rem] rounded-[8px] border border-accent bg-accent text-on-accent cursor-pointer self-start disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canSubmit}
        onClick={() => submit({ mode, fixedListId })}
      >
        {pending ? messages.routingSaving : messages.routingSave}
      </button>
      <div aria-live="polite">
        {error ? (
          <p className="text-owe text-[0.85rem] m-0" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
