"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Chip } from "@/components/Chip";
import { useChromeHeader } from "@/components/ChromeBack";
import { ChromeAvatarLink } from "@/components/ChromeAvatarLink";
import { SectionLabel } from "@/components/soft-ledger/SectionLabel";
import { usePreferences } from "@/components/PreferencesProvider";
import { StackedListPanel } from "@/components/StackedListPanel";
import { TopProgressBar } from "@/components/TopProgressBar";
import { formatMoneyAmount } from "@/lib/currency";
import { listsMessages } from "@/lib/i18n/lists";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";
import { fetchLists } from "@/app/lists/listsClient";
import {
  getMembershipListsSnapshot,
  replaceMembershipLists,
  useMembershipLists,
} from "@/app/lists/membershipListsStore";
import { BudgetsCreateForm } from "./BudgetsCreateForm";
import {
  budgetSeverityColorClass,
  budgetStateLabel,
  budgetUsageRatio,
  fetchBudgets,
  type BudgetItem,
  type BudgetsClientMessages,
} from "./budgetsClient";

// Matches --space-3 in globals.css — used to account for inter-card spacing
// when balancing column heights (see distributeByHeight).
const MASONRY_GAP_PX = 10;
const MASONRY_SM_BREAKPOINT_PX = 640;

type MasonryColumn = { id: string; budgets: BudgetItem[] };

function distributeRoundRobin(
  items: BudgetItem[],
  columnCount: number,
): BudgetItem[][] {
  const columns: BudgetItem[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, i) => columns[i % columnCount].push(item));
  return columns;
}

/**
 * Greedy shortest-column bin packing: keeps top edges flush (all columns
 * start together) and pulls bottom edges as close to flush as the item
 * heights allow, rather than CSS multi-column's `balance`, which leaves
 * ragged columns once `break-inside: avoid` items are involved.
 */
function distributeByHeight(
  items: BudgetItem[],
  heights: number[],
  columnCount: number,
): BudgetItem[][] {
  const columns: BudgetItem[][] = Array.from({ length: columnCount }, () => []);
  const totals = new Array(columnCount).fill(0);
  items.forEach((item, i) => {
    let shortest = 0;
    for (let c = 1; c < columnCount; c++) {
      if (totals[c] < totals[shortest]) shortest = c;
    }
    columns[shortest].push(item);
    totals[shortest] += heights[i] + MASONRY_GAP_PX;
  });
  return columns;
}

function useIsScreenAtLeast(minWidthPx: number) {
  const query = `(min-width: ${minWidthPx}px)`;
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function useMasonryColumns(items: BudgetItem[], columnCount: number) {
  const key = `${columnCount}|${items.map((item) => item.id).join(",")}`;
  // Naive fallback: renders immediately (including on the server) so the
  // measurement effect below has a same-width, same-order DOM to measure.
  const roundRobinColumns = useMemo(
    () => distributeRoundRobin(items, columnCount),
    [items, columnCount],
  );
  const [measured, setMeasured] = useState<{
    key: string;
    columns: BudgetItem[][];
  } | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const columns =
    measured && measured.key === key ? measured.columns : roundRobinColumns;

  useLayoutEffect(() => {
    if (items.length === 0) return;
    const heights = items.map(
      (item) =>
        cardRefs.current.get(item.id)?.getBoundingClientRect().height ?? 0,
    );
    if (heights.some((height) => height === 0)) return;
    setMeasured({
      key,
      columns: distributeByHeight(items, heights, columnCount),
    });
  }, [key, items, columnCount]);

  function registerCard(budgetId: string) {
    return (el: HTMLElement | null) => {
      if (el) cardRefs.current.set(budgetId, el);
      else cardRefs.current.delete(budgetId);
    };
  }

  return { columns, registerCard };
}

/** Standalone /budgets surface (Story 7.1) — no listId, spans the caller's own budgets. */
export function BudgetsPanel() {
  const { locale, me } = usePreferences();
  const t = listsMessages[locale];
  useChromeHeader({
    leading: me ? (
      <ChromeAvatarLink alias={me.alias} userId={me.user_id} photoBase64={me.photo_base64} />
    ) : null,
    title: t.budgetsTitle,
    trailing: <DocsHelpButton pageName="Budgets" docsAnchor="/docs#budgets" />,
  });
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const lists = useMembershipLists() ?? [];
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isSmUp = useIsScreenAtLeast(MASONRY_SM_BREAKPOINT_PX);

  const columnCount =
    budgets.length === 0
      ? 1
      : budgets.length === 1
        ? 1
        : budgets.length === 2
          ? 2
          : isSmUp
            ? 3
            : 2;

  const { columns, registerCard } = useMasonryColumns(budgets, columnCount);
  const masonryColumns: MasonryColumn[] = columns.map((colBudgets, i) => ({
    id: `col-${i}`,
    budgets: colBudgets,
  }));

  const messages: BudgetsClientMessages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
      errorInvalidBudgetName: t.errorInvalidBudgetName,
      errorInvalidBudgetCap: t.errorInvalidBudgetCap,
      errorInvalidBudgetCurrency: t.errorInvalidBudgetCurrency,
      errorInvalidBudgetSourceLists: t.errorInvalidBudgetSourceLists,
      errorInvalidBudgetPeriod: t.errorInvalidBudgetPeriod,
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
                budgetsPeriodStartLabel: t.budgetsPeriodStartLabel,
                budgetsPeriodEndLabel: t.budgetsPeriodEndLabel,
              }}
              onCreated={onCreated}
            />
            <SectionLabel>{t.budgetsHistoryTitle}</SectionLabel>
          </>
        }
        items={masonryColumns}
        itemKey={(column) => column.id}
        loading={loading}
        loadingLabel={t.budgetsLoading}
        error={loadError}
        emptyLabel={t.budgetsEmpty}
        listClassName="list-none m-0 p-0 flex items-start gap-[var(--space-3)]"
        itemClassName="flex-1 min-w-0 flex flex-col gap-[var(--space-3)]"
        renderItem={(column) => (
          <>
            {column.budgets.map((budget) => {
              const ratio = budgetUsageRatio(budget);
              const usageColorClass = budgetSeverityColorClass(ratio);
              return (
                <Link
                  key={budget.id}
                  ref={registerCard(budget.id)}
                  href={`/budgets/${budget.id}`}
                  className="relative block py-[0.6rem] px-[0.85rem] rounded-[8px] border border-border bg-surface no-underline text-inherit"
                >
                  <div className="absolute top-0 left-0 right-0 rounded-t-[8px] overflow-hidden">
                    <TopProgressBar
                      ratio={ratio}
                      colorClassName={usageColorClass}
                      tooltipLabel={`${formatMoneyAmount(budget.spent, budget.currency)} / ${formatMoneyAmount(budget.cap, budget.currency)}`}
                      ariaLabel={budgetStateLabel(budget.state, t)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="m-0 min-w-0 flex-1 truncate text-foreground">
                      {budget.name}
                    </p>
                    <p className="m-0 tabular-nums text-foreground">
                      {formatMoneyAmount(budget.spent, budget.currency)} /{" "}
                      {formatMoneyAmount(budget.cap, budget.currency)}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                  </div>
                </Link>
              );
            })}
          </>
        )}
      />
    </div>
  );
}
