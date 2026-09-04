import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Chip } from "@/components/Chip";
import { SectionLabel } from "@/components/soft-ledger/SectionLabel";
import { TopProgressBar } from "@/components/TopProgressBar";
import { requireAlias } from "@/lib/alias";
import { getApiInternalUrl } from "@/lib/api";
import { formatMoneyAmount } from "@/lib/currency";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import {
  budgetSeverityColorClass,
  budgetStateLabel,
  budgetUsageRatio,
  type BudgetItem,
} from "../budgetsClient";
import { BudgetAssignPanel } from "./BudgetAssignPanel";
import { BudgetDetailChrome } from "./BudgetDetailChrome";
import { BudgetRulesPanel } from "./BudgetRulesPanel";
import { BudgetUpdateForm } from "./BudgetUpdateForm";
import { UnassignButton } from "./UnassignButton";

export const dynamic = "force-dynamic";

function resolvePageLocale(languageCookie: string | undefined): Locale {
  if (languageCookie === "es" || languageCookie === "en") return languageCookie;
  return "en";
}

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export type BudgetHistoryLine = {
  id: string;
  description: string;
  posted_date: string;
  amount_crc: string;
  attributed_via: "manual" | "rule";
};

export type BudgetRuleRow = {
  id: string;
  match_text: string;
  created_at: string;
};

export type BudgetDetail = BudgetItem & {
  history: BudgetHistoryLine[];
  rules: BudgetRuleRow[];
};

function asHistoryLine(data: unknown): BudgetHistoryLine | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetHistoryLine>;
  if (
    typeof row.id !== "string" ||
    typeof row.description !== "string" ||
    typeof row.posted_date !== "string" ||
    typeof row.amount_crc !== "string" ||
    (row.attributed_via !== "manual" && row.attributed_via !== "rule")
  ) {
    return null;
  }
  return {
    id: row.id,
    description: row.description,
    posted_date: row.posted_date,
    amount_crc: row.amount_crc,
    attributed_via: row.attributed_via,
  };
}

/**
 * Row-rendering decision for a history line, extracted as a pure function so
 * it can be unit-tested without rendering the async server component (see
 * project-context.md's "never rendered directly in tests" precedent).
 */
export function historyRowAttribution(line: BudgetHistoryLine): {
  viaLabelKey: "budgetsHistoryViaManual" | "budgetsHistoryViaRule";
  showUnassign: boolean;
} {
  const isManual = line.attributed_via === "manual";
  return {
    viaLabelKey: isManual ? "budgetsHistoryViaManual" : "budgetsHistoryViaRule",
    showUnassign: isManual,
  };
}

/**
 * Matches a budget's source-list ids against the caller's lists, dropping
 * any id with no match (a list the user left, or that was deleted) rather
 * than crashing — mirrors BudgetsPanel's `if (!list) return null;`.
 * Extracted as a pure function so it's testable without rendering the async
 * server component (see project-context.md's "never rendered directly in
 * tests" precedent).
 */
export function resolveSourceListChips(
  sourceListIds: string[],
  lists: { id: string; name: string }[],
): { id: string; name: string }[] {
  return sourceListIds
    .map((listId) => lists.find((l) => l.id === listId))
    .filter((list): list is { id: string; name: string } => list !== undefined);
}

/** Border/text color for the status badge below the progress bar — mirrors the bar's own severity tiers. */
function budgetStatusChipClassName(state: BudgetItem["state"]): string {
  if (state === "over") return "border-owe text-owe";
  if (state === "near") return "border-warn text-warn";
  return "border-border text-muted";
}

function asRuleRow(data: unknown): BudgetRuleRow | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetRuleRow>;
  if (
    typeof row.id !== "string" ||
    typeof row.match_text !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return { id: row.id, match_text: row.match_text, created_at: row.created_at };
}

