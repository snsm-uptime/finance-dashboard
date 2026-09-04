"use client";

import { FormEvent, useId, useState } from "react";

import { DateRangeField } from "@/components/DateRangeField";
import { MinimalInput } from "@/components/MinimalInput";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { useFormSubmission } from "@/hooks";
import { CalendarIcon, PlusIcon, SpinnerIcon } from "@/app/icons";
import type { ListItem } from "@/app/lists/listsClient";

import { SourceListChipPicker } from "./SourceListChipPicker";
import { budgetDaysLeft, createBudget, type BudgetItem, type BudgetsClientMessages } from "./budgetsClient";

export type GhostBudgetCardMessages = BudgetsClientMessages & {
  budgetsNameLabel: string;
  budgetsCapLabel: string;
  budgetsCurrencyLabel: string;
  budgetsSourceListsLabel: string;
  budgetsAddListTrigger: string;
  budgetsCreateSubmit: string;
  budgetsCreating: string;
  budgetsPeriodStartLabel: string;
  budgetsPeriodEndLabel: string;
  budgetsPeriodTriggerLabel: string;
  budgetsDateFrom: string;
  budgetsDateTo: string;
  budgetsDateClear: string;
  budgetsDaysLeft: string;
  budgetsDaysOverdue: string;
};

type Props = {
  lists: ListItem[];
  messages: GhostBudgetCardMessages;
  locale: "en" | "es";
  onCreated: (budget: BudgetItem) => void;
  cardRef?: (el: HTMLElement | null) => void;
};

const CURRENCY_OPTIONS = [
  { value: "CRC", label: "CRC" },
  { value: "USD", label: "USD" },
];

const calendarSlotClassName =
  "flex h-[2.1rem] w-[2.1rem] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-border text-muted outline-none";

const submitBadgeBaseClassName =
  "absolute -top-2 -right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-surface shadow-sm outline-none transition-colors duration-150 disabled:cursor-not-allowed";

/**
 * Budget-creation entry point (Story 7.5 amendment — see
 * `_bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-04-budget-form/`):
 * a dashed skeleton budget card mirroring the real card's shell/slots
 * instead of a standalone input row. Renders as the first item of the
 * `/budgets` masonry list (see `BudgetsPanel`).
 */
export function GhostBudgetCard({ lists, messages, locale, onCreated, cardRef }: Props) {
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

  const daysLeft = budgetDaysLeft(periodEnd || null);
  const overdue = daysLeft !== null && daysLeft <= 0;

  return (
    <form
      ref={(el) => cardRef?.(el)}
      onSubmit={onSubmit}
      aria-label={messages.budgetsCreateSubmit}
      className="relative flex flex-col gap-[var(--space-3)] overflow-visible rounded-[10px] border border-dashed border-border bg-surface pt-[var(--space-4)] px-[var(--space-3)] pb-[var(--space-3)]"
    >
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label={pending ? messages.budgetsCreating : messages.budgetsCreateSubmit}
        className={`${submitBadgeBaseClassName} ${
          canSubmit
            ? "border-accent text-accent hover:bg-accent/10"
            : "border-border text-muted opacity-60"
        }`}
      >
        {pending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
      </button>

      <div className="flex items-center justify-between gap-[var(--space-3)]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={nameId} className="sr-only">
            {messages.budgetsNameLabel}
          </label>
          <MinimalInput
            id={nameId}
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
          <div className="flex flex-wrap items-center gap-1">
            <SourceListChipPicker
              options={lists.map((list) => ({ id: list.id, name: list.name }))}
              selectedIds={selectedListIds}
              onToggle={toggleListId}
              ariaLabel={messages.budgetsSourceListsLabel}
              addLabel={messages.budgetsAddListTrigger}
              disabled={pending}
            />
          </div>
        </div>

        <DateRangeField
          start={periodStart || null}
          end={periodEnd || null}
          onChange={(newStart, newEnd) => {
            setPeriodStart(newStart ?? "");
            setPeriodEnd(newEnd ?? "");
            clearError();
          }}
          fromLabel={messages.budgetsPeriodStartLabel}
          toLabel={messages.budgetsPeriodEndLabel}
          clearLabel={messages.budgetsDateClear}
          locale={locale}
          disabled={pending}
          renderTrigger={({ open, disabled: triggerDisabled, popoverOpen }) =>
            daysLeft !== null ? (
              <button
                type="button"
                disabled={triggerDisabled}
                onClick={open}
                aria-expanded={popoverOpen}
                aria-label={messages.budgetsPeriodTriggerLabel}
                className="flex shrink-0 flex-col items-center outline-none disabled:cursor-not-allowed"
              >
                <span
                  className={`font-serif text-[2.3rem] leading-[0.95] tracking-[-0.02em] ${overdue ? "text-owe" : "text-foreground"}`}
                >
                  {daysLeft}
                </span>
                <span className="whitespace-nowrap text-[0.56rem] font-[550] uppercase tracking-[0.04em] text-muted">
                  {overdue ? messages.budgetsDaysOverdue : messages.budgetsDaysLeft}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={triggerDisabled}
                onClick={open}
                aria-expanded={popoverOpen}
                aria-label={messages.budgetsPeriodTriggerLabel}
                className={calendarSlotClassName}
              >
                <CalendarIcon className="h-[1.05rem] w-[1.05rem]" />
              </button>
            )
          }
        />
      </div>

      <div className="flex items-center justify-between gap-2 pb-1">
        <span className="sr-only" id={currencyLabelId}>
          {messages.budgetsCurrencyLabel}
        </span>
        <div aria-live="polite" className="min-w-0 flex-1">
          {error ? (
            <p className="m-0 text-[0.72rem] text-owe" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
          <label htmlFor={capId} className="sr-only">
            {messages.budgetsCapLabel}
          </label>
          <MinimalInput
            id={capId}
            className="w-[5.5rem] text-right text-[0.72rem] font-[550] tabular-nums"
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
        </div>
      </div>
    </form>
  );
}
