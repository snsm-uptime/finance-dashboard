"use client";

import { FormEvent, useId, useState } from "react";

import { IconButton } from "@/components/IconButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { useFormSubmission } from "@/hooks";
import { PlusIcon } from "@/app/icons";

import { createBudget, type BudgetItem, type BudgetsClientMessages } from "./budgetsClient";

export type BudgetsCreateFormMessages = BudgetsClientMessages & {
  budgetsCreateTitle: string;
  budgetsNameLabel: string;
  budgetsCapLabel: string;
  budgetsCurrencyLabel: string;
  budgetsCreateSubmit: string;
  budgetsCreating: string;
};

type Props = {
  listId: string;
  messages: BudgetsCreateFormMessages;
  onCreated: (budget: BudgetItem) => void;
};

const CURRENCY_OPTIONS = [
  { value: "CRC", label: "CRC" },
  { value: "USD", label: "USD" },
];

const fieldInputClass =
  "min-w-0 flex-1 font-inherit text-[0.9rem] bg-transparent text-foreground placeholder:text-muted outline-none";

export function BudgetsCreateForm({ listId, messages, onCreated }: Props) {
  const baseId = useId();
  const currencyId = `${baseId}-currency`;
  const currencyLabelId = `${baseId}-currency-label`;
  const nameId = `${baseId}-name`;
  const capId = `${baseId}-cap`;
  const [name, setName] = useState("");
  const [cap, setCap] = useState("");
  const [currency, setCurrency] = useState("CRC");

  const { pending, error, submit, clearError } = useFormSubmission(
    async (body: { name: string; cap: string; currency: string }) => {
      const result = await createBudget(listId, body, messages);
      if (result.ok) {
        setName("");
        setCap("");
        setCurrency("CRC");
        onCreated(result.budget);
      }
      return result;
    },
  );

  const canSubmit = name.trim().length > 0 && cap.trim().length > 0 && !pending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await submit({ name: name.trim(), cap: cap.trim(), currency });
  }

  return (
    <form className="flex w-full flex-col" onSubmit={onSubmit}>
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
      <div aria-live="polite">
        {error ? (
          <p className="m-0 mt-1 text-[0.85rem] text-owe" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
