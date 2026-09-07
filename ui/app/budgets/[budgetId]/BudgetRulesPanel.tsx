"use client";

import { KeyboardEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { useFormSubmission } from "@/hooks";
import { IconButton } from "@/components/IconButton";
import { StackedListPanel } from "@/components/StackedListPanel/StackedListPanel";
import { PlusIcon, TrashIcon } from "@/app/icons";

import { createRule, deleteRule, type BudgetDetailClientMessages, type BudgetRule } from "./budgetDetailClient";
import { Disclosure } from "@/components/Disclosure";

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

  async function onAddRule() {
    const trimmed = matchText.trim();
    if (!trimmed || pending) return;
    await submit(trimmed);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void onAddRule();
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

  const addForm = (
    // A <form> here would nest inside BudgetUpdateForm's outer <form> — invalid
    // HTML that makes browsers break the inner form, silently rebinding this
    // submit button to the outer (budget update) form instead. Plain div +
    // Enter-key handling on the input keeps this working while nested.
    <div className="flex w-full flex-col gap-1">
      <div className="flex flex-1 items-center gap-2 rounded-[8px] border-2 border-border bg-background px-[0.65rem] py-[0.5rem]">
        <label className="sr-only" htmlFor={`${baseId}-match-text`}>
          {messages.budgetsRuleMatchLabel}
        </label>
        <input
          id={`${baseId}-match-text`}
          className="min-w-0 flex-1 font-inherit text-[0.9rem] bg-transparent text-foreground placeholder:text-muted outline-none"
          type="text"
          maxLength={100}
          value={matchText}
          placeholder={messages.budgetsRuleMatchLabel}
          autoComplete="off"
          disabled={pending}
          onKeyDown={onInputKeyDown}
          onChange={(e) => {
            setMatchText(e.target.value);
            clearError();
          }}
        />
        <IconButton
          className="h-7 w-7 shrink-0 !p-0 !rounded-[4px]"
          type="button"
          onClick={onAddRule}
          disabled={!matchText.trim() || pending}
          label={pending ? messages.budgetsRuleAdding : messages.budgetsRuleAddSubmit}
          icon={<PlusIcon />}
        />
      </div>
      {error ? (
        <p className="m-0 text-owe" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <Disclosure
      title={`${messages.budgetsRulesTitle} (${rules.length})`}
    >
      <StackedListPanel
        ariaLabel={messages.budgetsRulesTitle}
        input={addForm}
        items={rules}
        itemKey={(rule) => rule.id}
        emptyLabel={messages.budgetsRulesEmpty}
        error={deleteError}
        renderItem={(rule) => (
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <span className="text-foreground">{rule.match_text}</span>
            <IconButton
              className="text-owe"
              icon={<TrashIcon className="w-4 h-4" />}
              label={messages.budgetsRuleDelete}
              disabled={deletingId === rule.id}
              onClick={() => onDelete(rule.id)}
            />
          </div>
        )}
      />
    </ Disclosure>
  );
}
