"use client";

import type { ReactNode } from "react";

import { ChipOptionsPanel, ChipTrigger, useChipPicker, type ChipOption } from "@/components/ChipPicker";
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

const panelContentClassName = "mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-border";

/**
 * Compact card row: label + saved-routing chip. Clicking the chip slides a
 * menu of selectable chips down from beneath the row — "Review" plus one
 * per list. Picking a chip applies and saves it immediately. The chip
 * always reflects the last saved setting, not in-progress edits.
 */
export function CardRoutingControl({ card, lists, messages, onUpdated, trailing }: Props) {
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
        close();
      },
    },
  );

  const { chipId, panelId, chipRef, open, toggle, close, onRootKeyDown } = useChipPicker({
    onOpen: clearError,
    onClose: clearError,
  });

  const fixedListName =
    card.routing_mode === "fixed"
      ? lists.find((list) => list.id === card.fixed_list_id)?.name
      : undefined;
  const chipLabel =
    card.routing_mode === "fixed"
      ? (fixedListName ?? messages.routingChipFixed)
      : messages.routingChipReview;
  const chipAria = `${messages.routingTitle}: ${chipLabel}`;

  // Mirrors the origin chip menu: the currently active setting is already
  // shown on the trigger chip, so it's left out of the selectable row.
  const selections = new Map<string, RoutingSelection>();
  const options: ChipOption[] = [];
  if (card.routing_mode !== "review") {
    selections.set("review", { mode: "review", fixedListId: null });
    options.push({ value: "review", label: messages.routingChipReview, ariaLabel: messages.routingModeReview });
  }
  for (const list of lists) {
    if (card.routing_mode === "fixed" && card.fixed_list_id === list.id) continue;
    selections.set(list.id, { mode: "fixed", fixedListId: list.id });
    options.push({ value: list.id, label: list.name, ariaLabel: `${messages.routingModeFixed}: ${list.name}` });
  }

  function onSelect(value: string) {
    const selection = selections.get(value);
    if (selection) void submit(selection);
  }

  return (
    <div className="flex flex-col" onKeyDown={onRootKeyDown}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-[550] text-foreground text-[0.95rem] truncate">{card.label}</span>
          <ChipTrigger
            ref={chipRef}
            id={chipId}
            panelId={panelId}
            open={open}
            tone={card.routing_mode === "fixed" ? "accent" : "muted"}
            ariaLabel={chipAria}
            onClick={toggle}
          >
            {chipLabel}
          </ChipTrigger>
        </div>
        {trailing}
      </div>
      <ChipOptionsPanel
        open={open}
        id={panelId}
        labelledBy={chipId}
        options={options}
        disabled={pending}
        error={error}
        onSelect={onSelect}
        contentClassName={panelContentClassName}
      />
    </div>
  );
}
