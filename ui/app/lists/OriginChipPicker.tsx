"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ChipTone } from "@/components/Chip";
import { ChipOptionsPanel, ChipTrigger, useChipPicker, type ChipOption } from "@/components/ChipPicker";
import { useFormSubmission } from "@/hooks";
import { ReceiptRow, OriginPayerAlias, type ReceiptRowProps } from "@/components/soft-ledger/ReceiptRow";

import { fetchCards, type CardItem } from "../cards/cardsClient";
import { updateExpenseOrigin, type ListsClientMessages } from "./listsClient";

export type OriginOption = ChipOption;

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

/** Full candidate list — the active setting is filtered out by `ChipOptionsPanel`, not here. */
export function originOptionsFrom(
  cards: Pick<CardItem, "id" | "label">[],
  cashLabel: string,
  noneLabel: string,
): OriginOption[] {
  return [
    { value: "", label: noneLabel, tone: "warning" },
    { value: "cash", label: cashLabel },
    ...cards.map((card) => ({ value: card.id, label: card.label })),
  ];
}

/** The option value equivalent to the current origin — always hidden in the slide-down panel. */
export function originCurrentValue(current: { kind: OriginKind; cardId: string | null }): string {
  if (current.kind === "cash") return "cash";
  if (current.kind === "card") return current.cardId ?? "";
  return "";
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
  const fetchGen = useRef(0);
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
  const options = originOptionsFrom(cards, messages.expenseOriginCash, messages.expenseOriginNone);
  const selectedValue = originCurrentValue(current);

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
        close();
        router.refresh();
      },
    },
  );

  const { chipId, panelId, chipRef, open, toggle, close, onRootKeyDown } = useChipPicker({
    onOpen: () => {
      clearError();
      void loadCards();
    },
    onClose: clearError,
  });

  const chipAria = payerAlias
    ? `${messages.expenseOriginLabel}: @${payerAlias}: ${label}`
    : `${messages.expenseOriginLabel}: ${label}`;

  const alias = payerAlias ? (
    <OriginPayerAlias alias={payerAlias} seed={row.payerSeed} photo={row.payerPhoto} />
  ) : null;

  const originAction = (
    <ChipTrigger
      ref={chipRef}
      id={chipId}
      panelId={panelId}
      open={open}
      tone={tone}
      ariaLabel={chipAria}
      onClick={toggle}
    >
      {alias}
      {label}
    </ChipTrigger>
  );

  const originPanel = (
    <ChipOptionsPanel
      open={open}
      id={panelId}
      labelledBy={chipId}
      options={options}
      selectedValue={selectedValue}
      disabled={pending || !cardsSettled}
      error={error ?? cardsError}
      onSelect={(value) => {
        void submit(value);
      }}
    />
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
