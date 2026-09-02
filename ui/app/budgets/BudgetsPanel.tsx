"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Chip } from "@/components/Chip";
import { SectionLabel } from "@/components/soft-ledger/SectionLabel";
import { usePreferences } from "@/components/PreferencesProvider";
import { StackedListPanel } from "@/components/StackedListPanel";
import { formatMoneyAmount } from "@/lib/currency";
import { listsMessages } from "@/lib/i18n/lists";
import { fetchLists } from "@/app/lists/listsClient";
import {
  getMembershipListsSnapshot,
  replaceMembershipLists,
  useMembershipLists,
} from "@/app/lists/membershipListsStore";
import { BudgetsCreateForm } from "./BudgetsCreateForm";
import {
  budgetStateLabel,
  budgetUsageRatio,
  fetchBudgets,
  type BudgetItem,
  type BudgetsClientMessages,
} from "./budgetsClient";

/** Standalone /budgets surface (Story 7.1) — no listId, spans the caller's own budgets. */
export function BudgetsPanel() {
  const { locale } = usePreferences();
  const t = listsMessages[locale];
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const lists = useMembershipLists() ?? [];
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const messages: BudgetsClientMessages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
      errorInvalidBudgetName: t.errorInvalidBudgetName,
      errorInvalidBudgetCap: t.errorInvalidBudgetCap,
      errorInvalidBudgetCurrency: t.errorInvalidBudgetCurrency,
      errorInvalidBudgetSourceLists: t.errorInvalidBudgetSourceLists,
      errorForbidden: t.errorForbidden,
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchBudgets(messages);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
      } else {
        setBudgets(result.budgets);
      }
      // Seed the shared membership store once — BudgetsCreateForm's source-list
      // picker and this panel's per-tile chips both read from it.
      if (getMembershipListsSnapshot() === null) {
        const listsResult = await fetchLists({
          errorGeneric: t.errorGeneric,
          errorInvalidName: t.errorGeneric,
          errorForbidden: t.errorForbidden,
          errorUnauthorized: t.errorUnauthorized,
        });
        if (listsResult.ok) replaceMembershipLists(listsResult.lists);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onCreated(budget: BudgetItem) {
    setBudgets((prev) => [budget, ...prev]);
  }

  return (
    <div className="flex flex-col gap-(--space-3)">
      <StackedListPanel
        ariaLabel={t.budgetsTitle}
        wrapperClassName="relative flex flex-col gap-[var(--space-3)]"
        input={
          <>
            <SectionLabel>{t.budgetsCreateTitle}</SectionLabel>
            <BudgetsCreateForm
              lists={lists}
              messages={{
                ...messages,
                budgetsCreateTitle: t.budgetsCreateTitle,
                budgetsNameLabel: t.budgetsNameLabel,
                budgetsCapLabel: t.budgetsCapLabel,
                budgetsCurrencyLabel: t.budgetsCurrencyLabel,
                budgetsSourceListsLabel: t.budgetsSourceListsLabel,
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
              href={`/budgets/${budget.id}`}
              className="flex h-full flex-col justify-between no-underline text-inherit"
            >
              <div className="flex items-center justify-between gap-[var(--space-2)]">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <p className="m-0 truncate text-foreground">{budget.name}</p>
                  {budget.source_list_ids.map((listId) => {
                    const list = lists.find((l) => l.id === listId);
                    if (!list) return null;
                    return (
                      <Chip key={listId} tone="muted">
                        {list.name}
                      </Chip>
                    );
                  })}
                </div>
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
  );
}
