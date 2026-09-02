"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { SectionLabel } from "@/components/soft-ledger/SectionLabel";
import { usePreferences } from "@/components/PreferencesProvider";
import { StackedListPanel } from "@/components/StackedListPanel";
import { formatMoneyAmount } from "@/lib/currency";
import { listsMessages } from "@/lib/i18n/lists";
import { BudgetsCreateForm } from "./BudgetsCreateForm";
import {
  budgetStateLabel,
  budgetUsageRatio,
  fetchBudgets,
  type BudgetItem,
  type BudgetsClientMessages,
} from "./budgetsClient";
import { cardsCopy, cardsMessages } from "@/lib/i18n/cards";

type Props = {
  listId: string;
};

/** Embeds into the list detail page — no standalone /budgets route. */
export function BudgetsPanel({ listId }: Props) {
  const { locale } = usePreferences();
  const t = listsMessages[locale];
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const messages: BudgetsClientMessages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
      errorInvalidBudgetName: t.errorInvalidBudgetName,
      errorInvalidBudgetCap: t.errorInvalidBudgetCap,
      errorInvalidBudgetCurrency: t.errorInvalidBudgetCurrency,
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchBudgets(listId, messages);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
      } else {
        setBudgets(result.budgets);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Budget data does not depend on locale; fetch once per list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  function onCreated(budget: BudgetItem) {
    setBudgets((prev) => [budget, ...prev]);
  }

  return (
    <>
      <div className="flex flex-col gap-(--space-3)">
        <StackedListPanel
          ariaLabel={t.budgetsTitle}
          wrapperClassName="relative flex flex-col gap-[var(--space-3)] mx-strip-inset"
          input={
            <>
              <SectionLabel>{t.budgetsTitle}</SectionLabel>
              <BudgetsCreateForm
                listId={listId}
                messages={{
                  ...messages,
                  budgetsCreateTitle: t.budgetsCreateTitle,
                  budgetsNameLabel: t.budgetsNameLabel,
                  budgetsCapLabel: t.budgetsCapLabel,
                  budgetsCurrencyLabel: t.budgetsCurrencyLabel,
                  budgetsCreateSubmit: t.budgetsCreateSubmit,
                  budgetsCreating: t.budgetsCreating,
                }}
                onCreated={onCreated}
              />
            </>
          }
          items={budgets}
          itemKey={(budget) => budget.id}
          loading={loading}
          loadingLabel={t.budgetsLoading}
          error={loadError}
          emptyLabel={t.budgetsEmpty}
          listClassName={`list-none m-0 p-0 grid gap-[var(--space-3)] ${
            budgets.length === 1
              ? "grid-cols-1"
              : budgets.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3"
          }`}
          itemClassName="py-[0.6rem] px-[0.85rem] rounded-[8px] border border-border bg-surface"
          renderItem={(budget) => {
            const ratio = budgetUsageRatio(budget);
            const usageDotClass =
              ratio === null
                ? "bg-muted"
                : ratio < 70
                  ? "bg-owed"
                  : ratio <= 90
                    ? "bg-warn"
                    : "bg-owe";
            return (
              <Link
                href={`/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budget.id)}`}
                className="flex h-full flex-col justify-between no-underline"
              >
                <div className="flex items-center justify-between gap-[var(--space-2)]">
                  <p className="m-0 min-w-0 flex-1 truncate text-foreground">{budget.name}</p>
                  <span
                    className={`h-[10px] w-[10px] shrink-0 rounded-full ${usageDotClass}`}
                    role="img"
                    aria-label={budgetStateLabel(budget.state, t)}
                  />
                </div>
                <p className="m-0 tabular-nums text-foreground">
                  {formatMoneyAmount(budget.spent, budget.currency)} /{" "}
                  {formatMoneyAmount(budget.cap, budget.currency)}
                </p>
              </Link>
            );
          }}
        />
      </div>
    </>
  );
}
