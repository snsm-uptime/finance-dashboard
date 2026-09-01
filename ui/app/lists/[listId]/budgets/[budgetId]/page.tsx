import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/soft-ledger/SectionLabel";
import { requireAlias } from "@/lib/alias";
import { getApiInternalUrl } from "@/lib/api";
import { formatMoneyAmount } from "@/lib/currency";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";

import { budgetStateLabel } from "../page";
import type { BudgetItem } from "../budgetsClient";
import { BudgetAssignPanel } from "./BudgetAssignPanel";
import { BudgetRulesPanel } from "./BudgetRulesPanel";
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
  const row = data as Partial<BudgetItem> & { history?: unknown; rules?: unknown };
  if (
    typeof row.id !== "string" ||
    typeof row.list_id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.cap !== "string" ||
    typeof row.currency !== "string" ||
    typeof row.spent !== "string" ||
    (row.state !== "ok" && row.state !== "near" && row.state !== "over") ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  const historyRows = Array.isArray(row.history) ? row.history : [];
  const history = historyRows
    .map(asHistoryLine)
    .filter((line): line is BudgetHistoryLine => line !== null);
  const ruleRows = Array.isArray(row.rules) ? row.rules : [];
  const rules = ruleRows.map(asRuleRow).filter((rule): rule is BudgetRuleRow => rule !== null);
  return {
    id: row.id,
    list_id: row.list_id,
    name: row.name,
    cap: row.cap,
    currency: row.currency,
    spent: row.spent,
    state: row.state,
    created_at: row.created_at,
    history,
    rules,
  };
}

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ listId: string; budgetId: string }>;
}) {
  const { listId, budgetId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(
      `/sign-in?returnTo=/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}`,
    );
  }
  await requireAlias(`/lists/${listId}/budgets/${budgetId}`);

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];
  const header = await cookieHeader();

  let budget: BudgetDetail | null = null;
  let loadError = false;
  let notFound = false;
  let budgetNotFound = false;
  try {
    const response = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}`,
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
      redirect(
        `/sign-in?returnTo=/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budgetId)}`,
      );
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
        notFound = true;
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

  return (
    <main className="flex flex-col gap-[var(--space-4)] px-[var(--page-gutter)] py-[var(--space-4)]">
      <p className="m-0">
        <Link className="text-muted" href={`/lists/${encodeURIComponent(listId)}/budgets`}>
          {t.budgetsTitle}
        </Link>
      </p>

      {notFound ? (
        <p role="alert">{t.detailNotFound}</p>
      ) : budgetNotFound ? (
        <p role="alert">{t.budgetNotFound}</p>
      ) : loadError || !budget ? (
        <p role="alert">{t.loadError}</p>
      ) : (
        <>
          <section className="flex flex-col gap-[var(--space-2)] mx-strip-inset">
            <SectionLabel>{budget.name}</SectionLabel>
            <p
              className={`m-0 ${budget.state === "ok" ? "text-muted" : "text-owe font-semibold"}`}
            >
              {budgetStateLabel(budget.state, t)}
            </p>
            <p className="m-0 tabular-nums text-foreground">
              {formatMoneyAmount(budget.spent, budget.currency)} /{" "}
              {formatMoneyAmount(budget.cap, budget.currency)}
            </p>
          </section>

          <section className="flex flex-col gap-[var(--space-3)] mx-strip-inset">
            <SectionLabel>{t.budgetsHistoryTitle}</SectionLabel>
            <BudgetAssignPanel
              listId={listId}
              budgetId={budgetId}
              messages={{ ...t, cancelLabel: t.receiptMoveCancel }}
            />
            {budget.history.length === 0 ? (
              <div
                className="px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
                role="status"
              >
                <p className="m-0 text-muted">{t.budgetsHistoryEmpty}</p>
              </div>
            ) : (
              <ul className="m-0 list-none p-0 flex flex-col gap-[var(--space-2)]">
                {budget.history.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] bg-surface border border-border rounded-sm"
                  >
                    <span className="flex flex-col">
                      <span className="text-foreground">{line.description}</span>
                      <span className="text-muted">
                        {line.attributed_via === "manual"
                          ? t.budgetsHistoryViaManual
                          : t.budgetsHistoryViaRule}
                      </span>
                    </span>
                    <span className="flex items-center gap-[var(--space-2)]">
                      <span className="tabular-nums text-foreground">
                        {formatMoneyAmount(line.amount_crc, "CRC")}
                      </span>
                      {line.attributed_via === "manual" ? (
                        <UnassignButton
                          listId={listId}
                          budgetId={budgetId}
                          entryId={line.id}
                          label={t.budgetsUnassign}
                          messages={t}
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <BudgetRulesPanel
            listId={listId}
            budgetId={budgetId}
            rules={budget.rules}
            messages={t}
          />
        </>
      )}
    </main>
  );
}
