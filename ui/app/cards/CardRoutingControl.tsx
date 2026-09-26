"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ChipOptionsPanel, ChipTrigger, useChipPicker, type ChipOption } from "@/components/ChipPicker";
import { GhostTextField } from "@/components/soft-ledger/GhostTextField";
import { useFormSubmission } from "@/hooks";
import type { ListItem } from "../lists/listsClient";
import { setCardLabel, setCardRouting, type CardItem, type CardsClientMessages } from "./cardsClient";

const CARD_LABEL_MAX_LENGTH = 100;

export type CardRoutingMessages = CardsClientMessages & {
  routingTitle: string;
  routingChipFixed: string;
  routingChipReview: string;
  routingModeFixed: string;
  routingModeReview: string;
  routingListLabel: string;
  routingSave: string;
  routingSaving: string;
  renameLabel: string;
};

type Props = {
  card: CardItem;
  lists: ListItem[];
  /** Lists offered as fixed-routing targets — omits the default review-routing list. */
  routingLists?: ListItem[];
  messages: CardRoutingMessages;
  onUpdated: (card: CardItem) => void;
  /** Called after a successful inline label rename (Story: inline card label rename). */
  onLabelUpdated: (card: CardItem) => void;
  /** Right-side of the compact row — typically the masked IBAN + copy control. */
  trailing?: ReactNode;
};

type TitleState = "idle" | "primed" | "editing";

type RoutingSelection = { mode: "fixed" | "review"; fixedListId: string | null };

const panelContentClassName = "mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-border";

/**
 * Compact card row: label + saved-routing chip. Clicking the chip slides a
 * menu of selectable chips down from beneath the row — "Review" plus one
 * per list. Picking a chip applies and saves it immediately. The chip
 * always reflects the last saved setting, not in-progress edits.
 */
export function CardRoutingControl({
  card,
  lists,
  routingLists = lists,
  messages,
  onUpdated,
  onLabelUpdated,
  trailing,
}: Props) {
  const [titleState, setTitleState] = useState<TitleState>("idle");
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [titleSubmitting, setTitleSubmitting] = useState(false);
  const titleSubmittingRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleContainerRef = useRef<HTMLDivElement | null>(null);

  // Card list refresh mid-edit (e.g. archive toggle) resets a row's rename
  // state for free: CardsPanel keys each rendered row on `card.id`
  // (itemKey={(card) => card.id}), so when this card's id disappears the
  // whole component instance unmounts — there is no stale-state case to
  // clean up from inside an effect here.

  useEffect(() => {
    if (titleState !== "editing") return;
    const input = titleInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [titleState]);

  useEffect(() => {
    if (titleState === "idle") return;
    function onPointerDown(event: PointerEvent) {
      if (titleSubmittingRef.current) return;
      const container = titleContainerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) {
        return;
      }
      cancelTitleEdit();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [titleState]);

  function cancelTitleEdit() {
    if (titleSubmittingRef.current) return;
    setTitleState("idle");
    setTitleDraft("");
    setTitleError(null);
  }

  function handleTitleClick() {
    if (titleState === "idle") {
      setTitleDraft(card.label);
      setTitleError(null);
      setTitleState("primed");
      return;
    }
    if (titleState === "primed") {
      setTitleState("editing");
    }
  }

  async function commitTitleEdit() {
    if (titleSubmittingRef.current) return;
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0) {
      setTitleError(messages.errorInvalidLabel);
      return;
    }
    if (trimmed === card.label) {
      setTitleState("idle");
      setTitleDraft("");
      setTitleError(null);
      return;
    }
    setTitleError(null);
    titleSubmittingRef.current = true;
    setTitleSubmitting(true);
    try {
      const result = await setCardLabel(card.id, { label: trimmed }, messages);
      if (!result.ok) {
        setTitleError(result.error);
        return;
      }
      onLabelUpdated(result.card);
      setTitleState("idle");
      setTitleDraft("");
      setTitleError(null);
    } finally {
      titleSubmittingRef.current = false;
      setTitleSubmitting(false);
    }
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTitleEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelTitleEdit();
    }
  }

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

  const selections = new Map<string, RoutingSelection>();
  selections.set("review", { mode: "review", fixedListId: null });
  const options: ChipOption[] = [
    { value: "review", label: messages.routingChipReview, ariaLabel: messages.routingModeReview },
  ];
  for (const list of routingLists) {
    selections.set(list.id, { mode: "fixed", fixedListId: list.id });
    options.push({ value: list.id, label: list.name, ariaLabel: `${messages.routingModeFixed}: ${list.name}` });
  }
  // Trigger chip already shows the active setting, so ChipOptionsPanel hides it from the row.
  const selectedValue = card.routing_mode === "fixed" ? (card.fixed_list_id ?? "") : "review";

  function onSelect(value: string) {
    const selection = selections.get(value);
    if (selection) void submit(selection);
  }

  return (
    <div className="flex flex-col" onKeyDown={onRootKeyDown}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div ref={titleContainerRef} className="min-w-0 -mx-1 -my-1 px-1 py-1">
            {titleState === "editing" ? (
              <GhostTextField
                ref={titleInputRef}
                value={titleDraft}
                maxLength={CARD_LABEL_MAX_LENGTH}
                disabled={titleSubmitting}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={onTitleKeyDown}
                onBlur={cancelTitleEdit}
                aria-label={messages.renameLabel}
                className="font-[550] text-[0.95rem]"
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                aria-label={messages.renameLabel}
                onClick={handleTitleClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleTitleClick();
                  }
                }}
                className="font-[550] text-foreground text-[0.95rem] truncate cursor-text"
              >
                {card.label}
              </span>
            )}
          </div>
          {titleError ? (
            <span role="alert" className="text-[0.8rem] text-owe">
              {titleError}
            </span>
          ) : null}
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
        <div className="flex items-center gap-4">
          {trailing}
        </div>
      </div>
      <ChipOptionsPanel
        open={open}
        id={panelId}
        labelledBy={chipId}
        options={options}
        selectedValue={selectedValue}
        disabled={pending}
        error={error}
        onSelect={onSelect}
        contentClassName={panelContentClassName}
      />
    </div>
  );
}
