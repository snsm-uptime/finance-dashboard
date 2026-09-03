"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { useFormSubmission } from "@/hooks";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";

import { createRule, deleteRule, type BudgetDetailClientMessages, type BudgetRule } from "./budgetDetailClient";

export type BudgetRulesPanelMessages = BudgetDetailClientMessages & {
  budgetsRulesTitle: string;
  budgetsRulesEmpty: string;
  budgetsRuleMatchLabel: string;
  budgetsRuleAddSubmit: string;
  budgetsRuleAdding: string;
  budgetsRuleDelete: string;
};

type Props = {
  budgetId: string;
  rules: BudgetRule[];
  messages: BudgetRulesPanelMessages;
};

export function BudgetRulesPanel({ budgetId, rules, messages }: Props) {
  const router = useRouter();
  const baseId = useId();
  const [matchText, setMatchText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { pending, error, submit, clearError } = useFormSubmission(
    async (text: string) => createRule(budgetId, text, messages),
    {
      onSuccess: () => {
        setMatchText("");
        router.refresh();
      },
    },
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = matchText.trim();
    if (!trimmed || pending) return;
    await submit(trimmed);
  }

  async function onDelete(ruleId: string) {
    setDeletingId(ruleId);
    setDeleteError(null);
    const result = await deleteRule(budgetId, ruleId, messages);
    setDeletingId(null);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-[var(--space-3)] mx-strip-inset">
      <h2 className="m-0 text-foreground" style={{ fontFamily: "var(--type-body-face)" }}>
        {messages.budgetsRulesTitle}
      </h2>

      {rules.length === 0 ? (
        <p className="m-0 text-muted">{messages.budgetsRulesEmpty}</p>
      ) : (
        <ul className="m-0 list-none p-0 flex flex-col gap-[var(--space-2)]">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] bg-surface border border-border rounded-sm"
            >
              <span className="text-foreground">{rule.match_text}</span>
              <button
                type="button"
                className="cursor-pointer border-none bg-transparent text-owe disabled:opacity-55"
                disabled={deletingId === rule.id}
                onClick={() => onDelete(rule.id)}
              >
                {messages.budgetsRuleDelete}
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteError ? (
        <p className="m-0 text-owe" role="alert">
          {deleteError}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-[var(--space-2)] p-[var(--space-3)] bg-surface border border-border rounded-md"
        onSubmit={onSubmit}
      >
        <label className="text-muted" htmlFor={`${baseId}-match-text`}>
          {messages.budgetsRuleMatchLabel}
        </label>
        <input
          id={`${baseId}-match-text`}
          className="w-full box-border px-[0.7rem] py-[0.55rem] border border-border rounded-sm bg-surface text-foreground"
          maxLength={100}
          value={matchText}
          disabled={pending}
          onChange={(e) => {
            setMatchText(e.target.value);
            clearError();
          }}
        />
        {error ? (
          <p className="m-0 text-owe" role="alert">
            {error}
          </p>
        ) : null}
        <PrimaryButton
          type="submit"
          className="self-start"
          disabled={!matchText.trim() || pending}
          loading={pending}
        >
          {pending ? messages.budgetsRuleAdding : messages.budgetsRuleAddSubmit}
        </PrimaryButton>
      </form>
    </section>
  );
}
