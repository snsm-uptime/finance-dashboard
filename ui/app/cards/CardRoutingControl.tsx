"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { SlideDown } from "@/components/SlideDown";
import { useFormSubmission } from "@/hooks";
import { SoftLedgerRadio } from "@/components/soft-ledger/Radio";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import type { ListItem } from "../lists/listsClient";
import { setCardRouting, type CardItem, type CardsClientMessages } from "./cardsClient";

export type CardRoutingMessages = CardsClientMessages & {
  routingTitle: string;
  routingChipFixed: string;
  routingChipReview: string;
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
  /** Right-side of the compact row — typically the masked IBAN + copy control. */
  trailing?: ReactNode;
};

/**
 * Compact card row: label + saved-routing chip. Clicking the chip slides the
 * routing form down from beneath the row. The chip always reflects the last
 * saved setting, not in-progress edits.
 */
export function CardRoutingControl({ card, lists, messages, onUpdated, trailing }: Props) {
  const baseId = useId();
  const modeName = `${baseId}-routing-mode`;
  const chipId = `${baseId}-chip`;
  const panelId = `${baseId}-panel`;
  const chipRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"fixed" | "review">(card.routing_mode);
  const [fixedListId, setFixedListId] = useState(card.fixed_list_id ?? "");

  useEffect(() => {
    if (fixedListId && !lists.some((list) => list.id === fixedListId)) {
      setFixedListId("");
    }
  }, [lists, fixedListId]);

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
    {
      onSuccess: () => {
        setOpen(false);
        chipRef.current?.focus();
      },
    },
  );

  const canSubmit = !pending && (mode === "review" || fixedListId.length > 0);
  const chipLabel =
    card.routing_mode === "fixed" ? messages.routingChipFixed : messages.routingChipReview;
  const chipAria = `${messages.routingTitle}: ${chipLabel}`;

  function discardDraft() {
    setMode(card.routing_mode);
    setFixedListId(card.fixed_list_id ?? "");
    clearError();
  }

  function closePanel() {
    if (!pending) discardDraft();
    setOpen(false);
    chipRef.current?.focus();
  }

  function toggle() {
    if (open) {
      closePanel();
      return;
    }
    setOpen(true);
  }

  function onRootKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    if ((event.target as HTMLElement).closest('[role="listbox"]')) return;
    event.stopPropagation();
    closePanel();
  }

  return (
    <div className="flex flex-col" onKeyDown={onRootKeyDown}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-[550] text-foreground text-[0.95rem] truncate">{card.label}</span>
          <button
            ref={chipRef}
            type="button"
            id={chipId}
            aria-label={chipAria}
            aria-expanded={open}
            aria-controls={panelId}
            title={chipAria}
            onClick={toggle}
            className={
              card.routing_mode === "fixed"
                ? "inline-flex flex-shrink-0 items-center gap-1 m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-accent text-accent bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-none cursor-pointer hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                : "inline-flex flex-shrink-0 items-center gap-1 m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-border text-muted bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-none cursor-pointer hover:border-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            }
          >
            {chipLabel}
            <span
              aria-hidden="true"
              className={`inline-block w-[0.32rem] h-[0.32rem] border-r-[1.5px] border-b-[1.5px] border-current opacity-70 transition-transform duration-200 motion-reduce:transition-none ${
                open ? "rotate-[225deg] translate-y-px" : "rotate-45 -translate-y-px"
              }`}
            />
          </button>
        </div>
        {trailing}
      </div>
      <SlideDown open={open} id={panelId} labelledBy={chipId}>
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
      </SlideDown>
    </div>
  );
}
