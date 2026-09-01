"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { useFormSubmission } from "@/hooks";

import { createBudget, type BudgetsClientMessages } from "./budgetsClient";

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
};

const CURRENCY_OPTIONS = [
  { value: "CRC", label: "CRC" },
  { value: "USD", label: "USD" },
];

export function BudgetsCreateForm({ listId, messages }: Props) {
  const router = useRouter();
  const baseId = useId();
  const [name, setName] = useState("");
  const [cap, setCap] = useState("");
  const [currency, setCurrency] = useState("CRC");

  const { pending, error, submit, clearError } = useFormSubmission(
    async (body: { name: string; cap: string; currency: string }) =>
      createBudget(listId, body, messages),
    {
      onSuccess: () => {
        setName("");
        setCap("");
        setCurrency("CRC");
        router.refresh();
      },
    },
  );

  const canSubmit = name.trim().length > 0 && cap.trim().length > 0 && !pending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await submit({ name: name.trim(), cap: cap.trim(), currency });
  }

  return (
    <section className="flex flex-col gap-[var(--space-3)] mx-strip-inset">
      <h2 className="m-0 text-foreground" style={{ fontFamily: "var(--type-body-face)" }}>
        {messages.budgetsCreateTitle}
      </h2>
      <form
        className="flex flex-col gap-[var(--space-3)] p-[var(--space-4)] bg-surface border border-border rounded-md"
        onSubmit={onSubmit}
      >
        <div className="flex flex-col gap-1">
          <label className="text-muted" htmlFor={`${baseId}-name`}>
            {messages.budgetsNameLabel}
          </label>
          <input
            id={`${baseId}-name`}
            className="w-full box-border px-[0.7rem] py-[0.55rem] border border-border rounded-sm bg-surface text-foreground"
            required
            value={name}
            disabled={pending}
            onChange={(e) => {
              setName(e.target.value);
              clearError();
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-muted" htmlFor={`${baseId}-cap`}>
            {messages.budgetsCapLabel}
          </label>
          <input
            id={`${baseId}-cap`}
            className="w-full box-border px-[0.7rem] py-[0.55rem] border border-border rounded-sm bg-surface text-foreground"
            inputMode="decimal"
            required
            value={cap}
            disabled={pending}
            onChange={(e) => {
              setCap(e.target.value);
              clearError();
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted" id={`${baseId}-currency-label`}>
            {messages.budgetsCurrencyLabel}
          </span>
          <SoftLedgerSelect
            id={`${baseId}-currency`}
            value={currency}
            options={CURRENCY_OPTIONS}
            disabled={pending}
            aria-labelledby={`${baseId}-currency-label`}
            onChange={(value) => {
              setCurrency(value);
              clearError();
            }}
          />
        </div>

        {error ? (
          <p className="m-0 text-owe" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="self-start px-[var(--space-4)] py-[var(--space-2)] rounded-sm bg-accent text-background font-semibold disabled:opacity-55 disabled:cursor-not-allowed"
          disabled={!canSubmit}
        >
          {pending ? messages.budgetsCreating : messages.budgetsCreateSubmit}
        </button>
      </form>
    </section>
  );
}
