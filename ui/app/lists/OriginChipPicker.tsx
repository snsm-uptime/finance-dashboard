"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import { chipClassName, type ChipTone } from "@/components/Chip";
import { SlideDown } from "@/components/SlideDown";
import { useFormSubmission } from "@/hooks";
import { ReceiptRow, OriginPayerAlias, type ReceiptRowProps } from "@/components/soft-ledger/ReceiptRow";

import { fetchCards, type CardItem } from "../cards/cardsClient";
import { updateExpenseOrigin, type ListsClientMessages } from "./listsClient";

export type OriginOption = { value: string; label: string; tone?: ChipTone };

export type OriginChipPickerMessages = ListsClientMessages & {
  expenseOriginNone: string;
  expenseOriginCash: string;
  expenseOriginLabel: string;
};

type OriginKind = "card" | "cash" | null;

type Props = Omit<ReceiptRowProps, "originChip" | "originChipTone" | "originAction" | "originPanel"> & {
  listId: string;
  entryId: string;
  originKind: OriginKind;
  originCardId: string | null;
  originLabel: string;
  originTone: ChipTone;
  messages: OriginChipPickerMessages;
};

const focusRing =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function chipButtonClass(tone: ChipTone): string {
  const hover =
    tone === "warning" ? "hover:bg-owe/10" : "hover:border-muted";
  return `${chipClassName[tone]} ${focusRing} ${hover}`;
}

export function originOptionsFrom(
  cards: Pick<CardItem, "id" | "label">[],
  current: { kind: OriginKind; cardId: string | null },
  cashLabel: string,
  noneLabel: string,
): OriginOption[] {
  const options: OriginOption[] = [];
  if (current.kind !== null) {
    options.push({ value: "", label: noneLabel, tone: "warning" });
  }
  if (current.kind !== "cash") {
    options.push({ value: "cash", label: cashLabel });
  }
  for (const card of cards) {
    if (current.kind === "card" && current.cardId === card.id) continue;
    options.push({ value: card.id, label: card.label });
  }
  return options;
}

function originFieldsFromValue(value: string): {
  origin_kind: "card" | "cash" | null;
  origin_card_id: string | null;
} {
  if (value === "") return { origin_kind: null, origin_card_id: null };
  if (value === "cash") return { origin_kind: "cash", origin_card_id: null };
  return { origin_kind: "card", origin_card_id: value };
}