/** Defensive-parse the budget detail response — drops/defaults malformed fields, never fabricates. */
export function asBudgetDetail(data: unknown): BudgetDetail | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetItem> & {
    source_lists?: unknown;
    history?: unknown;
    rules?: unknown;
  };
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.cap !== "string" ||
    typeof row.currency !== "string" ||
    typeof row.spent !== "string" ||
    (row.state !== "ok" && row.state !== "near" && row.state !== "over") ||
    !Array.isArray(row.source_lists) ||
    !row.source_lists.every((id) => typeof id === "string") ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  const historyRows = Array.isArray(row.history) ? row.history : [];
  const history = historyRows
    .map(asHistoryLine)
    .filter((line): line is BudgetHistoryLine => line !== null);
  const ruleRows = Array.isArray(row.rules) ? row.rules : [];
  const rules = ruleRows
    .map(asRuleRow)
    .filter((rule): rule is BudgetRuleRow => rule !== null);
  return {
    id: row.id,
    name: row.name,
    cap: row.cap,
    currency: row.currency,
    spent: row.spent,
    state: row.state,
    source_list_ids: row.source_lists,
    period_start: typeof row.period_start === "string" ? row.period_start : null,
    period_end: typeof row.period_end === "string" ? row.period_end : null,
    created_at: row.created_at,
    history,
    rules,
  };
}

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const { budgetId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/budgets/${encodeURIComponent(budgetId)}`);
  }
  await requireAlias(`/budgets/${budgetId}`);

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];
  const header = await cookieHeader();

  let budget: BudgetDetail | null = null;
  let loadError = false;
  let budgetNotFound = false;
  try {
    const response = await fetch(
      `${getApiInternalUrl()}/budgets/${encodeURIComponent(budgetId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(header ? { Cookie: header } : {}),
        },
        cache: "no-store",
      },
    );
    if (response.status === 401) {
      redirect(`/sign-in?returnTo=/budgets/${encodeURIComponent(budgetId)}`);
    }
    if (response.status === 404) {
      const body: unknown = await response.json().catch(() => null);
      const code =
        body && typeof body === "object" && "code" in body
          ? (body as { code?: unknown }).code
          : undefined;
      if (code === "budget_not_found") {
        budgetNotFound = true;
      } else {
        loadError = true;
      }
    } else if (response.ok) {
      budget = asBudgetDetail(await response.json());
      if (!budget) loadError = true;
    } else {
      loadError = true;
    }
  } catch {
    loadError = true;
  }

  let sourceLists: { id: string; name: string }[] = [];
  if (budget) {
    try {
      const listsResponse = await fetch(`${getApiInternalUrl()}/lists`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(header ? { Cookie: header } : {}),
        },
        cache: "no-store",
      });
      if (listsResponse.ok) {
        const data: unknown = await listsResponse.json().catch(() => null);
        const rows =
          data &&
            typeof data === "object" &&
            Array.isArray((data as { lists?: unknown }).lists)
            ? (data as { lists: unknown[] }).lists
            : [];
        sourceLists = rows.filter(
          (row): row is { id: string; name: string } =>
            !!row &&
            typeof row === "object" &&
            typeof (row as { id?: unknown }).id === "string" &&
            typeof (row as { name?: unknown }).name === "string",
        );
      }
    } catch {
      // Chips are supplementary — a lists-fetch failure silently renders none.
    }
  }

  const ratio = budget ? budgetUsageRatio(budget) : null;

  return (
    <main className="flex flex-col gap-[var(--space-4)] py-[var(--space-4)]">
      {budgetNotFound ? (
        <p role="alert" className="px-[var(--page-gutter)]">
          {t.budgetNotFound}
        </p>
      ) : loadError || !budget ? (
        <p role="alert" className="px-[var(--page-gutter)]">
          {t.loadError}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-[var(--space-4)] px-[var(--page-gutter)]">
            <BudgetDetailChrome
              title={budget.name}
              progressBar={
                <TopProgressBar
                  ratio={ratio}
                  variant="thick"
                  colorClassName={budgetSeverityColorClass(ratio)}
                  startLabel={formatMoneyAmount(budget.spent, budget.currency)}
                  endLabel={formatMoneyAmount(budget.cap, budget.currency)}
                  ariaLabel={budgetStateLabel(budget.state, t)}
                />
              }
            />

            <section className="flex flex-col gap-[var(--space-1)]">
              <div className="flex items-center justify-between px-[var(--space-1)]">
                <span className="text-[0.7rem] text-muted">
                  {t.budgetsSpentCaption} · {formatMoneyAmount(budget.spent, budget.currency)}
                </span>
                <span className="text-[0.7rem] text-muted">
                  {t.budgetsCapCaption} · {formatMoneyAmount(budget.cap, budget.currency)}
                </span>
              </div>
              <div>
                <Chip className={budgetStatusChipClassName(budget.state)}>
                  {budgetStateLabel(budget.state, t)}
                </Chip>
              </div>
            </section>

            <section className="flex flex-col gap-[var(--space-2)]">
              <SectionLabel>{t.budgetsSourcesHeading}</SectionLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {resolveSourceListChips(budget.source_list_ids, sourceLists).map((list) => (
                  <Chip key={list.id} tone="muted">
                    {list.name}
                  </Chip>
                ))}
                <BudgetUpdateForm
                  budget={budget}
                  lists={sourceLists}
                  messages={{ ...t, cancelLabel: t.receiptMoveCancel }}
                  locale={locale}
                />
              </div>
            </section>

            <section className="flex flex-col gap-[var(--space-3)]">
              <BudgetRulesPanel
                budgetId={budgetId}
                rules={budget.rules}
                messages={t}
              />
              {budget.history.length === 0 ? (
                <div
                  className="flex flex-col items-start gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
                  role="status"
                >
                  <p className="m-0 text-muted">{t.budgetsHistoryEmpty}</p>
                  <BudgetAssignPanel
                    budgetId={budgetId}
                    messages={{ ...t, cancelLabel: t.receiptMoveCancel }}
                  />
                </div>
              ) : (
                <>
                  <BudgetAssignPanel
                    budgetId={budgetId}
                    messages={{ ...t, cancelLabel: t.receiptMoveCancel }}
                  />
                  <ul className="m-0 list-none p-0 flex flex-col gap-[var(--space-2)]">
                    {budget.history.map((line) => {
                    const { viaLabelKey, showUnassign } =
                      historyRowAttribution(line);
                    return (
                      <li
                        key={line.id}
                        className="flex items-center justify-between gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] bg-surface border border-border rounded-sm"
                      >
                        <span className="flex flex-col">
                          <span className="text-foreground">
                            {line.description}
                          </span>
                          <span className="text-muted">{t[viaLabelKey]}</span>
                        </span>
                        <span className="flex items-center gap-[var(--space-2)]">
                          <span className="tabular-nums text-foreground">
                            {formatMoneyAmount(line.amount_crc, "CRC")}
                          </span>
                          {showUnassign ? (
                            <UnassignButton
                              budgetId={budgetId}
                              entryId={line.id}
                              label={t.budgetsUnassign}
                              messages={t}
                            />
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                  </ul>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
