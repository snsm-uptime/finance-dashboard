import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { Chip } from "@/components/Chip";
import { ReceiptRow } from "@/components/soft-ledger/ReceiptRow";
import { TopProgressBar } from "@/components/TopProgressBar";
import { requireAlias } from "@/lib/alias";
import { getApiInternalUrl } from "@/lib/api";
import { formatMoneyAmount } from "@/lib/currency";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import { memberLabel, type ListMember } from "../../lists/listsClient";
import {
  budgetSeverityColorClass,
  budgetStateLabel,
  budgetUsageRatio,
  formatPeriodBoundShort,
  type BudgetItem,
} from "../budgetsClient";
import { BudgetAssignPanel } from "./BudgetAssignPanel";
import { BudgetDetailChrome } from "./BudgetDetailChrome";
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
  payer_id: string;
  viewer_share_crc: string;
};

export type BudgetRuleRow = {
  id: string;
  match_text: string;
  created_at: string;
};

export type BudgetDetail = BudgetItem & {
  history: BudgetHistoryLine[];
  rules: BudgetRuleRow[];
  is_archived: boolean;
};

function asHistoryLine(data: unknown): BudgetHistoryLine | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BudgetHistoryLine>;
  if (
    typeof row.id !== "string" ||
    typeof row.description !== "string" ||
    typeof row.posted_date !== "string" ||
    typeof row.amount_crc !== "string" ||
    (row.attributed_via !== "manual" && row.attributed_via !== "rule") ||
    typeof row.payer_id !== "string" ||
    typeof row.viewer_share_crc !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    description: row.description,
    posted_date: row.posted_date,
    amount_crc: row.amount_crc,
    attributed_via: row.attributed_via,
    payer_id: row.payer_id,
    viewer_share_crc: row.viewer_share_crc,
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
 * Split-ownership signal for a history line, extracted as a pure function so
 * it can be unit-tested without rendering the async server component (see
 * project-context.md's "never rendered directly in tests" precedent).
 * `viewer_share_crc === amount_crc` means the viewer paid the whole thing
 * solo — no split UI shown, matching a plain ReceiptRow amount.
 */
export function historyRowSplit(
  line: BudgetHistoryLine,
  viewerId: string,
): { polarity: "owe" | "owed" | undefined; isSplit: boolean } {
  const isSplit = line.viewer_share_crc !== line.amount_crc;
  if (!isSplit) return { polarity: undefined, isSplit: false };
  return { polarity: line.payer_id === viewerId ? "owed" : "owe", isSplit: true };
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

function asMembers(data: unknown): ListMember[] {
  if (!data || typeof data !== "object") return [];
  const rows = (data as { members?: unknown }).members;
  if (!Array.isArray(rows)) return [];
  const out: ListMember[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const m = row as { user_id?: unknown; alias?: unknown; photo_base64?: unknown };
    if (typeof m.user_id !== "string") continue;
    out.push({
      user_id: m.user_id,
      alias: typeof m.alias === "string" && m.alias ? m.alias : null,
      photo_base64: typeof m.photo_base64 === "string" ? m.photo_base64 : null,
    });
  }
  return out;
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
    typeof row.created_at !== "string" ||
    typeof row.is_archived !== "boolean"
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
    is_archived: row.is_archived,
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

  let members: ListMember[] = [];
  if (budget && budget.source_list_ids.length > 0) {
    try {
      const memberLists = await Promise.all(
        budget.source_list_ids.map((listId) =>
          fetch(`${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/members`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(header ? { Cookie: header } : {}),
            },
            cache: "no-store",
          })
            .then((res) => (res.ok ? res.json().catch(() => null) : null))
            .then(asMembers)
            .catch(() => []),
        ),
      );
      const byId = new Map<string, ListMember>();
      for (const list of memberLists) {
        for (const member of list) byId.set(member.user_id, member);
      }
      members = [...byId.values()];
    } catch {
      // Payer identity is supplementary — a members-fetch failure silently renders none.
    }
  }

  const ratio = budget ? budgetUsageRatio(budget) : null;

  return (
    <main className="flex flex-col gap-(--space-4) py-(--space-4)">
      {budgetNotFound ? (
        <p role="alert" className="px-(--page-gutter)">
          {t.budgetNotFound}
        </p>
      ) : loadError || !budget ? (
        <p role="alert" className="px-(--page-gutter)">
          {t.loadError}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-(--space-4) px-(--page-gutter)">
            <BudgetDetailChrome
              title={budget.name}
              progressBar={
                <TopProgressBar
                  ratio={ratio}
                  variant="thick"
                  colorClassName={budgetSeverityColorClass(ratio)}
                  startLabel={`${t.budgetsSpentCaption}: ${formatMoneyAmount(budget.spent, budget.currency)}`}
                  endLabel={`${t.budgetsCapCaption}: ${formatMoneyAmount(budget.cap, budget.currency)}`}
                  ariaLabel={budgetStateLabel(budget.state, t)}
                />
              }
              budgetId={budgetId}
              isArchived={budget.is_archived}
              archiveLabel={t.budgetsArchive}
              unarchiveLabel={t.budgetsUnarchive}
              messages={{ ...t, cancelLabel: t.receiptMoveCancel }}
              editAction={
                <BudgetUpdateForm
                  budget={budget}
                  lists={sourceLists}
                  messages={{ ...t, cancelLabel: t.receiptMoveCancel }}
                  locale={locale}
                  rules={budget.rules}
                />
              }
            />

            <section className="flex items-center justify-start gap-(--space-2)">
              <Chip className={budgetStatusChipClassName(budget.state)}>
                {budgetStateLabel(budget.state, t)}
              </Chip>
              {budget.period_start || budget.period_end ? (
                <span className="text-[0.75rem] font-[550] text-muted">
                  {budget.period_start
                    ? formatPeriodBoundShort(budget.period_start, locale)
                    : ""}
                  {budget.period_start && budget.period_end ? " – " : ""}
                  {budget.period_end
                    ? formatPeriodBoundShort(budget.period_end, locale)
                    : ""}
                </span>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {resolveSourceListChips(budget.source_list_ids, sourceLists).map((list) => (
                  <Chip key={list.id} tone="muted">
                    {list.name}
                  </Chip>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-(--space-3)">
              {budget.history.length === 0 ? (
                <div
                  className="flex flex-col items-start gap-(--space-3) px-(--space-4) py-(--space-5) bg-surface border border-border rounded-md"
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
                  <ul className="m-0 list-none p-0 flex flex-col gap-(--space-2)">
                    {budget.history.map((line) => {
                      const { viaLabelKey, showUnassign } =
                        historyRowAttribution(line);
                      const { polarity, isSplit } = historyRowSplit(
                        line,
                        session.user_id,
                      );
                      const payer =
                        isSplit && line.payer_id !== session.user_id
                          ? members.find((m) => m.user_id === line.payer_id)
                          : undefined;
                      return (
                        <li key={line.id} className="list-none">
                          <ReceiptRow
                            title={line.description}
                            when={line.posted_date}
                            secondaryChip={{
                              label: t[viaLabelKey],
                              tone: line.attributed_via === "rule" ? "accent" : "muted",
                            }}
                            originAction={
                              payer ? (
                                <Avatar
                                  alias={memberLabel(payer)}
                                  seed={payer.user_id}
                                  photoBase64={payer.photo_base64}
                                  size="xs"
                                />
                              ) : undefined
                            }
                            amount={
                              isSplit ? undefined : formatMoneyAmount(line.viewer_share_crc, "CRC")
                            }
                            amountInNetColumn
                            directionLabel={
                              polarity === "owe"
                                ? t.balanceOwe
                                : polarity === "owed"
                                  ? t.balanceOwed
                                  : undefined
                            }
                            netLabel={
                              isSplit ? formatMoneyAmount(line.viewer_share_crc, "CRC") : undefined
                            }
                            netPolarity={polarity}
                            menuSlot={
                              showUnassign ? (
                                <UnassignButton
                                  budgetId={budgetId}
                                  entryId={line.id}
                                  label={t.budgetsUnassign}
                                  messages={t}
                                />
                              ) : null
                            }
                          />
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
