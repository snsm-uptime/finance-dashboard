"use client";

import { FormEvent, useId, useState } from "react";

import { IconButton } from "@/components/IconButton";
import { useFormSubmission } from "@/hooks";
import { PlusIcon } from "@/app/icons";
import { registerCard, type CardItem, type CardsClientMessages } from "./cardsClient";

export type RegisterCardFormMessages = CardsClientMessages & {
  labelField: string;
  ibanField: string;
  submit: string;
  submitting: string;
};

type Props = {
  messages: RegisterCardFormMessages;
  onRegistered: (card: CardItem) => void;
};

const fieldInputClass =
  "min-w-0 flex-1 font-inherit text-[0.9rem] bg-transparent text-foreground placeholder:text-muted outline-none";

export function RegisterCardForm({ messages, onRegistered }: Props) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const ibanId = `${baseId}-iban`;
  const [label, setLabel] = useState("");
  const [iban, setIban] = useState("");

  const { pending, error, submit, clearError } = useFormSubmission(
    async (input: { label: string; iban: string }) => {
      const result = await registerCard(input.label, input.iban, messages);
      if (result.ok) {
        onRegistered(result.card);
        setLabel("");
        setIban("");
      }
      return result;
    },
  );

  const canSubmit = label.trim().length > 0 && iban.trim().length > 0 && !pending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await submit({ label, iban });
  }

  return (
    <form className="flex w-full flex-col" onSubmit={onSubmit}>
      <div className="flex items-center gap-2 rounded-[8px] border-2 border-border bg-background px-[0.65rem] py-[0.5rem]">
        <label htmlFor={labelId} className="sr-only">
          {messages.labelField}
        </label>
        <input
          id={labelId}
          className={`${fieldInputClass} basis-1/3`}
          type="text"
          name="label"
          value={label}
          placeholder={messages.labelField}
          maxLength={100}
          autoComplete="off"
          disabled={pending}
          onChange={(e) => {
            setLabel(e.target.value);
            clearError();
          }}
        />
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <label htmlFor={ibanId} className="sr-only">
          {messages.ibanField}
        </label>
        <input
          id={ibanId}
          className={`${fieldInputClass} basis-2/3`}
          type="text"
          name="iban"
          value={iban}
          placeholder={messages.ibanField}
          maxLength={64}
          autoComplete="off"
          disabled={pending}
          onChange={(e) => {
            setIban(e.target.value);
            clearError();
          }}
        />
        <IconButton
          type="submit"
          className="h-7 w-7 shrink-0 !p-0 !rounded-[4px]"
          disabled={!canSubmit}
          label={pending ? messages.submitting : messages.submit}
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