export function OriginChipPicker({
  listId,
  entryId,
  originKind,
  originCardId,
  originLabel,
  originTone,
  messages,
  payerAlias,
  ...row
}: Props) {
  const router = useRouter();
  const reactId = useId();
  const chipId = `${reactId}-origin-chip`;
  const panelId = `${reactId}-origin-panel`;
  const chipRef = useRef<HTMLButtonElement>(null);
  const fetchGen = useRef(0);
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [cardsLoaded, setCardsLoaded] = useState(false);
  const [cardsSettled, setCardsSettled] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [kind, setKind] = useState<OriginKind>(originKind);
  const [cardId, setCardId] = useState<string | null>(originCardId);
  const [label, setLabel] = useState(originLabel);
  const [tone, setTone] = useState<ChipTone>(originTone);
  const [prevOrigin, setPrevOrigin] = useState({
    kind: originKind,
    cardId: originCardId,
    label: originLabel,
    tone: originTone,
  });

  if (
    prevOrigin.kind !== originKind ||
    prevOrigin.cardId !== originCardId ||
    prevOrigin.label !== originLabel ||
    prevOrigin.tone !== originTone
  ) {
    setPrevOrigin({ kind: originKind, cardId: originCardId, label: originLabel, tone: originTone });
    setKind(originKind);
    setCardId(originCardId);
    setLabel(originLabel);
    setTone(originTone);
  }

  const current = { kind, cardId };
  const options = originOptionsFrom(
    cards,
    current,
    messages.expenseOriginCash,
    messages.expenseOriginNone,
  );

  function applyChosenOrigin(value: string, knownCards: CardItem[]) {
    const fields = originFieldsFromValue(value);
    setKind(fields.origin_kind);
    setCardId(fields.origin_card_id);
    if (value === "") {
      setLabel(messages.expenseOriginNone);
      setTone("warning");
      return;
    }
    if (value === "cash") {
      setLabel(messages.expenseOriginCash);
      setTone("muted");
      return;
    }
    setLabel(knownCards.find((c) => c.id === value)?.label ?? value);
    setTone("muted");
  }

  const { pending, error, submit, clearError } = useFormSubmission(
    async (value: string) => {
      const result = await updateExpenseOrigin(
        listId,
        entryId,
        originFieldsFromValue(value),
        messages,
      );
      if (result.ok) {
        applyChosenOrigin(value, cards);
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error };
    },
    {
      onSuccess: () => {
        setOpen(false);
        chipRef.current?.focus();
        router.refresh();
      },
    },
  );

  function closePanel() {
    setOpen(false);
    clearError();
    chipRef.current?.focus();
  }

  async function loadCards(): Promise<CardItem[] | "error" | "stale"> {
    if (cardsLoaded) {
      setCardsSettled(true);
      return cards;
    }
    const gen = ++fetchGen.current;
    setCardsSettled(false);
    const result = await fetchCards({
      errorGeneric: messages.errorGeneric,
      errorUnauthorized: messages.errorUnauthorized,
      errorInvalidLabel: messages.errorGeneric,
      errorInvalidIban: messages.errorGeneric,
      errorDuplicateIban: messages.errorGeneric,
    });
    if (gen !== fetchGen.current) return "stale";
    setCardsSettled(true);
    if (!result.ok) {
      setCards([]);
      setCardsError(result.error);
      return "error";
    }
    setCards(result.cards);
    setCardsLoaded(true);
    setCardsError(null);
    return result.cards;
  }

  async function toggle() {
    if (open) {
      closePanel();
      return;
    }
    clearError();
    setOpen(true);
    await loadCards();
  }

  function onRootKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    closePanel();
  }

  const chipAria = payerAlias
    ? `${messages.expenseOriginLabel}: @${payerAlias}: ${label}`
    : `${messages.expenseOriginLabel}: ${label}`;

  const alias = payerAlias ? <OriginPayerAlias alias={payerAlias} /> : null;

  const originAction = (
    <button
      ref={chipRef}
      type="button"
      id={chipId}
      aria-label={chipAria}
      aria-expanded={open}
      aria-controls={panelId}
      title={chipAria}
      onClick={() => {
        void toggle();
      }}
      className={chipButtonClass(tone)}
    >
      {alias}
      {label}
      <span
        aria-hidden="true"
        className={`ml-1 inline-block w-[0.32rem] h-[0.32rem] border-r-[1.5px] border-b-[1.5px] border-current opacity-70 transition-transform duration-200 motion-reduce:transition-none ${
          open ? "rotate-[225deg] translate-y-px" : "rotate-45 -translate-y-px"
        }`}
      />
    </button>
  );

  const originPanel = (
    <SlideDown open={open} id={panelId} labelledBy={chipId}>
      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-[8px] p-2">
        {options.map((option) => (
          <button
            key={option.value || "none"}
            type="button"
            disabled={pending || !cardsSettled}
            aria-label={option.label}
            onClick={() => {
              void submit(option.value);
            }}
            className={`${chipClassName[option.tone ?? "muted"]} ${focusRing} ${
              option.tone === "warning" ? "hover:bg-owe/10" : "hover:border-muted"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {option.label}
          </button>
        ))}
        {error || cardsError ? (
          <p className="m-0 w-full text-[0.85rem] text-owe" role="alert" aria-live="polite">
            {error ?? cardsError}
          </p>
        ) : null}
      </div>
    </SlideDown>
  );

  return (
    <div onKeyDown={onRootKeyDown}>
      <ReceiptRow
        {...row}
        payerAlias={payerAlias}
        originAction={originAction}
        originPanel={originPanel}
      />
    </div>
  );
}
