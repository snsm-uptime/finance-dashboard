"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { chipClassName } from "@/components/Chip";
import { SlideDown } from "@/components/SlideDown";
import { useFormSubmission } from "@/hooks";
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

type RoutingSelection = { mode: "fixed" | "review"; fixedListId: string | null };

const focusRing =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Compact card row: label + saved-routing chip. Clicking the chip slides a
 * menu of selectable chips down from beneath the row — "Review" plus one
 * per list. Picking a chip applies and saves it immediately. The chip
 * always reflects the last saved setting, not in-progress edits.
 */
export function CardRoutingControl({ card, lists, messages, onUpdated, trailing }: Props) {
  const baseId = useId();
  const chipId = `${baseId}-chip`;
  const panelId = `${baseId}-panel`;
  const chipRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const { pending, error, submit, clearError } = useFormSubmission(
    async (selection: RoutingSelection) => {
      const result = await setCardRouting(
        card.id,
        {
          routing_mode: selection.mode,
          fixed_list_id: selection.mode === "fixed" ? selection.fixedListId : null,
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

  const fixedListName =
    card.routing_mode === "fixed"
      ? lists.find((list) => list.id === card.fixed_list_id)?.name
      : undefined;
  const chipLabel =
    card.routing_mode === "fixed"
      ? (fixedListName ?? messages.routingChipFixed)
      : messages.routingChipReview;
  const chipAria = `${messages.routingTitle}: ${chipLabel}`;

  function closePanel() {
    clearError();
    setOpen(false);
    chipRef.current?.focus();
  }

  function toggle() {
    if (open) {
      closePanel();
      return;
    }
    clearError();
    setOpen(true);
  }

  function onRootKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    closePanel();
  }

  // Mirrors the origin chip menu: the currently active setting is already
  // shown on the trigger chip, so it's left out of the selectable row.
  const options: { key: string; label: string; ariaLabel: string; onSelect: () => void }[] = [];
  if (card.routing_mode !== "review") {
    options.push({
      key: "review",
      label: messages.routingChipReview,
      ariaLabel: messages.routingModeReview,
      onSelect: () => submit({ mode: "review", fixedListId: null }),
    });
  }
  for (const list of lists) {
    if (card.routing_mode === "fixed" && card.fixed_list_id === list.id) continue;
    options.push({
      key: list.id,
      label: list.name,
      ariaLabel: `${messages.routingModeFixed}: ${list.name}`,
      onSelect: () => submit({ mode: "fixed", fixedListId: list.id }),
    });
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
        <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={pending}
              aria-label={option.ariaLabel}
              onClick={option.onSelect}
              className={`${chipClassName.muted} ${focusRing} hover:border-muted disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {option.label}
            </button>
          ))}
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
