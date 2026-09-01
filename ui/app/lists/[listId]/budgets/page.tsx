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

import { BudgetsCreateForm } from "./BudgetsCreateForm";
import type { BudgetItem } from "./budgetsClient";

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

export type BudgetsPayload = { budgets: BudgetItem[] };

/** Defensive-parse the budgets list response — drops malformed rows, never fabricates. */
export function asBudgets(data: unknown): BudgetsPayload {
  if (!data || typeof data !== "object" || !Array.isArray((data as { budgets?: unknown }).budgets)) {
    return { budgets: [] };
  }
  const rows = (data as { budgets: unknown[] }).budgets;
  const budgets: BudgetItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<BudgetItem>;
    if (
      typeof r.id !== "string" ||
      typeof r.list_id !== "string" ||
      typeof r.name !== "string" ||
      typeof r.cap !== "string" ||
      typeof r.currency !== "string" ||
      typeof r.spent !== "string" ||
      (r.state !== "ok" && r.state !== "near" && r.state !== "over") ||
      typeof r.created_at !== "string"
    ) {
      continue;
    }
    budgets.push({
      id: r.id,
      list_id: r.list_id,
      name: r.name,
      cap: r.cap,
      currency: r.currency,
      spent: r.spent,
      state: r.state,
      created_at: r.created_at,
    });
  }
  return { budgets };
}

export type BudgetStateMessages = {
  budgetsStateOk: string;
  budgetsStateNear: string;
  budgetsStateOver: string;
};

/** Near-cap-state to display label mapping (AC #2 — distinct treatment, not a bare percentage). */
export function budgetStateLabel(state: BudgetItem["state"], t: BudgetStateMessages): string {
  if (state === "over") return t.budgetsStateOver;
  if (state === "near") return t.budgetsStateNear;
  return t.budgetsStateOk;
}

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/lists/${encodeURIComponent(listId)}/budgets`);
  }
  await requireAlias(`/lists/${listId}/budgets`);

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];
  const header = await cookieHeader();

  let budgets: BudgetItem[] = [];
  let loadError = false;
  let notFound = false;
  try {
    const response = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/budgets`,
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
      redirect(`/sign-in?returnTo=/lists/${encodeURIComponent(listId)}/budgets`);
    }
    if (response.status === 404) {
      notFound = true;
    } else if (response.ok) {
      budgets = asBudgets(await response.json()).budgets;
    } else {
      loadError = true;
    }
  } catch {
    loadError = true;
  }

  return (
    <main className="flex flex-col gap-[var(--space-4)] px-[var(--page-gutter)] py-[var(--space-4)]">
      <p className="m-0">
        <Link className="text-muted" href={`/lists/${encodeURIComponent(listId)}`}>
          {t.budgetsBackToList}
        </Link>
      </p>

      {notFound ? (
        <p role="alert">{t.detailNotFound}</p>
      ) : loadError ? (
        <p role="alert">{t.loadError}</p>
      ) : (
        <>
          <section className="flex flex-col gap-[var(--space-3)] mx-strip-inset">
            <SectionLabel>{t.budgetsTitle}</SectionLabel>
            {budgets.length === 0 ? (
              <div
                className="px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
                role="status"
              >
                <p className="m-0 text-muted">{t.budgetsEmpty}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-[var(--space-2)]">
                {budgets.map((budget) => (
                  <Link
                    key={budget.id}
                    href={`/lists/${encodeURIComponent(listId)}/budgets/${encodeURIComponent(budget.id)}`}
                    className="flex items-center justify-between gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] bg-surface border border-border rounded-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-foreground">{budget.name}</p>
                      <p
                        className={`m-0 ${budget.state === "ok" ? "text-muted" : "text-owe font-semibold"}`}
                      >
                        {budgetStateLabel(budget.state, t)}
                      </p>
                    </div>
                    <p className="m-0 tabular-nums text-foreground">
                      {formatMoneyAmount(budget.spent, budget.currency)} /{" "}
                      {formatMoneyAmount(budget.cap, budget.currency)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <BudgetsCreateForm
            listId={listId}
            messages={{
              budgetsCreateTitle: t.budgetsCreateTitle,
              budgetsNameLabel: t.budgetsNameLabel,
              budgetsCapLabel: t.budgetsCapLabel,
              budgetsCurrencyLabel: t.budgetsCurrencyLabel,
              budgetsCreateSubmit: t.budgetsCreateSubmit,
              budgetsCreating: t.budgetsCreating,
              errorGeneric: t.errorGeneric,
              errorUnauthorized: t.errorUnauthorized,
              errorInvalidBudgetName: t.errorInvalidBudgetName,
              errorInvalidBudgetCap: t.errorInvalidBudgetCap,
              errorInvalidBudgetCurrency: t.errorInvalidBudgetCurrency,
            }}
          />
        </>
      )}
    </main>
  );
}
