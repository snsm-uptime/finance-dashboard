"use client";

import { FormEvent, useId, useState } from "react";

import { chipClassName } from "@/components/Chip";
import { IconButton } from "@/components/IconButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { useFormSubmission } from "@/hooks";
import { PlusIcon } from "@/app/icons";
import type { ListItem } from "@/app/lists/listsClient";

import { createBudget, type BudgetItem, type BudgetsClientMessages } from "./budgetsClient";

export type BudgetsCreateFormMessages = BudgetsClientMessages & {
  budgetsCreateTitle: string;
  budgetsNameLabel: string;
  budgetsCapLabel: string;
  budgetsCurrencyLabel: string;
  budgetsSourceListsLabel: string;
  budgetsCreateSubmit: string;
  budgetsCreating: string;
  budgetsPeriodStartLabel: string;
  budgetsPeriodEndLabel: string;
};

type Props = {
  lists: ListItem[];
  messages: BudgetsCreateFormMessages;
  onCreated: (budget: BudgetItem) => void;
};

const CURRENCY_OPTIONS = [
  { value: "CRC", label: "CRC" },
  { value: "USD", label: "USD" },
];

const fieldInputClass =
  "min-w-0 flex-1 font-inherit text-[0.9rem] bg-transparent text-foreground placeholder:text-muted outline-none";

// Same trigger look as CardRoutingControl's routing chip: accent tone = the
// active/selected setting, muted = unselected. Hover + selection are both
// animated (color/border transition plus a small press/lift scale).
const chipFocusRing =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const chipTransition =
  "transition-[color,background-color,border-color,transform] duration-150 ease-out motion-reduce:transition-none";
function sourceListChipClassName(selected: boolean): string {
  const hover = selected ? "hover:bg-accent/10" : "hover:border-muted";
  return `${chipClassName[selected ? "accent" : "muted"]} ${chipFocusRing} ${chipTransition} ${hover} hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100`;
}

export function BudgetsCreateForm({ lists, messages, onCreated }: Props) {
  const baseId = useId();
  const currencyId = `${baseId}-currency`;
  const currencyLabelId = `${baseId}-currency-label`;
  const nameId = `${baseId}-name`;
  const capId = `${baseId}-cap`;
  const [name, setName] = useState("");
  const [cap, setCap] = useState("");
  const [currency, setCurrency] = useState("CRC");
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const periodStartId = `${baseId}-period-start`;
  const periodEndId = `${baseId}-period-end`;

  const { pending, error, submit, clearError } = useFormSubmission(
    async (body: {
      name: string;
      cap: string;
      currency: string;
      source_list_ids: string[];
      period_start: string | null;
      period_end: string | null;
    }) => {
      const result = await createBudget(body, messages);
      if (result.ok) {
        setName("");
        setCap("");
        setCurrency("CRC");
        setSelectedListIds([]);
        setPeriodStart("");
        setPeriodEnd("");
        onCreated(result.budget);
      }
      return result;
    },
  );

  const canSubmit =
    name.trim().length > 0 && cap.trim().length > 0 && selectedListIds.length > 0 && !pending;

  function toggleListId(listId: string) {
    setSelectedListIds((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId],
    );
    clearError();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    // Unset stays open-ended — omit rather than send an empty string
    // (Story 7.5, AC #1/#6).
    await submit({
      name: name.trim(),
      cap: cap.trim(),
      currency,
      source_list_ids: selectedListIds,
      period_start: periodStart || null,
      period_end: periodEnd || null,
    });
  }

  return (
    <form className="flex w-full flex-col gap-[var(--space-2)]" onSubmit={onSubmit}>
      <div className="flex items-center gap-2 rounded-[8px] border-2 border-border bg-background px-[0.65rem] py-[0.5rem]">
        <span className="sr-only" id={currencyLabelId}>
          {messages.budgetsCurrencyLabel}
        </span>
        <div className="w-fit shrink-0">
          <SoftLedgerSelect
            id={currencyId}
            ghost
            value={currency}
            options={CURRENCY_OPTIONS}
            disabled={pending}
            aria-labelledby={currencyLabelId}
            onChange={(value) => {
              setCurrency(value);
              clearError();
            }}
          />
        </div>
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <label htmlFor={capId} className="sr-only">
          {messages.budgetsCapLabel}
        </label>
        <input
          id={capId}
          className={`${fieldInputClass} basis-[30%] flex-none`}
          inputMode="decimal"
          value={cap}
          placeholder={messages.budgetsCapLabel}
          required
          disabled={pending}
          onChange={(e) => {
            setCap(e.target.value);
            clearError();
          }}
        />
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <label htmlFor={nameId} className="sr-only">
          {messages.budgetsNameLabel}
        </label>
        <input
          id={nameId}
          className={fieldInputClass}
          type="text"
          value={name}
          placeholder={messages.budgetsNameLabel}
          required
          disabled={pending}
          onChange={(e) => {
            setName(e.target.value);
            clearError();
          }}
        />
        <IconButton
          type="submit"
          className="h-7 w-7 shrink-0 !p-0 !rounded-[4px]"
          disabled={!canSubmit}
          label={pending ? messages.budgetsCreating : messages.budgetsCreateSubmit}
          icon={<PlusIcon />}
        />
      </div>
      <div className="flex items-center gap-2 rounded-[8px] border-2 border-border bg-background px-[0.65rem] py-[0.5rem]">
        <label htmlFor={periodStartId} className="sr-only">
          {messages.budgetsPeriodStartLabel}
        </label>
        <input
          id={periodStartId}
          className={fieldInputClass}
          type="date"
          value={periodStart}
          aria-label={messages.budgetsPeriodStartLabel}
          disabled={pending}
          onChange={(e) => {
            setPeriodStart(e.target.value);
            clearError();
          }}
        />
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <label htmlFor={periodEndId} className="sr-only">
          {messages.budgetsPeriodEndLabel}
        </label>
        <input
          id={periodEndId}
          className={fieldInputClass}
          type="date"
          value={periodEnd}
          aria-label={messages.budgetsPeriodEndLabel}
          disabled={pending}
          onChange={(e) => {
            setPeriodEnd(e.target.value);
            clearError();
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={messages.budgetsSourceListsLabel}>
        {lists.map((list) => {
          const selected = selectedListIds.includes(list.id);
          return (
            <button
              key={list.id}
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => toggleListId(list.id)}
              className={sourceListChipClassName(selected)}
            >
              {list.name}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {error ? (
          <p className="m-0 text-[0.85rem] text-owe" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
