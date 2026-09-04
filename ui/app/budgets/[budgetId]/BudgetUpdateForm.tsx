"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { chipClassName } from "@/components/Chip";
import { FormIconSubmit } from "@/components/FormIconSubmit";
import { IconButton } from "@/components/IconButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { PencilIcon } from "@/app/icons/PencilIcon";
import { Sheet } from "@/app/lists/Sheet";
import {
  periodChangeConfirmBodyFrom,
  updateBudget,
  type BudgetItem,
  type BudgetsClientMessages,
  type PeriodChangeLine,
} from "../budgetsClient";

export type BudgetUpdateFormMessages = BudgetsClientMessages & {
  budgetsEditAria: string;
  budgetsEditTitle: string;
  budgetsNameLabel: string;
  budgetsCapLabel: string;
  budgetsCurrencyLabel: string;
  budgetsSourceListsLabel: string;
  budgetsPeriodStartLabel: string;
  budgetsPeriodEndLabel: string;
  budgetsEditSubmit: string;
  budgetsSaving: string;
  budgetsPeriodChangeConfirmTitle: string;
  budgetsPeriodChangeConfirmBody: string;
  budgetsPeriodChangeConfirmBodyCount: string;
  budgetsPeriodChangeConfirmAction: string;
  budgetsPeriodChangeCancel: string;
  cancelLabel: string;
};

type Props = {
  budget: BudgetItem;
  lists: { id: string; name: string }[];
  messages: BudgetUpdateFormMessages;
};

const CURRENCY_OPTIONS = [
  { value: "CRC", label: "CRC" },
  { value: "USD", label: "USD" },
];

const fieldInputClass =
  "min-w-0 flex-1 font-inherit text-[0.9rem] bg-transparent text-foreground placeholder:text-muted outline-none";

const chipFocusRing =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const chipTransition =
  "transition-[color,background-color,border-color,transform] duration-150 ease-out motion-reduce:transition-none";
function sourceListChipClassName(selected: boolean): string {
  const hover = selected ? "hover:bg-accent/10" : "hover:border-muted";
  return `${chipClassName[selected ? "accent" : "muted"]} ${chipFocusRing} ${chipTransition} ${hover} hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100`;
}

/** Detail-page edit affordance + confirmation Sheet (Story 7.5, AC #1/#3/#4/#5).
 *
 * The update form does not exist before this story — built from scratch,
 * reusing BudgetsCreateForm's field set/validation approach per Dev Notes.
 * Submits once without `confirm_period_change`; a narrowing period that
 * would exclude attributed lines comes back as a 422 carrying the exact
 * excluded-lines diff (the same diff Task 4's preview service computes) —
 * that response drives the confirmation Sheet directly, no separate preview
 * round-trip needed before the first submit attempt.
 */
export function BudgetUpdateForm({ budget, lists, messages }: Props) {
  const router = useRouter();
  const baseId = useId();
  const formId = `${baseId}-form`;
  const currencyId = `${baseId}-currency`;
  const currencyLabelId = `${baseId}-currency-label`;
  const nameId = `${baseId}-name`;
  const capId = `${baseId}-cap`;
  const periodStartId = `${baseId}-period-start`;
  const periodEndId = `${baseId}-period-end`;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(budget.name);
  const [cap, setCap] = useState(budget.cap);
  const [currency, setCurrency] = useState(budget.currency);
  const [selectedListIds, setSelectedListIds] = useState<string[]>(budget.source_list_ids);
  const [periodStart, setPeriodStart] = useState(budget.period_start ?? "");
  const [periodEnd, setPeriodEnd] = useState(budget.period_end ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [excludedLines, setExcludedLines] = useState<PeriodChangeLine[]>([]);
  const [confirming, setConfirming] = useState(false);

  function openEditor() {
    setName(budget.name);
    setCap(budget.cap);
    setCurrency(budget.currency);
    setSelectedListIds(budget.source_list_ids);
    setPeriodStart(budget.period_start ?? "");
    setPeriodEnd(budget.period_end ?? "");
    setError(null);
    setConfirmOpen(false);
    setExcludedLines([]);
    setOpen(true);
  }

  function toggleListId(listId: string) {
    setSelectedListIds((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId],
    );
    setError(null);
  }

  function buildPayload(confirmPeriodChange: boolean) {
    return {
      name: name.trim(),
      cap: cap.trim(),
      currency,
      source_list_ids: selectedListIds,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      confirm_period_change: confirmPeriodChange,
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await updateBudget(budget.id, buildPayload(false), messages);
    setPending(false);
    if (result.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    if ("requiresConfirmation" in result && result.requiresConfirmation) {
      setExcludedLines(result.excludedLines);
      setConfirmOpen(true);
      return;
    }
    if ("error" in result) setError(result.error);
  }

  async function onConfirmPeriodChange() {
    setConfirming(true);
    const result = await updateBudget(budget.id, buildPayload(true), messages);
    setConfirming(false);
    if (result.ok) {
      setConfirmOpen(false);
      setOpen(false);
      router.refresh();
      return;
    }
    if ("requiresConfirmation" in result && result.requiresConfirmation) {
      setExcludedLines(result.excludedLines);
      setError(messages.errorGeneric);
      return;
    }
    if ("error" in result) setError(result.error);
    setConfirmOpen(false);
  }

  const canSubmit =
    name.trim().length > 0 && cap.trim().length > 0 && selectedListIds.length > 0 && !pending;

  return (
    <>
      <IconButton
        icon={<PencilIcon />}
        label={messages.budgetsEditAria}
        onClick={openEditor}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={messages.cancelLabel}
        title={messages.budgetsEditTitle}
        cornerAction={
          <FormIconSubmit
            type="submit"
            form={formId}
            tabIndex={0}
            variant="save"
            label={pending ? messages.budgetsSaving : messages.budgetsEditSubmit}
            disabled={!canSubmit}
          />
        }
        body={
          <form
            id={formId}
            className="flex w-full flex-col gap-[var(--space-2)]"
            onSubmit={onSubmit}
          >
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
                    setError(null);
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
                  setError(null);
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
                  setError(null);
                }}
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
                  setError(null);
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
                  setError(null);
                }}
              />
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={messages.budgetsSourceListsLabel}
            >
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
        }
      />
      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        closeLabel={messages.budgetsPeriodChangeCancel}
        title={messages.budgetsPeriodChangeConfirmTitle}
        cornerAction={
          <FormIconSubmit
            type="button"
            variant="save"
            label={
              confirming
                ? messages.budgetsSaving
                : messages.budgetsPeriodChangeConfirmAction
            }
            disabled={confirming}
            onClick={onConfirmPeriodChange}
          />
        }
        body={
          <div className="flex flex-col gap-[var(--space-3)]">
            <p className="m-0 text-foreground">
              {periodChangeConfirmBodyFrom(excludedLines, messages)}
            </p>
            <ul className="m-0 list-none p-0 flex flex-col gap-[var(--space-2)]">
              {excludedLines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] bg-surface border border-border rounded-sm"
                >
                  <span className="flex flex-col">
                    <span className="text-foreground">{line.description}</span>
                    <span className="tabular-nums text-muted text-[0.8rem]">{line.posted_date}</span>
                  </span>
                  <span className="tabular-nums text-muted">{line.amount_crc}</span>
                </li>
              ))}
            </ul>
          </div>
        }
      />
    </>
  );
}
