"use client";

import { FormEvent, useId, useState } from "react";

import { useFormSubmission } from "@/hooks";
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

const inputClass =
  "font-inherit text-[0.9rem] py-[0.55rem] px-[0.75rem] rounded-[8px] border border-border bg-surface text-foreground w-full";
const labelClass = "flex flex-col gap-[0.35rem] text-[0.85rem] font-[550] text-muted";
const submitClass =
  "font-inherit text-[0.9rem] font-semibold py-[0.55rem] px-[1rem] rounded-[8px] border border-accent bg-accent text-on-accent cursor-pointer self-start disabled:cursor-not-allowed disabled:opacity-60";

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
    <form className="flex flex-col gap-3 max-w-[24rem]" onSubmit={onSubmit}>
      <label className={labelClass} htmlFor={labelId}>
        {messages.labelField}
        <input
          id={labelId}
          className={inputClass}
          type="text"
          name="label"
          value={label}
          maxLength={100}
          autoComplete="off"
          disabled={pending}
          onChange={(e) => {
            setLabel(e.target.value);
            clearError();
          }}
        />
      </label>
      <label className={labelClass} htmlFor={ibanId}>
        {messages.ibanField}
        <input
          id={ibanId}
          className={inputClass}
          type="text"
          name="iban"
          value={iban}
          maxLength={64}
          autoComplete="off"
          disabled={pending}
          onChange={(e) => {
            setIban(e.target.value);
            clearError();
          }}
        />
      </label>
      <button type="submit" className={submitClass} disabled={!canSubmit}>
        {pending ? messages.submitting : messages.submit}
      </button>
      <div aria-live="polite">
        {error ? (
          <p className="text-owe text-[0.9rem] m-0" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
